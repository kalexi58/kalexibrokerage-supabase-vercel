import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { FilePlus2, Save, Printer, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { KalexiMark } from "@/components/KalexiMark";
import { BrandAppearanceSettings } from "@/components/BrandAppearanceSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession, logAudit } from "@/hooks/useSession";
import { NoAccess } from "@/components/records";
import { supabase } from "@/integrations/supabase/client";
import { createBrandSignatureUpload, getBrandSignature } from "@/lib/brand.functions";
import type { Database } from "@/integrations/supabase/types";

type Template = Database["public"]["Tables"]["brand_templates"]["Row"];
type Draft = Pick<Template, "name" | "kind" | "heading" | "body" | "doc_date" | "signatory_name" | "signatory_title" | "signature_path" | "accent">;
const fresh = (): Draft => ({ name: "", kind: "letter", heading: "", body: "", doc_date: new Date().toISOString().slice(0, 10), signatory_name: "", signatory_title: "", signature_path: null, accent: "gold" });
const KIND_LABEL: Record<string, string> = { letter: "Official correspondence", notice: "Company notice", certificate: "Official certificate", memo: "Internal memo", appointment: "Letter of appointment", authorization: "Agent authorisation", invoice: "Invoice letterhead" };
const PRESETS: Partial<Draft>[] = [
  { name: "Agent authorisation", kind: "authorization", heading: "Letter of Authorisation", body: "This is to confirm that [Agent name], Agent ID [KBL-AG-000000], is an authorised Digital Agent of Kalexi Brokerage Ltd.\n\nThe agent may refer clients and share the official referral link. The agent may not receive payments, sign contracts or make guarantees on behalf of the company." },
  { name: "Appointment letter", kind: "appointment", heading: "Letter of Appointment", body: "Dear [Name],\n\nWe are pleased to appoint you as [Position] with Kalexi Brokerage Ltd, effective [date].\n\nYours faithfully," },
  { name: "Company notice", kind: "notice", heading: "Notice", body: "All staff and agents are hereby notified that…" },
  { name: "Certificate", kind: "certificate", heading: "Certificate of Recognition", body: "Awarded to\n\n[Name]\n\nin recognition of outstanding performance." },
  { name: "Internal memo", kind: "memo", heading: "Memo: [Subject]", body: "To: \nFrom: \nSubject: \n\n" },
];
export const Route = createFileRoute("/_authenticated/brand")({
  head: () => ({ meta: [{ title: "Brand Centre — Kalexi Brokerage" }, { name: "description", content: "Design and save branded Kalexi letters, notices and certificates." }, { property: "og:title", content: "Brand Centre — Kalexi Brokerage" }, { property: "og:description", content: "Company templates with dates, signatures and printable letterheads." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: BrandCentre,
});
function BrandCentre() {
  const { data: session } = useSession(); const qc = useQueryClient();
  const [id, setId] = useState<string | null>(null); const [draft, setDraft] = useState<Draft>(fresh);
  const [signature, setSignature] = useState<File | null>(null); const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const upload = useServerFn(createBrandSignatureUpload); const sign = useServerFn(getBrandSignature);
  const staff = !!session?.profile && session.profile.status === "active" && session.roles.length > 0;
  const q = useQuery({ queryKey: ["brand-templates"], enabled: staff, queryFn: async () => { const { data, error } = await supabase.from("brand_templates").select("*").order("updated_at", { ascending: false }); if (error) throw error; return data; } });
  const signed = useQuery({ queryKey: ["brand-signature", id, draft.signature_path], enabled: !!id && !!draft.signature_path, queryFn: () => id ? sign({ data: { id } }) : null });
  useEffect(() => { if (!signature) { setPreview(null); return; } const url = URL.createObjectURL(signature); setPreview(url); return () => URL.revokeObjectURL(url); }, [signature]);
  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(p => ({ ...p, [key]: value })); setDirty(true); }
  function choose(row?: Template) { if (dirty && !window.confirm("Discard unsaved changes?")) return; setId(row?.id ?? null); setDraft(row ?? fresh()); setSignature(null); setDirty(false); }
  async function save() {
    if (!session || !draft.name.trim()) { toast.error("Enter a template name."); return; }
    setBusy(true);
    try {
      let signaturePath = draft.signature_path;
      if (signature) {
        if (!signature.type.startsWith("image/") || signature.size > 5 * 1024 * 1024) throw new Error("Choose a signature image under 5 MB.");
        const slot = await upload({ data: { fileName: signature.name } });
        const { error } = await supabase.storage.from("kalexi-vault").uploadToSignedUrl(slot.path, slot.token, signature); if (error) throw error;
        signaturePath = slot.path;
      }
      const payload = { ...draft, name: draft.name.trim(), doc_date: draft.doc_date || null, signature_path: signaturePath };
      const result = id ? await supabase.from("brand_templates").update(payload).eq("id", id).select().single() : await supabase.from("brand_templates").insert({ ...payload, created_by: session.userId }).select().single();
      if (result.error) throw result.error;
      setId(result.data.id); setDraft(result.data); setSignature(null); setDirty(false);
      await logAudit({ actorId: session.userId, actorEmail: session.email, action: "brand.template_saved", entityType: "brand_template", entityId: result.data.id });
      await qc.invalidateQueries({ queryKey: ["brand-templates"] }); toast.success("Template saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save template"); } finally { setBusy(false); }
  }
  async function remove() { if (!id || !window.confirm("Delete this saved template?")) return; setBusy(true); const { error } = await supabase.from("brand_templates").delete().eq("id", id); setBusy(false); if (error) { toast.error(error.message); return; } setDirty(false); setId(null); setDraft(fresh()); setSignature(null); qc.invalidateQueries({ queryKey: ["brand-templates"] }); toast.success("Template deleted"); }
  const field = (key: "name" | "heading" | "doc_date" | "signatory_name" | "signatory_title", label: string, type = "text") => <div className="space-y-1"><Label htmlFor={`brand-${key}`}>{label}</Label><Input id={`brand-${key}`} type={type} value={draft[key] ?? ""} onChange={e => update(key, e.target.value)} /></div>;
  const accent = draft.accent === "navy" ? "border-navy" : draft.accent === "green" ? "border-success" : "border-gold";
  return <AppShell><div className="no-print"><PageHeader title="Brand Centre" actions={<Button variant="outline" onClick={() => choose()}><FilePlus2 />New template</Button>} /></div>
    {!staff ? <NoAccess module="Brand Centre" /> : <>
      {session?.access.isSuperAdmin ? <BrandAppearanceSettings /> : null}
      <div className="grid gap-6 xl:grid-cols-[350px_minmax(0,1fr)]">
      <section className="brand-editor space-y-5">
        <div><Label htmlFor="template-select">Saved templates</Label><select id="template-select" value={id ?? ""} disabled={busy} className="mt-1 h-10 w-full rounded-md border bg-card px-3 text-sm" onChange={e => choose(q.data?.find(t => t.id === e.target.value))}><option value="">New template</option>{q.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>{q.isError ? <p role="alert" className="text-sm text-destructive">Could not load templates.</p> : null}</div>
        <div className="space-y-4">{field("name", "Template name")}
          <div><p className="mb-2 text-sm font-medium">Quick start</p><div className="flex flex-wrap gap-2">{PRESETS.map(p => <Button key={p.name} type="button" size="sm" variant="secondary" onClick={() => { setDraft(d => ({ ...d, ...p })); setDirty(true); }}>{p.name}</Button>)}</div></div>
          <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="brand-kind">Format</Label><select id="brand-kind" className="mt-1 h-9 w-full rounded-md border bg-card px-2 text-sm" value={draft.kind} onChange={e => update("kind", e.target.value)}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>{field("doc_date", "Document date", "date")}</div>
          {field("heading", "Heading")}<div><Label htmlFor="brand-body">Document text</Label><Textarea id="brand-body" rows={7} value={draft.body ?? ""} onChange={e => update("body", e.target.value)} /></div>
          {field("signatory_name", "Signatory name")}{field("signatory_title", "Signatory title")}
          <div><Label htmlFor="brand-signature">Signature image</Label><Input id="brand-signature" type="file" accept="image/*" onChange={e => { setSignature(e.target.files?.[0] ?? null); setDirty(true); }} />{draft.signature_path || signature ? <Button size="sm" variant="ghost" onClick={() => { update("signature_path", null); setSignature(null); }}>Remove signature</Button> : null}</div>
          <fieldset><legend className="mb-2 text-sm font-medium">Accent</legend><div className="flex gap-2">{(["gold", "navy", "green"] as const).map(c => <Button key={c} variant="outline" size="icon" title={c} aria-label={`${c} accent`} aria-pressed={draft.accent === c} className={draft.accent === c ? "ring-2 ring-ring" : ""} onClick={() => update("accent", c)}><span className={`h-4 w-4 rounded-full ${c === "gold" ? "bg-gold" : c === "navy" ? "bg-navy" : "bg-success"}`} /></Button>)}</div></fieldset>
          <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={save}><Save />{busy ? "Saving…" : "Save template"}</Button><Button variant="outline" onClick={() => window.print()}><Printer />Print / PDF</Button>{id ? <><Button variant="outline" size="icon" title="Duplicate template" aria-label="Duplicate template" onClick={() => { setId(null); update("name", `${draft.name} copy`); }}><Copy /></Button><Button variant="outline" size="icon" disabled={busy} title="Delete template" aria-label="Delete template" onClick={remove}><Trash2 /></Button></> : null}</div>
        </div>
      </section>
      <section className={`brand-preview relative min-h-[700px] overflow-hidden rounded-sm border border-t-4 bg-card p-6 shadow-[var(--shadow-panel)] sm:p-12 ${accent} ${draft.kind === "certificate" ? "border-x-4 border-b-4" : ""}`} aria-label="Document preview">
        <KalexiMark className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 opacity-[0.05]" />
        <header className="relative flex flex-wrap items-center justify-between gap-4 border-b pb-6"><div className="flex items-center gap-4"><KalexiMark className="h-16 w-16" /><div><h2 className="font-display text-lg font-semibold sm:text-xl">KALEXI BROKERAGE LTD</h2><p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{KIND_LABEL[draft.kind] ?? "Official correspondence"}</p></div></div><div className="text-right text-xs leading-5 text-muted-foreground"><p>info@kalexibrokerage.com</p><p>www.kalexibrokerage.com</p></div></header>
        <p className="relative mt-6 text-right text-sm text-muted-foreground">{draft.doc_date ? new Date(`${draft.doc_date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : ""}</p>
        <h3 className={`relative mt-10 break-words font-display text-2xl font-semibold ${draft.kind === "certificate" ? "text-center text-3xl" : ""}`}>{draft.heading || ""}</h3>
        <div className={`relative mt-6 min-h-64 whitespace-pre-wrap break-words text-sm leading-7 ${draft.kind === "certificate" ? "text-center" : ""}`}>{draft.body}</div>
        <div className={`relative mt-12 ${draft.kind === "certificate" ? "flex flex-col items-center text-center" : ""}`}>{preview || signed.data ? <img src={preview ?? signed.data ?? ""} alt="Authorised signature" className="mb-3 h-16 max-w-48 object-contain object-left" /> : <div className="mb-3 h-12 w-48 border-b border-dashed" />}<p className="font-semibold">{draft.signatory_name}</p><p className="text-sm text-muted-foreground">{draft.signatory_title}</p></div>
        <footer className="relative mt-10 flex flex-wrap justify-between gap-2 border-t pt-4 text-xs text-muted-foreground"><span>KALEXI BROKERAGE LTD · Brokerage · Facilitation · Advisory</span><span>Ref: KBL-{(id ?? "draft").slice(0, 8).toUpperCase()}</span></footer>
      </section>
      </div>
    </>}
  </AppShell>;
}