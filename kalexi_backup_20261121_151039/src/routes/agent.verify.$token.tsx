import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { verifyAgent } from "@/lib/agents.functions";
import { KalexiMark } from "@/components/KalexiMark";

export const Route = createFileRoute("/agent/verify/$token")({
  head: () => ({
    meta: [
      { title: "Agent Verification — Kalexi Brokerage" },
      { name: "description", content: "Confirm that a person is an authorised Kalexi Brokerage digital agent." },
      { property: "og:title", content: "Agent Verification — Kalexi Brokerage" },
      { property: "og:description", content: "Confirm that a person is an authorised Kalexi Brokerage digital agent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyAgentPage,
});

function VerifyAgentPage() {
  const { token } = useParams({ from: "/agent/verify/$token" });
  const q = useQuery({ queryKey: ["verify-agent", token], queryFn: () => verifyAgent({ data: { token } }) });
  const a = q.data;
  const valid = a?.status === "active";
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-[var(--shadow-panel)]">
        <div className="flex items-center gap-3 border-b pb-5">
          <KalexiMark className="h-10 w-10" />
          <div>
            <p className="font-display font-semibold">KALEXI BROKERAGE LTD</p>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Agent Verification</p>
          </div>
        </div>
        {q.isLoading ? <p className="pt-6 text-sm text-muted-foreground">Checking…</p> : !a ? (
          <p className="pt-6 text-sm font-medium text-destructive">No agent matches this card. Do not deal with this person on Kalexi's behalf.</p>
        ) : (
          <div className="space-y-4 pt-6 text-center">
            {a.photoUrl ? <img src={a.photoUrl} alt={a.fullName} className="mx-auto h-28 w-28 rounded-lg object-cover" /> : null}
            <div>
              <p className="font-display text-xl font-semibold">{a.fullName}</p>
              <p className="text-sm text-muted-foreground">{a.agentCode}{a.district ? ` · ${a.district}` : ""}</p>
            </div>
            <p className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${valid ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
              {valid ? "Verified active agent" : `Not valid — ${a.status}`}
            </p>
            <p className="text-xs text-muted-foreground">Valid until {new Date(a.expiresAt).toLocaleDateString()}</p>
          </div>
        )}
      </div>
    </main>
  );
}
