import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { lookupReferral, registerReferredClient } from "@/lib/agents.functions";
import { KalexiMark } from "@/components/KalexiMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/r/$code")({
  head: () => ({
    meta: [
      { title: "Register with Kalexi Brokerage" },
      { name: "description", content: "Tell Kalexi Brokerage what you need — property, minerals, energy, agriculture and more." },
      { property: "og:title", content: "Register with Kalexi Brokerage" },
      { property: "og:description", content: "Tell Kalexi Brokerage what you need — property, minerals, energy, agriculture and more." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralRegister,
});

const TYPES = ["Buyer", "Seller", "Supplier", "Investor", "Landlord", "Tenant", "Other"];
const SECTORS = ["Real Estate", "Minerals", "Petroleum & Energy", "Agriculture", "Commercial", "Other"];

function ReferralRegister() {
  const { code } = useParams({ from: "/r/$code" });
  const ref = useQuery({ queryKey: ["ref", code], queryFn: () => lookupReferral({ data: { code } }) });
  const [f, setF] = useState({ fullName: "", phone: "", email: "", clientType: "Buyer", sector: "Real Estate", requirement: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    try {
      const r = await registerReferredClient({ data: { ...f, code: ref.data ? code : null } });
      setDone(r.reference);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const sel = "h-9 w-full rounded-md border bg-background px-3 text-sm";

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <span aria-hidden className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative mx-auto max-w-xl rounded-xl border bg-card/90 p-6 shadow-[var(--shadow-panel)] backdrop-blur md:p-8">
        <div className="mb-6 flex items-center gap-3 border-b pb-5">
          <KalexiMark className="h-10 w-10" />
          <div><p className="font-display font-semibold">KALEXI BROKERAGE LTD</p>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Client registration</p></div>
        </div>
        {done ? (
          <div className="space-y-2"><h1 className="font-display text-xl font-semibold">Thank you!</h1>
            <p className="text-sm text-muted-foreground">Your reference is <b className="text-foreground">{done}</b>. A Kalexi officer will contact you shortly.</p></div>
        ) : (
          <div className="space-y-4">
            {ref.data ? <p className="rounded-lg bg-primary/10 p-3 text-sm">Referred by Kalexi agent <b>{ref.data.agentName}</b>.</p> : null}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Full name *</Label><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone *</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>I am a *</Label><select className={sel} value={f.clientType} onChange={(e) => setF({ ...f, clientType: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div className="space-y-1.5"><Label>Sector *</Label><select className={sel} value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })}>{SECTORS.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div className="space-y-1.5 md:col-span-2"><Label>What do you need? *</Label>
                <textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={f.requirement} onChange={(e) => setF({ ...f, requirement: e.target.value })} /></div>
            </div>
            <Button className="w-full" disabled={busy || !f.fullName || !f.phone || f.requirement.length < 5} onClick={submit}>{busy ? "Sending…" : "Register"}</Button>
          </div>
        )}
      </div>
    </main>
  );
}
