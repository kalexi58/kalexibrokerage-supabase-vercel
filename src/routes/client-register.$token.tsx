import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type RegistrationRpc = {
  rpc: (
    name: "submit_client_registration",
    args: {
      p_token: string;
      p_full_name: string;
      p_phone: string;
      p_email: string;
      p_company_name: string;
      p_client_type: string;
      p_sector: string;
      p_requirement: string;
    }
  ) => Promise<{
    data: string | null;
    error: { message: string } | null;
  }>;
};

const BUCKET = "client-registration-attachments";
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_FILES = 12;

export const Route = createFileRoute("/client-register/$token")({
  head: () => ({
    meta: [
      { title: "Client Registration | Kalexi Brokerage" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PublicClientRegistration,
});

function PublicClientRegistration() {
  const { token } = Route.useParams();
  const rpc = supabase as unknown as RegistrationRpc;
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("KALEXI BROKERAGE LTD");

  useEffect(() => {
    let active = true;

    async function loadSystemBranding() {
      try {
        const brandingClient = supabase as any;
        const { data, error } = await brandingClient
          .from("company_branding")
          .select("*")
          .limit(1)
          .maybeSingle();

        if (error || !data) {
          console.error("Could not load company branding:", error);
          return;
        }

        const findValue = (object: any, pattern: RegExp): string | null => {
          if (!object || typeof object !== "object") return null;

          for (const [key, value] of Object.entries(object)) {
            if (pattern.test(key) && typeof value === "string" && value.trim()) {
              return value.trim();
            }
          }

          for (const value of Object.values(object)) {
            if (value && typeof value === "object") {
              const found = findValue(value, pattern);
              if (found) return found;
            }
          }

          return null;
        };

        const logoValue =
          findValue(data, /logo.*(url|path|image)?|brand.*logo/i) ||
          findValue(data, /logo/i);

        const nameValue =
          findValue(data, /company.*name|business.*name|brand.*name/i);

        let logoUrl: string | null = null;

        if (logoValue) {
          if (/^https?:\/\//i.test(logoValue)) {
            logoUrl = logoValue;
          } else {
            const path = logoValue.replace(/^\/+/, "").replace(/^company-branding\//, "");
            const { data: publicData } = supabase.storage
              .from("company-branding")
              .getPublicUrl(path);

            logoUrl = publicData.publicUrl;
          }
        }

        if (active) {
          if (logoUrl) setCompanyLogo(logoUrl);
          if (nameValue) setCompanyName(nameValue);
        }
      } catch (error) {
        console.error("System branding could not be loaded:", error);
      }
    }

    loadSystemBranding();

    return () => {
      active = false;
    };
  }, []);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    company_name: "",
    client_type: "Buyer",
    sector: "Real Estate",
    requirement: "",
  });

  const [photo, setPhoto] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [uploadWarning, setUploadWarning] = useState("");

  function update(key: keyof typeof form, value: string) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  function validateFile(file: File) {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`${file.name} exceeds the 15 MB file limit.`);
    }

    const allowed = [
      "image/jpeg", "image/png", "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "video/mp4", "video/quicktime",
    ];

    if (!allowed.includes(file.type)) {
      throw new Error(`${file.name} has an unsupported file format.`);
    }
  }

  function addFiles(selected: FileList | null) {
    if (!selected) return;

    try {
      const incoming = Array.from(selected);
      incoming.forEach(validateFile);

      const combined = [...files, ...incoming];

      if (combined.length > MAX_FILES) {
        throw new Error(`You can attach a maximum of ${MAX_FILES} files.`);
      }

      setFiles(combined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid attachment.");
    }
  }

  async function uploadFile(file: File, clientRef: string, index: number) {
    const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "file";
    const safeName = `${Date.now()}-${index}.${extension}`;
    const path = `${clientRef}/${safeName}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });

    if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);

    return {
      name: file.name,
      path,
      type: file.type,
      size: file.size,
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    if (!form.full_name.trim() || !form.phone.trim() || !form.requirement.trim()) {
      toast.error("Complete all required fields.");
      return;
    }

    if (files.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} attachments allowed.`);
      return;
    }

    setBusy(true);
    setUploadWarning("");
    setUploaded([]);

    try {
      const { data, error } = await rpc.rpc("submit_client_registration", {
        p_token: token,
        p_full_name: form.full_name.trim(),
        p_phone: form.phone.trim(),
        p_email: form.email.trim(),
        p_company_name: form.company_name.trim(),
        p_client_type: form.client_type,
        p_sector: form.sector,
        p_requirement: form.requirement.trim(),
      });

      if (error) {
        const message = error.message || "Registration failed.";
        if (/duplicate|already exists|already registered|already with/i.test(message)) {
          throw new Error("This client may already be registered with Kalexi. Please contact our office to verify the existing record.");
        }
        throw new Error(message);
      }

      if (!data?.trim()) {
        throw new Error("Registration confirmation was not returned.");
      }

      setReference(data.trim());

      const allFiles = [
        ...(photo ? [photo] : []),
        ...files,
      ];

      if (allFiles.length) {
        try {
          const results = [];

          for (let i = 0; i < allFiles.length; i++) {
            const result = await uploadFile(allFiles[i], data.trim(), i);
            results.push(result.path);
          }

          setUploaded(results);
        } catch (uploadError) {
          setUploadWarning(
            uploadError instanceof Error
              ? uploadError.message
              : "Some attachments could not be uploaded."
          );
        }
      }

      toast.success("Your registration has been received.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10";

  if (reference) {
    return (
      <main className="min-h-screen bg-[#f3f6fb] px-4 py-10 sm:px-6">
      <style>{`
        body { background: #f3f6fb; }
        input, textarea, select { transition: border-color .2s ease, box-shadow .2s ease; }
        input:focus, textarea:focus, select:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 4px rgba(37,99,235,.09);
          outline: none;
        }
        input[type=file] { background: #f8faff; border-style: dashed; }
        input[type=file]::file-selector-button {
          cursor: pointer;
          border: 0;
          border-radius: 8px;
          background: #e8f0ff;
          color: #17447c;
          padding: 9px 14px;
          margin-right: 12px;
          font-weight: 600;
        }
        @media print {
          body { background: white !important; }
        }
      `}</style>
        <div className="mx-auto max-w-2xl">
          <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,35,65,0.08)]">
            <CardContent className="space-y-5 p-6 text-center sm:p-9">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
                ✓
              </div>

              <p className="font-bold tracking-[0.22em] text-[#17447c]">KALEXI BROKERAGE</p>
              <h1 className="text-3xl font-bold tracking-tight text-[#102747]">Registration acknowledgement</h1>
              <p className="text-sm text-muted-foreground">
                Your registration information has been received.
              </p>

              <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-[#edf4ff] to-white p-7 shadow-inner">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Kalexi Client ID
                </p>
                <p className="mt-2 break-all text-3xl font-bold">{reference}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Registration acknowledgement reference
                </p>
              </div>

              <div className="space-y-2 text-left text-sm">
                <p><strong>Client:</strong> {form.full_name}</p>
                <p><strong>Phone:</strong> {form.phone}</p>
                {form.email && <p><strong>Email:</strong> {form.email}</p>}
                {form.company_name && <p><strong>Company:</strong> {form.company_name}</p>}
                <p><strong>Client type:</strong> {form.client_type}</p>
                <p><strong>Sector:</strong> {form.sector}</p>
                <p><strong>Submitted:</strong> {new Date().toLocaleString()}</p>
                <p><strong>Attachments selected:</strong> {files.length + (photo ? 1 : 0)}</p>
              </div>

              {uploadWarning && (
                <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-left text-sm text-amber-900">
                  Registration succeeded, but an attachment upload failed: {uploadWarning}
                </div>
              )}

              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                Your registration is pending verification. This acknowledgement is not
                confirmation that a transaction, service, or KYC verification has been approved.
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button className="flex-1" onClick={() => window.print()}>
                  Print acknowledgement
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => window.location.reload()}>
                  Close
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Kalexi Brokerage Ltd · info@kalexibrokerage.com · www.kalexibrokerage.com
              </p>
              <p className="text-xs text-muted-foreground">
                Making the transaction secure is our mission.
              </p>
            </CardContent>
          </Card>
        </div>

        <style>{`
          @media print {
            body { background: white !important; }
            button { display: none !important; }
            main { padding: 0 !important; background: white !important; }
            main > div { max-width: 100% !important; }
            [data-slot="card"] { border: 0 !important; box-shadow: none !important; }
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f6fb] px-4 py-10 sm:px-6">
      <style>{`
        body { background: #f3f6fb; }
        input, textarea, select { transition: border-color .2s ease, box-shadow .2s ease; }
        input:focus, textarea:focus, select:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 4px rgba(37,99,235,.09);
          outline: none;
        }
        input[type=file] { background: #f8faff; border-style: dashed; }
        input[type=file]::file-selector-button {
          cursor: pointer;
          border: 0;
          border-radius: 8px;
          background: #e8f0ff;
          color: #17447c;
          padding: 9px 14px;
          margin-right: 12px;
          font-weight: 600;
        }
        @media print {
          body { background: white !important; }
        }
      `}</style>
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="text-center">
          {companyLogo ? (
            <img
              src={companyLogo}
              alt={`${companyName} logo`}
              className="mx-auto mb-4 h-20 max-w-[240px] object-contain"
              onError={() => setCompanyLogo(null)}
            />
          ) : (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-xl font-black text-primary-foreground">
              K
            </div>
          )}
          <p className="font-bold tracking-[0.22em] text-[#17447c]">{companyName}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#102747] sm:text-4xl">Client registration</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
            Register directly with Kalexi Brokerage.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Making the transaction secure is our mission.
          </p>
        </header>

        <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,35,65,0.08)]">
          <CardContent className="p-6 sm:p-10">
            <form onSubmit={submit} className="space-y-9">
              <section className="space-y-5 rounded-xl border border-slate-100 bg-white p-4 sm:p-6">
                <h2 className="border-b border-slate-200 pb-3 text-lg font-bold tracking-tight text-[#102747]">Personal and company information</h2>

                <div>
                  <label className="mb-2 block text-sm font-medium">Full legal name *</label>
                  <input required maxLength={120} className={fieldClass}
                    value={form.full_name}
                    onChange={e => update("full_name", e.target.value)} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium">Phone number *</label>
                    <input required type="tel" maxLength={30} className={fieldClass}
                      value={form.phone}
                      onChange={e => update("phone", e.target.value)} />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Email address</label>
                    <input type="email" maxLength={255} className={fieldClass}
                      value={form.email}
                      onChange={e => update("email", e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Company name</label>
                  <input maxLength={160} className={fieldClass}
                    value={form.company_name}
                    onChange={e => update("company_name", e.target.value)} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium">Client type *</label>
                    <select className={fieldClass} value={form.client_type}
                      onChange={e => update("client_type", e.target.value)}>
                      {["Buyer", "Seller", "Supplier", "Investor", "Landlord", "Tenant", "Other"].map(x =>
                        <option key={x}>{x}</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Sector *</label>
                    <select className={fieldClass} value={form.sector}
                      onChange={e => update("sector", e.target.value)}>
                      {["Real Estate", "Minerals", "Petroleum & Energy", "Agriculture", "Commercial", "Other"].map(x =>
                        <option key={x}>{x}</option>
                      )}
                    </select>
                  </div>
                </div>
              </section>

              <section className="space-y-5 rounded-xl border border-slate-100 bg-white p-4 sm:p-6">
                <h2 className="border-b border-slate-200 pb-3 text-lg font-bold tracking-tight text-[#102747]">Service or transaction requirement</h2>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Describe the service or transaction you need *
                  </label>
                  <textarea required minLength={5} maxLength={2000} rows={5}
                    className={fieldClass} value={form.requirement}
                    onChange={e => update("requirement", e.target.value)} />
                </div>
              </section>

              <section className="space-y-5 rounded-xl border border-slate-100 bg-white p-4 sm:p-6">
                <h2 className="border-b border-slate-200 pb-3 text-lg font-bold tracking-tight text-[#102747]">Profile photograph</h2>
                <p className="text-sm text-muted-foreground">
                  Upload a clear profile photograph. JPG, PNG or WEBP, maximum 15 MB.
                </p>
                <input type="file" accept="image/jpeg,image/png,image/webp"
                  className={`${fieldClass} cursor-pointer file:mr-4 file:rounded-lg file:border-0 file:bg-[#eaf1ff] file:px-4 file:py-2 file:font-semibold file:text-blue-800`}
                  onChange={e => {
                    const selected = e.target.files?.[0] || null;
                    if (selected) {
                      try {
                        validateFile(selected);
                        setPhoto(selected);
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Invalid photograph.");
                        e.target.value = "";
                      }
                    }
                  }} />
                {photo && <p className="text-xs text-muted-foreground">Selected: {photo.name}</p>}
              </section>

              <section className="space-y-5 rounded-xl border border-slate-100 bg-white p-4 sm:p-6">
                <h2 className="border-b border-slate-200 pb-3 text-lg font-bold tracking-tight text-[#102747]">Supporting documents and media</h2>
                <p className="text-sm text-muted-foreground">
                  Attach relevant images, videos, PDF files, Word documents or spreadsheets.
                  Maximum 12 files, 15 MB per file.
                </p>
                <input type="file" multiple
                  accept="image/*,video/mp4,video/quicktime,.pdf,.doc,.docx,.xls,.xlsx"
                  className={`${fieldClass} cursor-pointer file:mr-4 file:rounded-lg file:border-0 file:bg-[#eaf1ff] file:px-4 file:py-2 file:font-semibold file:text-blue-800`}
                  onChange={e => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }} />

                {files.length > 0 && (
                  <div className="space-y-2 rounded-lg border p-3">
                    {files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 break-all">{file.name}</span>
                        <button type="button" className="shrink-0 text-destructive"
                          onClick={() => setFiles(current => current.filter((_, i) => i !== index))}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className="rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground">
                By submitting, you confirm that the information supplied is accurate and may
                be used by Kalexi Brokerage Ltd for registration, communication and verification.
                Submission does not constitute transaction approval.
              </div>

              <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-[#12386b] text-sm font-bold tracking-wide text-white shadow-lg shadow-blue-950/15 transition hover:bg-[#0c2a50]">
                {busy ? "Submitting registration..." : "Submit client registration"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <footer className="space-y-1 text-center text-xs font-medium tracking-wide text-slate-500">
          <p>Kalexi Brokerage Ltd</p>
          <p>info@kalexibrokerage.com · www.kalexibrokerage.com</p>
          <p>Making the transaction secure is our mission.</p>
        </footer>
      </div>
    </main>
  );
}



