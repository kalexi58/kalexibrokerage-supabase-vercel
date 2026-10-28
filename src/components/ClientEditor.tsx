import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useSession, logAudit } from "@/hooks/useSession";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];
const FIELDS = [["full_name", "Full name"], ["phone", "Phone"], ["email", "Email"], ["company_name", "Company"], ["client_type", "Client type"], ["sector", "Sector"], ["branch", "Branch"], ["address", "Address"], ["id_type", "ID type"], ["id_number", "ID number"], ["status", "Status"]] as const;

export function ClientEditor({ client }: { client: Client }) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const init = () => ({ ...Object.fromEntries(FIELDS.map(([k]) => [k, (client[k] as string | null) ?? ""])), requirement: client.requirement }) as Record<string, string>;
  const [draft, setDraft] = useState(init);
  async function save() {
    if (!session) return;
    if (!(draft["full_name"] ?? "").trim() || !(draft["phone"] ?? "").trim()) { toast.error("Name and phone are required."); return; }
    setBusy(true);
    const payload = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim() || (["full_name", "phone", "client_type", "sector", "status", "requirement"].includes(k) ? v : null)]));
    const { error } = await supabase.from("clients").update(payload as never).eq("id", client.id);
    setBusy(false);
    if (error) { toast.error("You can't edit this record, or a value is invalid."); return; }
    await logAudit({ actorId: session.userId, actorEmail: session.email, action: "client.updated", entityType: "client", entityId: client.id, newValue: payload });
    await qc.invalidateQueries({ queryKey: ["client", client.id] });
    toast.success("Client details saved"); setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(init()); }}>
      <DialogTrigger asChild><Button><Pencil />Edit details</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit client {client.client_ref}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([k, l]) => <div key={k}><Label htmlFor={`c-${k}`}>{l}</Label><Input id={`c-${k}`} value={draft[k]} onChange={(e) => setDraft((p) => ({ ...p, [k]: e.target.value }))} /></div>)}
          <div className="sm:col-span-2"><Label htmlFor="c-req">Requirement</Label><Textarea id="c-req" rows={4} value={draft["requirement"]} onChange={(e) => setDraft((p) => ({ ...p, requirement: e.target.value }))} /></div>
        </div>
        <Button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</Button>
      </DialogContent>
    </Dialog>
  );
}
