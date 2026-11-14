import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { AgentIdCard } from "@/components/AgentIdCard";
import { AgentIdentityEditor } from "@/components/AgentIdentityEditor";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/records";
import { Button } from "@/components/ui/button";
import { createAgentLogin, setAgentStatus, signAgentFiles } from "@/lib/agents.functions";

export const Route = createFileRoute("/_authenticated/agents/$agentId")({
  head: () => ({ meta: [{ title: "Agent ID Card — Kalexi" }, { name: "description", content: "Official Kalexi digital agent ID card." }] }),
  component: AgentCard,
});

function AgentCard() {
  const { agentId } = useParams({ from: "/_authenticated/agents/$agentId" });
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["agent", agentId], queryFn: async () => (await supabase.from("agents").select("*").eq("id", agentId).single()).data });
  const a = q.data;
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  useEffect(() => { if (a?.email) setEmail(a.email); }, [a?.email]);
  const photo = useQuery({
    queryKey: ["agent-photo", a?.photo_path], enabled: !!a?.photo_path,
    queryFn: () => signAgentFiles({ data: { paths: [a!.photo_path!] } }),
  });
  if (!a) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  const photoUrl = a.photo_path ? photo.data?.[a.photo_path] : undefined;

  async function issueLogin() {
    if (pw.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    try { await createAgentLogin({ data: { agentId: a!.id, email, password: pw } }); toast.success(`Sign-in ready. Share: ${email} / ${pw}`); setPw(""); qc.invalidateQueries({ queryKey: ["agent", agentId] }); }
    catch (e) { toast.error((e as Error).message); }
  }

  async function status(s: "active" | "suspended" | "revoked") {
    try { await setAgentStatus({ data: { id: a!.id, status: s } }); toast.success(`Agent ${s}`); qc.invalidateQueries({ queryKey: ["agent", agentId] }); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <AppShell>
      <PageHeader title={a.full_name} description={`${a.agent_code} · referral ${a.referral_code}`}
        actions={<div className="no-print flex gap-2"><StatusPill value={a.status} />
          <Button size="sm" variant="outline" onClick={() => window.print()}>Print card</Button>
          {a.status === "active"
            ? <Button size="sm" variant="outline" onClick={() => status("suspended")}>Suspend</Button>
            : <Button size="sm" variant="outline" onClick={() => status("active")}>Reactivate</Button>}
          <Button size="sm" variant="destructive" onClick={() => status("revoked")}>Revoke</Button></div>} />
      <AgentIdCard agent={a} photoUrl={photoUrl ?? null} />
      <div className="no-print mt-6 max-w-xl rounded-xl border bg-card p-5">
        <h2 className="font-display font-semibold">Agent sign-in details</h2>
        <p className="mb-3 text-sm text-muted-foreground">{a.user_id ? "This agent can sign in. Update the email or set a new password below." : "Create the email and password the agent will use to open their dashboard."}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="text" placeholder="Password (min 8 characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <Button className="mt-3" onClick={issueLogin}>{a.user_id ? "Update sign-in" : "Create sign-in"}</Button>
      </div>
      <AgentIdentityEditor key={a.updated_at} agent={a} />
    </AppShell>
  );
}
