import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { AgentIdCard } from "@/components/AgentIdCard";
import { AgentIdentityEditor } from "@/components/AgentIdentityEditor";
import { Input } from "@/components/ui/input";
import { NoAccess, StatusPill } from "@/components/records";
import { Button } from "@/components/ui/button";
import { ErrorState, PageLoadingState } from "@/components/LoadingStates";
import { useAccess } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import {
  createAgentLogin,
  getAgentRecord,
  setAgentStatus,
  signAgentFiles,
} from "@/lib/agents.functions";

type PdfDownload = () => Promise<void>;

export const Route = createFileRoute("/_authenticated/agents/$agentId")({
  head: () => ({
    meta: [
      { title: "Agent ID Card — Kalexi" },
      { name: "description", content: "Official Kalexi digital agent ID card." },
    ],
  }),
  component: AgentCard,
});

function AgentCard() {
  const { agentId } = useParams({ from: "/_authenticated/agents/$agentId" });
  const qc = useQueryClient();
  const access = useAccess();

  const canView = allows(access, "agents.view") || allows(access, "agents.manage");
  const canManage = allows(access, "agents.manage");

  const q = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => getAgentRecord({ data: { id: agentId } }),
    enabled: canView,
    retry: false,
  });

  const a = q.data;
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [downloadAgentId, setDownloadAgentId] = useState<PdfDownload | null>(null);

  const handleDownloadReady = useCallback((download: PdfDownload | null) => {
    setDownloadAgentId(() => download);
  }, []);

  useEffect(() => {
    if (a?.email) setEmail(a.email);
  }, [a?.email]);

  const photo = useQuery({
    queryKey: ["agent-photo", a?.photo_path],
    enabled: canView && !!a?.photo_path,
    queryFn: () => signAgentFiles({ data: { paths: [a!.photo_path!] } }),
  });

  if (!access) {
    return <AppShell><PageLoadingState message="Verifying agent-management access…" /></AppShell>;
  }

  if (!canView) {
    return <AppShell><NoAccess module="Digital Agents" /></AppShell>;
  }

  if (q.isLoading) {
    return <AppShell><PageLoadingState message="Loading agent ID card…" /></AppShell>;
  }

  if (q.isError) {
    return (
      <AppShell>
        <ErrorState
          title={q.error instanceof Error ? q.error.message : "Agent ID card could not be loaded."}
          onRetry={() => void q.refetch()}
        />
      </AppShell>
    );
  }

  if (!a) {
    return <AppShell><p className="text-sm text-muted-foreground">Agent record not found.</p></AppShell>;
  }

  const photoUrl = a.photo_path ? photo.data?.[a.photo_path] : undefined;

  async function downloadId() {
    if (!downloadAgentId) {
      toast.error("The ID is still being prepared. Wait for the QR code and barcode to load.");
      return;
    }

    try {
      await downloadAgentId();
      toast.success("Agent ID PDF downloaded.");
    } catch (error) {
      console.error("[Agent ID PDF]", error);
      toast.error(error instanceof Error ? error.message : "Could not generate the agent ID PDF.");
    }
  }

  async function issueLogin() {
    if (pw.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    try {
      await createAgentLogin({ data: { agentId: a!.id, email, password: pw } });
      toast.success(`Sign-in ready. Share: ${email} / ${pw}`);
      setPw("");
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function status(s: "active" | "suspended" | "revoked") {
    try {
      await setAgentStatus({ data: { id: a!.id, status: s } });
      toast.success(`Agent ${s}`);
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title={a.full_name}
        description={`${a.agent_code} · referral ${a.referral_code}`}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <StatusPill value={a.status} />
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.print()}
            >
              Print ID
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={downloadId}
              disabled={!downloadAgentId}
            >
              {downloadAgentId ? "Download ID PDF" : "Preparing ID…"}
            </Button>

            {canManage ? (
              <>
                {a.status === "active" ? (
                  <Button size="sm" variant="outline" onClick={() => status("suspended")}>
                    Suspend
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => status("active")}>
                    Reactivate
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => status("revoked")}>
                  Revoke
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <AgentIdCard
        agent={a}
        photoUrl={photoUrl ?? null}
        onDownloadReady={handleDownloadReady}
      />

      {canManage ? (
        <div className="no-print mt-6 max-w-xl rounded-xl border bg-card p-5">
          <h2 className="font-display font-semibold">Agent sign-in details</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {a.user_id
              ? "This agent can sign in. Update the email or set a new password below."
              : "Create the email and password the agent will use to open their dashboard."}
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="text" placeholder="Password (min 8 characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>

          <Button className="mt-3" onClick={issueLogin}>
            {a.user_id ? "Update sign-in" : "Create sign-in"}
          </Button>
        </div>
      ) : null}

      {canManage ? <AgentIdentityEditor key={a.updated_at} agent={a} /> : null}
    </AppShell>
  );
}