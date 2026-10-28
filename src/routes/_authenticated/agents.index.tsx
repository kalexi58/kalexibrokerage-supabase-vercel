import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { NoAccess, Panel, StatusPill, EmptyState } from "@/components/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccess } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { reviewAgentApplication, signAgentFiles } from "@/lib/agents.functions";
import {
  DataTableSkeleton,
  ErrorState,
  OperationProgress,
  PageLoadingState,
} from "@/components/LoadingStates";

export const Route = createFileRoute("/_authenticated/agents/")({
  head: () => ({
    meta: [
      { title: "Digital Agents — Kalexi" },
      { name: "description", content: "Digital Agent Programme administration." },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const access = useAccess();
  const [tab, setTab] = useState<"apps" | "agents" | "links" | "registry" | "notices">("apps");
  if (access && !allows(access, "agents.view"))
    return (
      <AppShell>
        <NoAccess module="Digital Agents" />
      </AppShell>
    );
  return (
    <AppShell>
      <PageHeader
        title="Digital Agent Programme"
        description="Registration links, application review and official agent ID cards."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["apps", "Applications"],
            ["agents", "Agents"],
            ["registry", "Field register"],
            ["links", "Registration links"],
            ["notices", "Messages to agents"],
          ] as const
        ).map(([k, l]) => (
          <Button
            key={k}
            variant={tab === k ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(k)}
          >
            {l}
          </Button>
        ))}
      </div>
      {tab === "apps" ? (
        <Applications canManage={allows(access, "agents.manage")} />
      ) : tab === "agents" ? (
        <AgentList />
      ) : tab === "registry" ? (
        <Registry />
      ) : tab === "notices" ? (
        <Notices />
      ) : (
        <Links />
      )}
    </AppShell>
  );
}

function Applications({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["agent-apps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const current = q.data?.find((a) => a.id === open);
  const files = useQuery({
    queryKey: ["agent-app-files", open],
    enabled: !!current,
    queryFn: () =>
      signAgentFiles({
        data: {
          paths: [current!.photo_path, current!.id_front_path, current!.id_back_path].filter(
            Boolean,
          ) as string[],
        },
      }),
  });
  const [note, setNote] = useState("");

  async function decide(decision: "approved" | "rejected" | "more_info") {
    try {
      await reviewAgentApplication({ data: { id: open!, decision, note: note || null } });
      toast.success(
        decision === "approved" ? "Approved — agent ID card issued." : "Decision recorded.",
      );
      setNote("");
      setOpen(null);
      qc.invalidateQueries({ queryKey: ["agent-apps"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (q.isLoading) return <PageLoadingState message="Loading agent applications…" />;
  if (q.isError)
    return (
      <ErrorState
        title="Agent applications could not be retrieved"
        onRetry={() => void q.refetch()}
      />
    );
  if (!q.data?.length)
    return (
      <EmptyState
        title="No applications yet"
        hint="Share a registration link to start receiving applications."
      />
    );
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <Panel title="Applications">
        <ul className="divide-y">
          {q.data.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => setOpen(a.id)}
                className={`flex w-full items-center justify-between px-2 py-3 text-left text-sm hover:bg-muted ${open === a.id ? "bg-muted" : ""}`}
              >
                <span>
                  <b>{a.full_name}</b>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    {a.application_ref} · {a.district ?? "—"}
                  </span>
                </span>
                <StatusPill value={a.status} />
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      {current ? (
        <Panel title={`${current.application_ref} — ${current.full_name}`}>
          <div className="grid grid-cols-3 gap-2">
            {[current.photo_path, current.id_front_path, current.id_back_path].map((p, i) =>
              p && files.data?.[p] ? (
                <a key={p} href={files.data[p]} target="_blank" rel="noreferrer">
                  <img
                    src={files.data[p]}
                    alt={["Photo", "ID front", "ID back"][i]}
                    className="h-28 w-full rounded-md border object-cover"
                  />
                </a>
              ) : null,
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {[
              ["Phone", current.phone],
              ["Email", current.email],
              ["Date of birth", current.date_of_birth],
              ["Gender", current.gender],
              ["Nationality", current.nationality],
              ["Occupation", current.occupation],
              ["Address", current.address],
              ["ID", `${current.id_type} · ${current.id_number}`],
              [
                "Payment",
                `${current.payment_method === "bank" ? "Bank" : "Mobile money"} ${current.payment_provider ?? ""}`,
              ],
              ["Account", `${current.payment_account_name} · ${current.payment_account_number}`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {current.review_note ? (
            <p className="mt-3 text-sm text-muted-foreground">Note: {current.review_note}</p>
          ) : null}
          {canManage && current.status !== "approved" ? (
            <div className="mt-4 space-y-2 border-t pt-4">
              <Input
                placeholder="Review note (required to reject)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => decide("approved")}>Approve & issue card</Button>
                <Button variant="outline" onClick={() => decide("more_info")}>
                  Request info
                </Button>
                <Button variant="destructive" onClick={() => decide("rejected")}>
                  Reject
                </Button>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : (
        <EmptyState
          title="Select an application"
          hint="Review identity photos and details before approving."
        />
      )}
    </div>
  );
}

function AgentList() {
  const q = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (q.isLoading) return <DataTableSkeleton rows={6} columns={6} />;
  if (q.isError)
    return (
      <ErrorState title="Agent records could not be retrieved" onRetry={() => void q.refetch()} />
    );
  if (!q.data?.length) return <EmptyState title="No approved agents yet" />;
  return (
    <Panel title="Agents">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-2">Agent ID</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Referral</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y">
          {q.data.map((a) => (
            <tr key={a.id}>
              <td className="py-2 font-mono text-xs">{a.agent_code}</td>
              <td>{a.full_name}</td>
              <td>{a.phone}</td>
              <td className="font-mono text-xs">{a.referral_code}</td>
              <td>
                <StatusPill value={a.status} />
              </td>
              <td className="text-right">
                <Link
                  to="/agents/$agentId"
                  params={{ agentId: a.id }}
                  className="text-primary hover:underline"
                >
                  ID card
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Links() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("Kalexi Digital Agent Registration");
  const q = useQuery({
    queryKey: ["agent-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  async function create() {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("agent_campaigns")
      .insert({ title, created_by: u.user?.id ?? null });
    if (error) toast.error(error.message);
    else {
      toast.success("Link created");
      qc.invalidateQueries({ queryKey: ["agent-campaigns"] });
    }
  }
  async function toggle(id: string, active: boolean) {
    const { error } = await supabase.from("agent_campaigns").update({ active }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["agent-campaigns"] });
  }
  const url = (t: string) => `${window.location.origin}/join/${t}`;
  return (
    <div className="space-y-4">
      <Panel title="New registration link">
        <div className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button onClick={create}>Generate link</Button>
        </div>
      </Panel>
      <Panel title="Links">
        <ul className="divide-y text-sm">
          {(q.data ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span>
                <b>{c.title}</b>
                <br />
                <span className="break-all text-xs text-muted-foreground">{url(c.token)}</span>
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(url(c.token));
                    toast.success("Copied");
                  }}
                >
                  Copy
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggle(c.id, !c.active)}>
                  {c.active ? "Close" : "Reopen"}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Registry() {
  const qc = useQueryClient();
  const blank = {
    reg_id: "",
    full_name: "",
    phone: "",
    village: "",
    district: "",
    registered_on: "",
    received_by: "",
    status: "registered",
  };
  const [f, setF] = useState(blank);
  const [sig, setSig] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const q = useQuery({
    queryKey: ["agent-registry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_registry")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  async function save() {
    if (!f.reg_id || !f.full_name) {
      toast.error("Registration ID and name are required.");
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      let signature_path: string | null = null;
      if (sig) {
        signature_path = `agent-registry/${crypto.randomUUID()}-${sig.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from("kalexi-vault").upload(signature_path, sig);
        if (error) throw error;
      }
      const { error } = await supabase.from("agent_registry").insert({
        ...f,
        phone: f.phone || null,
        village: f.village || null,
        district: f.district || null,
        registered_on: f.registered_on || null,
        received_by: f.received_by || null,
        signature_path,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Agent recorded");
      setF(blank);
      setSig(null);
      await qc.invalidateQueries({ queryKey: ["agent-registry"] });
    } catch (error) {
      console.error("[agents] Field registration could not be saved.", error);
      toast.error(
        error instanceof Error && error.message.toLowerCase().includes("duplicate")
          ? "That registration ID already exists."
          : error instanceof Error
            ? `Agent registration could not be saved: ${error.message}`
            : "Agent registration could not be saved. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  const field = (k: keyof typeof blank, label: string, type = "text") => (
    <label className="space-y-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="space-y-4">
      <Panel title="Record an agent registered in the field">
        {saving ? (
          <OperationProgress
            message={
              sig
                ? "Uploading signature and saving agent information…"
                : "Saving agent information…"
            }
          />
        ) : null}
        <p className="mb-3 text-sm text-muted-foreground">
          When this person later applies online with the same registration ID or phone number, the
          system links them automatically.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {field("reg_id", "Registration ID *")}
          {field("full_name", "Full name *")}
          {field("phone", "Phone number")}
          {field("village", "Village")}
          {field("district", "District")}
          {field("registered_on", "Date", "date")}
          {field("received_by", "Received by")}
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Status</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
            >
              <option value="registered">Registered</option>
              <option value="verified">Verified</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Signature (optional)</span>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setSig(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <Button className="mt-4" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save agent"}
        </Button>
      </Panel>
      <Panel title="Field register">
        {q.isLoading ? (
          <DataTableSkeleton rows={5} columns={8} />
        ) : q.isError ? (
          <ErrorState
            title="Field registrations could not be retrieved"
            onRetry={() => void q.refetch()}
          />
        ) : q.data?.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2">Reg ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Village</th>
                <th>District</th>
                <th>Date</th>
                <th>Received by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {q.data.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 font-mono text-xs">{r.reg_id}</td>
                  <td>{r.full_name}</td>
                  <td>{r.phone ?? "—"}</td>
                  <td>{r.village ?? "—"}</td>
                  <td>{r.district ?? "—"}</td>
                  <td>{r.registered_on ?? "—"}</td>
                  <td>{r.received_by ?? "—"}</td>
                  <td>
                    <StatusPill value={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No field registrations yet" />
        )}
      </Panel>
    </div>
  );
}

function Notices() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const q = useQuery({
    queryKey: ["agent-notices"],
    queryFn: async () =>
      (await supabase.from("agent_notices").select("*").order("created_at", { ascending: false }))
        .data ?? [],
  });
  async function post() {
    if (!title || !body) {
      toast.error("Title and message are required.");
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("agent_notices")
      .insert({ title, body, created_by: u.user?.id ?? null });
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitle("");
    setBody("");
    toast.success("Sent to all agents");
    qc.invalidateQueries({ queryKey: ["agent-notices"] });
  }
  return (
    <div className="space-y-4">
      <Panel title="Send a message to all agents">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          className="mt-2 min-h-28 w-full rounded-md border bg-background p-3 text-sm"
          placeholder="Message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button className="mt-2" onClick={post}>
          Send
        </Button>
      </Panel>
      <Panel title="Sent messages">
        {(q.data ?? []).map((n) => (
          <div key={n.id} className="border-b py-3 last:border-0">
            <p className="font-medium">{n.title}</p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
          </div>
        ))}
      </Panel>
    </div>
  );
}
