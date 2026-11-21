import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createAgentUpload, getAgentCampaign, matchAgentRegistry, submitAgentApplication } from "@/lib/agents.functions";
import { KalexiMark } from "@/components/KalexiMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/join/$token")({
  head: () => ({
    meta: [
      { title: "Become a Kalexi Digital Agent" },
      { name: "description", content: "Apply to join the Kalexi Brokerage Digital Agent Programme." },
      { property: "og:title", content: "Become a Kalexi Digital Agent" },
      { property: "og:description", content: "Apply to join the Kalexi Brokerage Digital Agent Programme." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JoinPage,
});

const STEPS = ["Personal", "Identity", "Payment", "Declarations", "Review"];
type K = "regId"|"village"|"fullName"|"phone"|"email"|"dateOfBirth"|"gender"|"nationality"|"address"|"district"|"occupation"|"idType"|"idNumber"|"paymentMethod"|"paymentProvider"|"paymentAccountName"|"paymentAccountNumber"|"password"|"password2";
type F = Partial<Record<K, string>>;
type FK = "photo"|"idFront"|"idBack";

function JoinPage() {
  const { token } = useParams({ from: "/join/$token" });
  const campaign = useQuery({ queryKey: ["agent-campaign", token], queryFn: () => getAgentCampaign({ data: { token } }) });
  const [step, setStep] = useState(0);
  const [f, setF] = useState<F>({ paymentMethod: "mobile_money", idType: "National ID" });
  const [files, setFiles] = useState<Partial<Record<FK, File | null>>>({});
  const [decl, setDecl] = useState({ accurate: false, terms: false, conduct: false, consent: false });
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<{ id: string; regId: string; fullName: string; village: string | null; district: string | null } | null>(null);
  async function lookup() {
    if (match) return;
    try {
      const r = await matchAgentRegistry({ data: { token, regId: f.regId || null, phone: f.phone || null } });
      if (r) {
        setMatch(r);
        setF((prev) => ({ ...prev, fullName: prev.fullName || r.fullName, phone: prev.phone || r.phone || "", village: prev.village || r.village || "", district: prev.district || r.district || "" }));
        toast.success("We found your field registration — your details are linked. Please complete the rest.");
      }
    } catch { /* ignore */ }
  }
  const [done, setDone] = useState<string | null>(null);
  const set = (k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function validStep(): string | null {
    if (step === 0 && (!f.fullName || !f.phone || !f.email)) return "Full name, phone and email are required.";
    if (step === 0 && (!f.password || f.password.length < 8)) return "Create a password of at least 8 characters.";
    if (step === 0 && f.password !== f.password2) return "Passwords do not match.";
    if (step === 1 && (!f.idNumber || !files.photo || !files.idFront)) return "ID number, passport photo and ID front are required.";
    if (step === 2 && (!f.paymentAccountName || !f.paymentAccountNumber)) return "Payment account details are required.";
    if (step === 3 && !Object.values(decl).every(Boolean)) return "Please accept all declarations.";
    return null;
  }

  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10MB.`);
    const slot = await createAgentUpload({ data: { token, fileName: file.name } });
    const { error } = await supabase.storage.from(slot.bucket).uploadToSignedUrl(slot.path, slot.uploadToken, file);
    if (error) throw new Error(`Upload failed for ${file.name}.`);
    return slot.path;
  }

  async function submit() {
    const { fullName, phone, email, password, idType, idNumber, paymentAccountName, paymentAccountNumber } = f;
    const photo = files.photo; const idFront = files.idFront;
    if (!fullName || !phone || !email || !password || !idType || !idNumber || !paymentAccountName || !paymentAccountNumber || !photo || !idFront) {
      toast.error("Please complete all required details."); return;
    }
    setBusy(true);
    try {
      const photoPath = await upload(photo);
      const idFrontPath = await upload(idFront);
      const idBackPath = files.idBack ? await upload(files.idBack) : null;
      const r = await submitAgentApplication({
        data: {
          token, fullName, phone, email, dateOfBirth: f.dateOfBirth, gender: f.gender,
          nationality: f.nationality, address: f.address, district: f.district, occupation: f.occupation,
          idType, idNumber, photoPath, idFrontPath, idBackPath,
          paymentMethod: f.paymentMethod as "mobile_money" | "bank", paymentProvider: f.paymentProvider,
          paymentAccountName, paymentAccountNumber,
          password, registryId: match?.id ?? null, village: f.village,
          declarations: decl as never,
        },
      });
      setDone(r.reference);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shell = (body: React.ReactNode) => (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <span aria-hidden className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative mx-auto w-full max-w-2xl rounded-xl border bg-card/90 p-6 shadow-[var(--shadow-panel)] backdrop-blur md:p-8">
        <div className="mb-6 flex items-center gap-3 border-b pb-5">
          <KalexiMark className="h-10 w-10" />
          <div>
            <p className="font-display font-semibold">KALEXI BROKERAGE LTD</p>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Digital Agent Programme</p>
          </div>
        </div>
        {body}
      </div>
    </main>
  );

  if (campaign.isLoading) return shell(<p className="text-sm text-muted-foreground">Loading…</p>);
  if (!campaign.data || !campaign.data.open)
    return shell(<p className="text-sm">This registration link is not available or has closed. Please contact Kalexi Brokerage.</p>);
  if (done)
    return shell(
      <div className="space-y-2">
        <h1 className="font-display text-xl font-semibold">Application received</h1>
        <p className="text-sm text-muted-foreground">Your reference is <b className="text-foreground">{done}</b>. Our team will review your details. You can already sign in with your email and password to see your dashboard.</p>
        <a href="/" className="inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Sign in now</a>
      </div>,
    );

  const inp = (k: K, label: string, type = "text") => (
    <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={f[k] ?? ""} onChange={set(k)} onBlur={k === "regId" || k === "phone" ? lookup : undefined} /></div>
  );
  const fileInp = (k: FK, label: string) => (
    <div className="space-y-1.5"><Label>{label}</Label>
      <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFiles({ ...files, [k]: e.target.files?.[0] ?? null })} />
      {files[k] ? <p className="text-xs text-muted-foreground">{files[k]?.name}</p> : null}
    </div>
  );

  return shell(
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold">{campaign.data.title}</h1>
        <div className="mt-3 flex gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <p className="mt-1 text-[11px] text-muted-foreground">{s}</p>
            </div>
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {match ? (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm md:col-span-2">
              Linked to field registration <b>{match.regId}</b> — {match.fullName}{match.village ? `, ${match.village}` : ""}. Continue with the remaining details.
            </div>
          ) : null}
          {inp("regId", "Field registration ID (if you have one)")}
          {inp("fullName", "Full name *")}{inp("phone", "Phone *")}{inp("email", "Email *", "email")}
          {inp("dateOfBirth", "Date of birth", "date")}{inp("gender", "Gender")}{inp("nationality", "Nationality")}
          {inp("village", "Village")}{inp("district", "District / City")}{inp("occupation", "Occupation")}
          <div className="md:col-span-2">{inp("address", "Physical address")}</div>
          <div className="rounded-lg border bg-muted/40 p-3 md:col-span-2">
            <p className="mb-2 text-sm font-medium">Create your agent sign-in</p>
            <p className="mb-3 text-xs text-muted-foreground">You'll sign in with your email and this password. You can open your dashboard straight away; your ID card unlocks after verification.</p>
            <div className="grid gap-3 md:grid-cols-2">{inp("password", "Password *", "password")}{inp("password2", "Confirm password *", "password")}</div>
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label>ID type *</Label>
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={f.idType} onChange={set("idType")}>
              <option>National ID</option><option>Passport</option><option>Driving Permit</option>
            </select></div>
          {inp("idNumber", "ID number *")}
          {fileInp("photo", "Passport photo *")}{fileInp("idFront", "ID front *")}{fileInp("idBack", "ID back")}
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label>Payment method *</Label>
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={f.paymentMethod} onChange={set("paymentMethod")}>
              <option value="mobile_money">Mobile money</option><option value="bank">Bank account</option>
            </select></div>
          {inp("paymentProvider", f.paymentMethod === "bank" ? "Bank name" : "Network (e.g. MTN, Airtel)")}
          {inp("paymentAccountName", "Account name *")}{inp("paymentAccountNumber", f.paymentMethod === "bank" ? "Account number *" : "Mobile number *")}
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3 text-sm">
          {([
            ["accurate", "I confirm the information I have given is true and accurate."],
            ["terms", "I accept the Kalexi Digital Agent Programme terms, including commission of 0.9% on eligible completed transactions."],
            ["conduct", "I will act honestly and never misrepresent Kalexi Brokerage Ltd."],
            ["consent", "I consent to Kalexi verifying my identity and processing my data."],
          ] as const).map(([k, t]) => (
            <label key={k} className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" checked={decl[k]} onChange={(e) => setDecl({ ...decl, [k]: e.target.checked })} />
              <span>{t}</span>
            </label>
          ))}
        </div>
      )}
      {step === 4 && (
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          {[["Name", f.fullName], ["Phone", f.phone], ["Email", f.email], ["District", f.district], ["ID", `${f.idType} · ${f.idNumber}`],
            ["Payment", `${f.paymentMethod === "bank" ? "Bank" : "Mobile money"} · ${f.paymentAccountNumber}`],
            ["Files", [files.photo, files.idFront, files.idBack].filter(Boolean).length + " attached"]].map(([k, v]) => (
            <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v || "—"}</dd></div>
          ))}
        </dl>
      )}

      <div className="flex justify-between border-t pt-4">
        <Button variant="outline" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>Back</Button>
        {step < 4 ? (
          <Button onClick={() => { const e = validStep(); if (e) toast.error(e); else setStep(step + 1); }}>Continue</Button>
        ) : (
          <Button disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit application"}</Button>
        )}
      </div>
    </div>,
  );
}
