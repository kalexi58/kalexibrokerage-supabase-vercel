import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { NoAccess, Panel, StatusPill, EmptyState } from "@/components/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/integrations/supabase/types";
import {
  expectedApplicationUpdatedAtSchema,
  type UpdateAgentApplicationFields,
} from "@/lib/agent-application-validation";
import { useAccess } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import {
  createAgentCampaign,
  listAgentApplications,
  listAgentCampaigns,
  reviewAgentApplication,
  setAgentCampaignStatus,
  signAgentFiles,
  updateAgentApplication,
} from "@/lib/agents.functions";
import { AgentIdCardDesigner } from "@/components/AgentIdCardDesigner";
import {
  DataTableSkeleton,
  ErrorState,
  OperationProgress,
  PageLoadingState,
} from "@/components/LoadingStates";

export const Route = createFileRoute("/_authenticated/agents/")({
  head: () => ({
    meta: [
      { title: "Digital Agents - Kalexi" },
      { name: "description", content: "Digital Agent Programme administration." },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const access = useAccess();
  const canView = allows(access, "agents.view");
  const canManage = allows(access, "agents.manage");
  const [tab, setTab] = useState<"apps" | "agents" | "links" | "registry" | "notices" | "designer">("apps");
  if (access && !canView && !canManage)
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
            ["designer", "ID Card Designer"],
          ] as const
        )
          .filter(([key]) => {
            if (key === "links") return canManage;
            if (canView) return true;
            return key === "apps" || key === "agents" || key === "registry" || key === "designer";
          })
          .map(([k, l]) => (
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
{tab === "designer" ? (
        <AgentIdCardDesigner canManage={canManage} />
      ) : tab === "apps" ? (
        <Applications canManage={allows(access, "agents.manage")} />
      ) : tab === "agents" ? (
        <AgentList />
      ) : tab === "registry" ? (
        <Registry />
      ) : tab === "notices" ? (
        <Notices />
      ) : (
        <Links canManage={allows(access, "agents.manage")} />
      )}
    </AppShell>
  );
}

type AgentApplicationRecord = Database["public"]["Tables"]["agent_applications"]["Row"];

type AgentApplicationEdit = UpdateAgentApplicationFields;

function applicationEditFromRecord(application: AgentApplicationRecord): AgentApplicationEdit {
  return {
    full_name: application.full_name,
    phone: application.phone,
    email: application.email,
    date_of_birth: application.date_of_birth ?? "",
    gender: application.gender ?? "",
    nationality: application.nationality ?? "",
    address: application.address ?? "",
    district: application.district ?? "",
    village: application.village ?? "",
    occupation: application.occupation ?? "",
    id_type: application.id_type,
    id_number: application.id_number,
    payment_method: application.payment_method,
    payment_provider: application.payment_provider ?? "",
    payment_account_name: application.payment_account_name ?? "",
    payment_account_number: application.payment_account_number ?? "",
  };
}

function ApplicationEditor({
  application,
  onSave,
  onCancel,
  saving,
}: {
  application: AgentApplicationRecord;
  onSave: (draft: AgentApplicationEdit, expectedUpdatedAt: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(() => applicationEditFromRecord(application));
  const [expectedUpdatedAt] = useState(application.updated_at);
  const parsedExpectedUpdatedAt = expectedApplicationUpdatedAtSchema.safeParse(expectedUpdatedAt);
  const field = (
    key: keyof AgentApplicationEdit,
    label: string,
    type = "text",
  ) => (
    <div key={key} className="space-y-1">
      <Label htmlFor={`application-${key}`}>{label}</Label>
      <Input
        id={`application-${key}`}
        type={type}
        value={draft[key]}
        disabled={saving}
        onChange={(event) =>
          setDraft((previous) => ({ ...previous, [key]: event.target.value }))
        }
      />
    </div>
  );

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold">Edit application details</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Applicant declarations and uploaded identity files remain unchanged as application evidence.
          Changing the contact email here does not change the agent’s sign-in email.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("full_name", "Full legal name")}
        {field("phone", "Phone number", "tel")}
        {field("email", "Application email", "email")}
        {field("date_of_birth", "Date of birth", "date")}
        {field("gender", "Gender")}
        {field("nationality", "Nationality")}
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="application-address">Address</Label>
          <Textarea
            id="application-address"
            value={draft.address}
            maxLength={500}
            disabled={saving}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, address: event.target.value }))
            }
          />
        </div>
        {field("district", "District")}
        {field("village", "Village")}
        {field("occupation", "Occupation")}
        {field("id_type", "ID type")}
        {field("id_number", "ID number")}
        {field("payment_method", "Payment method")}
        {field("payment_provider", "Payment provider")}
        {field("payment_account_name", "Payment account name")}
        {field("payment_account_number", "Payment account number")}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={saving || !parsedExpectedUpdatedAt.success}
          onClick={() => {
            if (!parsedExpectedUpdatedAt.success) {
              toast.error("The application timestamp is invalid. Refresh before editing.");
              return;
            }
            onSave(draft, parsedExpectedUpdatedAt.data);
          }}
        >
          {saving ? "Saving…" : "Save application details"}
        </Button>
        <Button variant="outline" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Applications({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["agent-apps"],
    queryFn: () => listAgentApplications(),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const current = q.data?.find((a) => a.id === open);

  const linkedAgent = useQuery({
    queryKey: ["agent-application-card", current?.id],
    enabled: current?.status === "approved",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, agent_code")
        .eq("application_id", current!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const updateApplication = useMutation({
    mutationFn: async ({
      applicationId,
      expectedUpdatedAt,
      draft,
    }: {
      applicationId: string;
      expectedUpdatedAt: string;
      draft: AgentApplicationEdit;
    }) =>
      updateAgentApplication({
        data: {
          id: applicationId,
          expectedUpdatedAt,
          ...draft,
        },
      }),
    onSuccess: async () => {
      toast.success("Application details updated. Sensitive values are excluded from the audit entry.");
      setEditingId(null);
      await qc.invalidateQueries({ queryKey: ["agent-apps"] });
      await qc.invalidateQueries({ queryKey: ["agent-application-card", current?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const files = useQuery({
    queryKey: ["agent-app-files", open],
    enabled: !!current,
    queryFn: () =>
      signAgentFiles({
        data: {
          paths: [
            current!.photo_path,
            current!.id_front_path,
            current!.id_back_path,
          ].filter(Boolean) as string[],
        },
      }),
  });

  async function decide(decision: "approved" | "rejected" | "more_info") {
    if (!current || !canManage) return;

    if (decision === "rejected" && !note.trim()) {
      toast.error("Enter a reason before rejecting this application.");
      return;
    }

    try {
      const result = await reviewAgentApplication({
        data: {
          id: current.id,
          decision,
          note: note.trim() || null,
        },
      });

      qc.invalidateQueries({ queryKey: ["agent-apps"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      setNote("");

      if (decision === "approved" && result.agentId) {
        toast.success("Application approved. Opening the agent ID card.");
        window.location.assign(
          `/agents/${encodeURIComponent(result.agentId)}`,
        );
        return;
      }

      toast.success(
        decision === "rejected"
          ? "Application rejected."
          : decision === "more_info"
            ? "Request for more information recorded."
            : "Application decision recorded.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The review could not be saved.",
      );
    }
  }

  if (q.isLoading) {
    return <PageLoadingState message="Loading agent applications..." />;
  }

  if (q.isError) {
    return (
      <ErrorState
        title="Agent applications could not be retrieved"
        onRetry={() => void q.refetch()}
      />
    );
  }

  if (!q.data?.length) {
    return (
      <div className="space-y-3">
        <EmptyState
          title="No applications yet"
          hint="Applications appear after the applicant completes the final submission step. Refresh to check for new submissions."
        />
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            {q.isFetching ? "Refreshing…" : "Refresh applications"}
          </Button>
        </div>
      </div>
    );
  }

  const row = current;
  const declarationEntries =
    current?.declarations &&
    typeof current.declarations === "object" &&
    !Array.isArray(current.declarations)
      ? Object.entries(current.declarations)
      : [];

  const details: [string, string][] = row
    ? [
        ["Application reference", String(row.application_ref ?? "Not provided")],
        ["Full name", String(row.full_name ?? "Not provided")],
        ["Phone", String(row.phone ?? "Not provided")],
        ["Email", String(row.email ?? "Not provided")],
        ["Date of birth", String(row.date_of_birth ?? "Not provided")],
        ["Gender", String(row.gender ?? "Not provided")],
        ["Nationality", String(row.nationality ?? "Not provided")],
        ["Occupation", String(row.occupation ?? "Not provided")],
        ["Address", String(row.address ?? "Not provided")],
        ["District", String(row.district ?? "Not provided")],
        ["Village", String(row.village ?? "Not provided")],
        ["ID type", String(row.id_type ?? "Not provided")],
        ["ID number", String(row.id_number ?? "Not provided")],
        ["Payment method", String(row.payment_method ?? "Not provided")],
        ["Payment provider", String(row.payment_provider ?? "Not provided")],
        ["Payment account name", String(row.payment_account_name ?? "Not provided")],
        ["Payment account number", String(row.payment_account_number ?? "Not provided")],
        ["Submitted", row.created_at
          ? new Date(String(row.created_at)).toLocaleString()
          : "Not recorded"],
        ["Status", String(row.status ?? "pending")],
        ["Review note", String(row.review_note ?? "No review note")],
      ]
    : [];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.4fr)]">
      <Panel title={`Applications (${q.data.length})`}>
        <div className="mb-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            {q.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border px-2 py-1">
            Pending: {q.data.filter((a) => a.status === "pending").length}
          </span>
          <span className="rounded-full border px-2 py-1">
            Approved: {q.data.filter((a) => a.status === "approved").length}
          </span>
          <span className="rounded-full border px-2 py-1">
            Rejected: {q.data.filter((a) => a.status === "rejected").length}
          </span>
        </div>

        <ul className="divide-y">
          {q.data.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(a.id);
                  setEditingId(null);
                  setNote(a.review_note ?? "");
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted ${
                  open === a.id ? "bg-muted ring-1 ring-primary/30" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {a.full_name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {a.application_ref ?? "Application"} · {a.district ?? "District not provided"}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {a.created_at
                      ? new Date(a.created_at).toLocaleDateString()
                      : ""}
                  </span>
                </span>
                <span className="shrink-0">
                  <StatusPill value={a.status ?? "pending"} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={current ? "Application details" : "Review an application"}>
        {!current ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="font-medium">Select an applicant</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a name from the list to inspect the submitted details,
              view documents, and make a decision.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{current.full_name}</h2>
                <p className="text-sm text-muted-foreground">
                  {current.application_ref ?? current.id}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill value={current.status ?? "pending"} />
                {current.status === "approved" && linkedAgent.data ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      to="/agents/$agentId"
                      params={{ agentId: linkedAgent.data.id }}
                    >
                      View official agent ID
                    </Link>
                  </Button>
                ) : null}
                {current.status === "approved" && linkedAgent.isError ? (
                  <span className="text-xs text-destructive">
                    Official ID record could not be loaded.
                  </span>
                ) : null}
              </div>
            </div>

            {editingId === current.id && canManage ? (
              <ApplicationEditor
                key={current.id}
                application={current}
                saving={updateApplication.isPending}
                onSave={(draft, expectedUpdatedAt) =>
                  updateApplication.mutate({
                    applicationId: current.id,
                    expectedUpdatedAt,
                    draft,
                  })
                }
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                {canManage ? (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => setEditingId(current.id)}
                    >
                      Edit application details
                    </Button>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  {details.map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 break-words text-sm font-medium">{value}</p>
                    </div>
                  ))}
                </div>
                <section className="rounded-lg border p-3">
                  <h3 className="font-semibold">Applicant declarations</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Preserved as submitted evidence; declarations are not editable.
                  </p>
                  {declarationEntries.length ? (
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                      {declarationEntries.map(([key, value]) => (
                        <div key={key} className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{key}</dt>
                          <dd className="break-words text-sm">
                            {typeof value === "string" ? value : JSON.stringify(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No declarations recorded.</p>
                  )}
                </section>
              </>
            )}

            <section>
              <h3 className="mb-3 font-semibold">Uploaded documents</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Private applicant documents are available only to authorized agent-program staff.
              </p>
              {files.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading uploaded documents...
                </p>
              ) : files.isError ? (
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-destructive">
                    Documents could not be loaded.
                  </p>
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="outline"
                    onClick={() => void files.refetch()}
                  >
                    Retry loading documents
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Applicant photo", path: current.photo_path },
                    { label: "ID front", path: current.id_front_path },
                    { label: "ID back", path: current.id_back_path },
                  ].map((item) => {
                    if (!item.path) {
                      return (
                        <div key={item.label} className="rounded-lg border p-3">
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Not uploaded
                          </p>
                        </div>
                      );
                    }

                    const url = files.data?.[item.path];

                    return (
                      <div key={item.label} className="rounded-lg border p-3">
                        <p className="mb-2 text-sm font-medium">{item.label}</p>
                        {url ? (
                          <>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="block"
                            >
                              <img
                                src={url}
                                alt={item.label}
                                className="h-40 w-full rounded-md object-contain bg-muted"
                              />
                            </a>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block text-sm underline"
                            >
                              Open full document
                            </a>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            File link unavailable.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {current.status !== "approved" && (
              <section className="space-y-3 rounded-lg border p-4">
                <div>
                  <h3 className="font-semibold">Review decision</h3>
                  <p className="text-sm text-muted-foreground">
                    Add a note when requesting information or rejecting the
                    application.
                  </p>
                </div>

                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Review note or rejection reason..."
                  rows={3}
                  maxLength={1000}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  disabled={!canManage}
                />

                {!canManage && (
                  <p className="text-sm text-muted-foreground">
                    You have view-only access. An authorized reviewer must
                    make the decision.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!canManage}
                    onClick={() => void decide("approved")}
                  >
                    Approve & issue ID
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!canManage || !note.trim()}
                    onClick={() => void decide("more_info")}
                  >
                    Request information
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!canManage || !note.trim()}
                    onClick={() => void decide("rejected")}
                  >
                    Reject application
                  </Button>
                </div>
              </section>
            )}

            {current.status === "approved" && (
              <div className="rounded-lg border p-4">
                <p className="font-medium">Application approved</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open the Agents tab to find the issued agent record and ID
                  card if you are not redirected automatically after approval.
                </p>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
function AgentList() {
  const qc = useQueryClient();
  const access = useAccess();
  const canManage = allows(access, "agents.manage");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    full_name: "",
    phone: "",
    email: "",
    company_phone: "",
    district: "",
    village: "",
    designation: "",
    commission_rate: "2",
    referral_code: "",
    registered_on: "",
    received_by: "",
    status: "registered",
  });

  const q = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const [agentsResult, registryResult] = await Promise.all([
        supabase.from("agents").select("*").order("created_at", { ascending: false }),
        supabase.from("agent_registry").select("*").order("created_at", { ascending: false }),
      ]);

      if (agentsResult.error) throw agentsResult.error;
      if (registryResult.error) throw registryResult.error;

      const officialRows = (agentsResult.data ?? []).map((a) => ({
        id: a.id,
        displayId: a.agent_code,
        full_name: a.full_name,
        phone: a.phone ?? "",
        email: a.email ?? "",
        company_phone: a.company_phone ?? "",
        district: a.district ?? "",
        village: a.village ?? "",
        designation: a.designation ?? "",
        commission_rate: String(a.commission_rate ?? 2),
        referral_code: a.referral_code ?? "",
        registered_on: "",
        received_by: "",
        status: a.status,
        created_at: a.created_at,
        recordType: "official" as const,
      }));

      const registryRows = (registryResult.data ?? []).map((r) => ({
        id: r.id,
        displayId: r.reg_id,
        full_name: r.full_name,
        phone: r.phone ?? "",
        email: "",
        company_phone: "",
        district: r.district ?? "",
        village: r.village ?? "",
        designation: "",
        commission_rate: "2",
        referral_code: "",
        registered_on: r.registered_on ?? "",
        received_by: r.received_by ?? "",
        status: r.status,
        created_at: r.created_at,
        recordType: "field" as const,
      }));

      return [...officialRows, ...registryRows].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
    },
  });

  const records = q.data ?? [];
  const selected = records.find(
    (a) => `${a.recordType}-${a.id}` === selectedKey,
  );

  function openRecord(a: (typeof records)[number]) {
    setSelectedKey(`${a.recordType}-${a.id}`);
    setEditing(false);
    setDraft({
      full_name: a.full_name,
      phone: a.phone,
      email: a.email,
      company_phone: a.company_phone,
      district: a.district,
      village: a.village,
      designation: a.designation,
      commission_rate: a.commission_rate,
      referral_code: a.referral_code,
      registered_on: a.registered_on,
      received_by: a.received_by,
      status: a.status,
    });
  }

  async function saveRecord() {
    if (!selected || !canManage) return;

    if (!draft.full_name.trim() || !draft.phone.trim()) {
      toast.error("Full name and phone number are required.");
      return;
    }

    setSaving(true);
    try {
      if (selected.recordType === "official") {
        const rate = Number(draft.commission_rate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          toast.error("Commission rate must be between 0 and 100.");
          return;
        }

        const { error } = await supabase
          .from("agents")
          .update({
            full_name: draft.full_name.trim(),
            phone: draft.phone.trim(),
            email: draft.email.trim(),
            company_phone: draft.company_phone.trim() || null,
            district: draft.district.trim() || null,
            village: draft.village.trim() || null,
            designation: draft.designation.trim(),
            commission_rate: rate,
            referral_code: draft.referral_code.trim(),
          })
          .eq("id", selected.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("agent_registry")
          .update({
            full_name: draft.full_name.trim(),
            phone: draft.phone.trim() || null,
            district: draft.district.trim() || null,
            village: draft.village.trim() || null,
            registered_on: draft.registered_on || null,
            received_by: draft.received_by.trim() || null,
            status: draft.status,
          })
          .eq("id", selected.id);

        if (error) throw error;
      }

      toast.success("Agent information updated.");
      setEditing(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["agents"] }),
        qc.invalidateQueries({ queryKey: ["agent-registry"] }),
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save agent information.",
      );
    } finally {
      setSaving(false);
    }
  }

  const field = (
    label: string,
    key: keyof typeof draft,
    type = "text",
  ) => (
    <label className="block space-y-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        type={type}
        value={draft[key]}
        disabled={!editing || saving}
        onChange={(e) =>
          setDraft((previous) => ({ ...previous, [key]: e.target.value }))
        }
      />
    </label>
  );

  if (q.isLoading) return <DataTableSkeleton rows={6} columns={6} />;

  if (q.isError) {
    return (
      <ErrorState
        title="Agent records could not be retrieved"
        onRetry={() => void q.refetch()}
      />
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
      <Panel title={`Agent directory (${records.length})`}>
        <p className="mb-3 text-sm text-muted-foreground">
          Select a record to view its details, edit information or open an official ID card.
        </p>

        {records.length ? (
          <div className="max-h-[680px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2">Name / ID</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((a) => {
                  const key = `${a.recordType}-${a.id}`;
                  return (
                    <tr
                      key={key}
                      className={selectedKey === key ? "bg-muted" : ""}
                    >
                      <td className="py-3 pr-2">
                        <button
                          className="text-left hover:underline"
                          onClick={() => openRecord(a)}
                        >
                          <span className="font-medium">{a.full_name}</span>
                          <br />
                          <span className="font-mono text-xs text-muted-foreground">
                            {a.displayId}
                          </span>
                        </button>
                      </td>
                      <td className="pr-2 text-xs">
                        {a.recordType === "official" ? "Official agent" : "Field register"}
                      </td>
                      <td><StatusPill value={a.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No agent records yet" />
        )}
      </Panel>

      {selected ? (
        <Panel title={`${selected.full_name} - Profile`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{selected.displayId}</p>
              <StatusPill value={selected.status} />
              <p className="mt-1 text-xs text-muted-foreground">
                {selected.recordType === "official"
                  ? "Official agent record"
                  : "Field registration only; not an official agent ID"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {selected.recordType === "official" ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `/agents/${encodeURIComponent(selected.id)}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  View ID card
                </Button>
              ) : null}

              {canManage && !editing ? (
                <Button onClick={() => setEditing(true)}>Edit details</Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {field("Full name *", "full_name")}
            {field("Phone *", "phone")}
            {selected.recordType === "official" ? field("Email", "email", "email") : null}
            {selected.recordType === "official"
              ? field("Company phone", "company_phone")
              : null}
            {field("District", "district")}
            {field("Village", "village")}

            {selected.recordType === "official" ? (
              <>
                {field("Designation", "designation")}
                {field("Commission rate (%)", "commission_rate", "number")}
                {field("Referral code", "referral_code")}
              </>
            ) : (
              <>
                {field("Registration date", "registered_on", "date")}
                {field("Received by", "received_by")}
                {editing ? (
                  <label className="block space-y-1 text-sm">
                    <span className="text-xs text-muted-foreground">Registration status</span>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={draft.status}
                      onChange={(e) =>
                        setDraft((previous) => ({ ...previous, status: e.target.value }))
                      }
                    >
                      <option value="registered">Registered</option>
                      <option value="verified">Verified</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                ) : null}
              </>
            )}
          </div>

          {editing && canManage ? (
            <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
              <Button disabled={saving} onClick={() => void saveRecord()}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  openRecord(selected);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : null}

          {!canManage ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Your account has view-only access to agent information.
            </p>
          ) : null}
        </Panel>
      ) : (
        <Panel title="Agent details">
          <EmptyState
            title="Select an agent"
            hint="Choose a record from the directory to view its details and available actions."
          />
        </Panel>
      )}
    </div>
  );
}
function Links({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("Kalexi Digital Agent Registration");
  const [newUrl, setNewUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ["agent-campaigns"],
    queryFn: () => listAgentCampaigns(),
    enabled: canManage,
  });

  async function create() {
    const campaignTitle = title.trim();
    if (!campaignTitle) {
      toast.error("Enter a registration campaign name.");
      return;
    }
    setCreating(true);
    try {
      const campaign = await createAgentCampaign({ data: { title: campaignTitle } });
      const registrationUrl = `${window.location.origin}/join/${campaign.token}`;
      setNewUrl(registrationUrl);
      await qc.invalidateQueries({ queryKey: ["agent-campaigns"] });
      try {
        await navigator.clipboard.writeText(registrationUrl);
        toast.success("Link created and copied. You can also copy it below.");
      } catch {
        toast.success("Link created. Copy it from the box below.");
      }
    } catch (error) {
      toast.error(
        `Could not create link: ${error instanceof Error ? error.message : "Please try again."}`,
      );
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Registration link copied.");
    } catch {
      window.prompt("Copy your registration link:", link);
    }
  }

  async function toggle(id: string, active: boolean) {
    try {
      await setAgentCampaignStatus({ data: { id, active } });
      await qc.invalidateQueries({ queryKey: ["agent-campaigns"] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update registration link.",
      );
    }
  }

  if (!canManage) return <NoAccess module="Digital Agent registration links" />;

  const url = (campaignToken: string) => `${window.location.origin}/join/${campaignToken}`;

  return (
    <div className="space-y-4">
      <Panel title="New registration link">
        <div className="flex flex-wrap gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button disabled={creating} onClick={() => void create()}>
            {creating ? "Generating…" : "Generate link"}
          </Button>
        </div>
        {newUrl ? (
          <div className="mt-4 space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Your registration link</p>
            <input
              aria-label="Generated registration link"
              readOnly
              value={newUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
            <Button onClick={() => void copyLink(newUrl)}>Copy link</Button>
            <p className="text-xs text-muted-foreground">
              Check that the public registration page is available before sharing.
            </p>
          </div>
        ) : null}
      </Panel>

      <Panel title="Links">
        {q.isError ? (
          <ErrorState title="Registration links could not be retrieved" onRetry={() => void q.refetch()} />
        ) : q.isPending ? (
          <DataTableSkeleton />
        ) : (q.data ?? []).length === 0 ? (
          <EmptyState title="No registration links yet" />
        ) : (
          <ul className="divide-y text-sm">
            {(q.data ?? []).map((c) => {
              const link = url(c.token);
              return (
                <li key={c.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <b>{c.title}</b>
                      <p className="text-xs text-muted-foreground">
                        {c.active ? "Active" : "Disabled"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void copyLink(link)}>
                        Copy link
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void toggle(c.id, !c.active)}
                      >
                        {c.active ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </div>
                  <input
                    aria-label={`Registration URL for ${c.title}`}
                    readOnly
                    value={link}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-9 w-full rounded-md border bg-background px-3 text-xs"
                  />
                </li>
              );
            })}
          </ul>
        )}
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
                ? "Uploading signature and saving agent information..."
                : "Saving agent information..."
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
          {saving ? "Saving..." : "Save agent"}
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
                  <td>{r.phone ?? "-"}</td>
                  <td>{r.village ?? "-"}</td>
                  <td>{r.district ?? "-"}</td>
                  <td>{r.registered_on ?? "-"}</td>
                  <td>{r.received_by ?? "-"}</td>
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
