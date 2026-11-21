import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
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
    data: { success: boolean; client_ref: string } | null;
    error: { message: string } | null;
  }>;
};

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

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    company_name: "",
    client_type: "Buyer",
    sector: "Real Estate",
    requirement: "",
  });

  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");

  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      const { data, error } = await rpc.rpc("submit_client_registration", {
        p_token: token,
        p_full_name: form.full_name,
        p_phone: form.phone,
        p_email: form.email,
        p_company_name: form.company_name,
        p_client_type: form.client_type,
        p_sector: form.sector,
        p_requirement: form.requirement,
      });

      if (error) throw error;
      if (!data?.client_ref) throw new Error("Registration confirmation was not returned.");

      setReference(data.client_ref);
      toast.success("Your registration has been received.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary";

  if (reference) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-5">
        <Card className="w-full max-w-xl">
          <CardContent className="space-y-4 p-8 text-center">
            <h1 className="text-2xl font-bold">Registration received</h1>
            <p className="text-sm text-muted-foreground">
              Your information has been submitted to Kalexi Brokerage.
            </p>
            <div className="rounded-lg border p-5">
              <p className="text-xs text-muted-foreground">Your Kalexi Client ID</p>
              <p className="mt-2 text-2xl font-bold">{reference}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Your registration is pending verification. This is not confirmation
              that a transaction or service has been approved.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="text-center">
          <p className="font-bold tracking-widest text-primary">KALEXI BROKERAGE</p>
          <h1 className="mt-3 text-3xl font-bold">Client registration</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete this form to register directly with Kalexi.
          </p>
        </header>

        <Card>
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium">Full legal name *</label>
                <input required maxLength={120} className={fieldClass}
                  value={form.full_name}
                  onChange={(e) => update("full_name", e.target.value)} />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Phone number *</label>
                <input required type="tel" maxLength={30} className={fieldClass}
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)} />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Email address</label>
                <input type="email" maxLength={255} className={fieldClass}
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)} />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Company name</label>
                <input maxLength={160} className={fieldClass}
                  value={form.company_name}
                  onChange={(e) => update("company_name", e.target.value)} />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">Client type *</label>
                  <select className={fieldClass} value={form.client_type}
                    onChange={(e) => update("client_type", e.target.value)}>
                    {["Buyer","Seller","Supplier","Investor","Landlord","Tenant","Other"].map(x =>
                      <option key={x}>{x}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Sector *</label>
                  <select className={fieldClass} value={form.sector}
                    onChange={(e) => update("sector", e.target.value)}>
                    {["Real Estate","Minerals","Petroleum & Energy","Agriculture","Commercial","Other"].map(x =>
                      <option key={x}>{x}</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Describe the service or transaction you need *
                </label>
                <textarea required minLength={5} maxLength={2000} rows={5}
                  className={fieldClass} value={form.requirement}
                  onChange={(e) => update("requirement", e.target.value)} />
              </div>

              <p className="text-xs text-muted-foreground">
                By submitting, you confirm that the information provided is accurate
                and may be used by Kalexi for registration and verification.
              </p>

              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Submitting registration..." : "Submit client registration"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Kalexi Brokerage · Making the transaction secure is our mission.
        </p>
      </div>
    </main>
  );
}
