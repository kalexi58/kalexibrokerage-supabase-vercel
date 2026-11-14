import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { MediaGallery } from "@/components/MediaGallery";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { NoAccess, EmptyState } from "@/components/records";
import { formatDateTime, titleCase } from "@/lib/records";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/media/")({
  head: () => ({
    meta: [
      { title: "Media Archive — Kalexi Brokerage" },
      {
        name: "description",
        content:
          "Photos and video recorded against clients, deals, opportunities and staff records.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Media Archive — Kalexi Brokerage" },
      {
        property: "og:description",
        content: "Central library of images and video captured across Kalexi operations.",
      },
    ],
  }),
  component: MediaPage,
});

const PARENTS: { value: string; label: string; table: string; refField: string; nameField: string }[] =
  [
    { value: "clients", label: "Client", table: "clients", refField: "client_ref", nameField: "full_name" },
    { value: "deals", label: "Deal", table: "deals", refField: "deal_ref", nameField: "title" },
    {
      value: "opportunities",
      label: "Opportunity",
      table: "opportunities",
      refField: "opportunity_ref",
      nameField: "title",
    },
    { value: "profiles", label: "Staff member", table: "profiles", refField: "email", nameField: "full_name" },
  ];

interface Row {
  id: string;
  media_ref: string;
  caption: string | null;
  media_type: string;
  parent_type: string;
  parent_id: string;
  created_at: string;
}

function MediaPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const [parentType, setParentType] = useState("clients");
  const [term, setTerm] = useState("");
  const [recordId, setRecordId] = useState("");
  const [kind, setKind] = useState("all");

  const config = useMemo(
    () => PARENTS.find((p) => p.value === parentType) ?? PARENTS[0]!,
    [parentType],
  );

  const records = useQuery({
    queryKey: ["media-records", parentType, term],
    enabled: allows(access, "documents.view"),
    queryFn: async () => {
      let query = supabase
        .from(config.table as "clients")
        .select(`id, ${config.refField}, ${config.nameField}`)
        .order("created_at", { ascending: false })
        .limit(50);
      const q = term.trim();
      if (q) query = query.ilike(config.nameField as "full_name", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Record<string, string>[];
    },
  });

  const recent = useQuery({
    queryKey: ["media-recent", kind],
    enabled: allows(access, "documents.view"),
    queryFn: async () => {
      let query = supabase
        .from("media")
        .select("id, media_ref, caption, media_type, parent_type, parent_id, created_at")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(40);
      if (kind !== "all") query = query.eq("media_type", kind);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  if (!allows(access, "documents.view")) {
    return (
      <AppShell>
        <PageHeader title="Media archive" />
        <NoAccess module="the Media Archive" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Media archive"
        description="Capture and review photos and video recorded against clients, deals, opportunities and staff."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <div className="space-y-2">
            <Label className="text-xs">Record type</Label>
            <Select
              value={parentType}
              onValueChange={(v) => {
                setParentType(v);
                setRecordId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARENTS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Find record</Label>
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search by name…"
            />
          </div>

          <div className="max-h-80 space-y-1 overflow-y-auto">
            {(records.data ?? []).map((r) => (
              <button
                key={r['id']}
                type="button"
                onClick={() => setRecordId(r['id']!)}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  recordId === r['id'] ? "bg-accent font-medium" : "hover:bg-accent/60"
                }`}
              >
                <span className="block truncate">{r[config.nameField] ?? "—"}</span>
                <span className="ref-mono block truncate text-[11px] text-muted-foreground">
                  {r[config.refField] ?? ""}
                </span>
              </button>
            ))}
            {records.data && records.data.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">No records found.</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          {recordId ? (
            <MediaGallery
              parentType={parentType}
              parentId={recordId}
              title={`${config.label} media`}
            />
          ) : (
            <EmptyState
              title="Select a record"
              hint="Pick a client, deal, opportunity or staff member to view and upload its media."
            />
          )}

          <section className="rounded-lg border bg-card">
            <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Recently captured</h2>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All media</SelectItem>
                  <SelectItem value="image">Images</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                  <SelectItem value="file">Files</SelectItem>
                </SelectContent>
              </Select>
            </header>
            <div className="p-4">
              {(recent.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing captured yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {(recent.data ?? []).map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 py-2">
                      <span className="ref-mono text-xs text-muted-foreground">{m.media_ref}</span>
                      <span className="flex-1 truncate">{m.caption ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {titleCase(m.media_type)} · {titleCase(m.parent_type)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(m.created_at)}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-primary underline"
                        onClick={() => {
                          setParentType(m.parent_type);
                          setRecordId(m.parent_id);
                        }}
                      >
                        Open record
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
