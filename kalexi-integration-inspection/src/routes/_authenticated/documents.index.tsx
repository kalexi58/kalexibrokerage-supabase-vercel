import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState, NoAccess, StatusPill } from "@/components/records";
import { archiveRecord, formatDateTime, titleCase } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationProgress } from "@/components/LoadingStates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/documents/")({
  head: () => ({
    meta: [
      { title: "Document Vault — Kalexi Brokerage" },
      {
        name: "description",
        content: "Secure, versioned vault for contracts, titles, identification and deal papers.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocumentsPage,
});

const GENERAL_PARENT = "00000000-0000-0000-0000-000000000000";
const DOC_TYPES = [
  "identification",
  "title_deed",
  "contract",
  "agreement",
  "invoice",
  "receipt",
  "licence",
  "report",
  "correspondence",
  "other",
];

interface DocRow {
  id: string;
  document_ref: string;
  title: string;
  document_type: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  parent_type: string;
  parent_id: string;
  verification_status: string;
  confidential: boolean;
  version: number;
  status: string;
  created_at: string;
}

function DocumentsPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [type, setType] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [versionFor, setVersionFor] = useState<DocRow | null>(null);

  const documents = useQuery({
    queryKey: ["documents", term, type],
    enabled: allows(access, "documents.view"),
    queryFn: async () => {
      let query = supabase
        .from("documents")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (type !== "all") query = query.eq("document_type", type);
      const q = term.trim();
      if (q) query = query.or(`document_ref.ilike.%${q}%,title.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as DocRow[];
    },
  });

  async function download(doc: DocRow) {
    const { data, error } = await supabase.storage
      .from("kalexi-vault")
      .createSignedUrl(doc.storage_path, 120);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open this document.");
      return;
    }
    if (session) {
      await logAudit({
        actorId: session.userId,
        actorEmail: session.email,
        action: "document.downloaded",
        entityType: "documents",
        entityId: doc.id,
        newValue: { document_ref: doc.document_ref },
      });
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const setVerification = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("documents")
        .update({ verification_status: status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Verification status updated.");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error: Error) => {
      console.error("[documents] Verification update failed.", error);
      toast.error("The verification status could not be updated. Try again.");
    },
  });

  if (!allows(access, "documents.view")) {
    return (
      <AppShell>
        <PageHeader title="Document vault" />
        <NoAccess module="the Document Vault" />
      </AppShell>
    );
  }

  const rows = documents.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Document vault"
        description="Versioned, access-controlled repository for every deal, client and case paper."
        actions={
          allows(access, "documents.create") ? (
            <Button onClick={() => setUploadOpen(true)}>Upload document</Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search reference or title"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Document type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {DOC_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {titleCase(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {documents.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading vault…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="The vault is empty" hint="Upload the first document to begin." />
      ) : (
        <div className="space-y-2">
          {rows.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="ref-mono text-[11px] text-muted-foreground">{doc.document_ref}</p>
                <p className="truncate text-sm font-medium">
                  {doc.title}
                  {doc.confidential ? (
                    <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase text-destructive">
                      Confidential
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {titleCase(doc.document_type)} · v{doc.version} · {titleCase(doc.parent_type)} ·{" "}
                  {formatDateTime(doc.created_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill value={doc.verification_status} />
                {allows(access, "documents.download") ? (
                  <Button size="sm" variant="outline" onClick={() => download(doc)}>
                    Open
                  </Button>
                ) : null}
                {allows(access, "documents.edit") ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setVersionFor(doc)}>
                      New version
                    </Button>
                    <Select
                      value={doc.verification_status}
                      onValueChange={(v) => setVerification.mutate({ id: doc.id, status: v })}
                    >
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["unverified", "in_review", "verified", "rejected"].map((s) => (
                          <SelectItem key={s} value={s}>
                            {titleCase(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : null}
                {allows(access, "documents.archive") ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const reason = window.prompt("Reason for archiving this document?");
                      if (!reason || !session) return;
                      try {
                        await archiveRecord({
                          table: "documents",
                          id: doc.id,
                          entityRef: doc.document_ref,
                          title: doc.title,
                          previousStatus: doc.status,
                          reason,
                          actorId: session.userId,
                          actorEmail: session.email,
                        });
                        toast.success("Document archived.");
                        qc.invalidateQueries({ queryKey: ["documents"] });
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    Archive
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onDone={() => {
          setUploadOpen(false);
          qc.invalidateQueries({ queryKey: ["documents"] });
        }}
      />

      <VersionDialog
        doc={versionFor}
        onOpenChange={() => setVersionFor(null)}
        onDone={() => {
          setVersionFor(null);
          qc.invalidateQueries({ queryKey: ["documents"] });
        }}
      />
    </AppShell>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { data: session } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("contract");
  const [parentType, setParentType] = useState("general");
  const [parentId, setParentId] = useState("");
  const [confidential, setConfidential] = useState(false);

  const clients = useQuery({
    queryKey: ["vault-clients"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, client_ref, full_name")
        .is("archived_at", null)
        .limit(300);
      return data ?? [];
    },
  });

  const deals = useQuery({
    queryKey: ["vault-deals"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("deals")
        .select("id, deal_ref, title")
        .is("archived_at", null)
        .limit(300);
      return data ?? [];
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("Choose a file to upload.");
      const ref = `KBL-DOC-${Date.now().toString().slice(-6)}`;
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `documents/${ref}/v1-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("kalexi-vault")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("documents")
        .insert({
          document_ref: ref,
          title: title.trim() || file.name,
          document_type: docType,
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
          parent_type: parentType,
          parent_id: parentType === "general" ? GENERAL_PARENT : parentId,
          verification_status: "unverified",
          confidential,
          version: 1,
          status: "active",
          created_by: session?.userId ?? null,
        })
        .select("id, document_ref")
        .single();
      if (error) throw error;

      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "document.uploaded",
          entityType: "documents",
          entityId: data.id,
          newValue: { document_ref: data.document_ref, confidential },
        });
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Document filed in the vault.");
      setTitle("");
      setParentId("");
      setConfidential(false);
      onDone();
    },
    onError: (error: Error) => {
      console.error("[documents] Upload failed.", error);
      toast.error("The document could not be filed. Check your connection and try again.");
    },
  });

  const needsParent = parentType !== "general";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload to the vault</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>File</Label>
            <Input type="file" ref={fileRef} />
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Document type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {titleCase(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Attach to</Label>
            <Select
              value={parentType}
              onValueChange={(v) => {
                setParentType(v);
                setParentId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Company file (general)</SelectItem>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="deal">Deal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {needsParent ? (
            <div className="space-y-2">
              <Label>{parentType === "client" ? "Client" : "Deal"}</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select record" />
                </SelectTrigger>
                <SelectContent>
                  {parentType === "client"
                    ? (clients.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.full_name} · {c.client_ref}
                        </SelectItem>
                      ))
                    : (deals.data ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.title} · {d.deal_ref}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={confidential} onCheckedChange={(v) => setConfidential(!!v)} />
            Mark as confidential
          </label>
          {upload.isPending ? (
            <OperationProgress message="Uploading and filing the document…" />
          ) : null}
          <Button
            className="w-full"
            disabled={upload.isPending || (needsParent && !parentId)}
            onClick={() => upload.mutate()}
          >
            {upload.isPending ? "Uploading…" : "Upload document"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VersionDialog({
  doc,
  onOpenChange,
  onDone,
}: {
  doc: DocRow | null;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { data: session } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");

  const upload = useMutation({
    mutationFn: async () => {
      if (!doc) return;
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("Choose the replacement file.");
      const nextVersion = doc.version + 1;
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `documents/${doc.document_ref}/v${nextVersion}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("kalexi-vault")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { error: versionError } = await supabase.from("document_versions").insert({
        document_id: doc.id,
        version: nextVersion,
        storage_path: path,
        note: note.trim() || null,
        status: "active",
        created_by: session?.userId ?? null,
      });
      if (versionError) throw versionError;

      const { error } = await supabase
        .from("documents")
        .update({
          storage_path: path,
          version: nextVersion,
          mime_type: file.type || null,
          size_bytes: file.size,
          verification_status: "unverified",
        })
        .eq("id", doc.id);
      if (error) throw error;

      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "document.version_added",
          entityType: "documents",
          entityId: doc.id,
          newValue: { version: nextVersion },
        });
      }
    },
    onSuccess: () => {
      toast.success("New version filed.");
      setNote("");
      onDone();
    },
    onError: (error: Error) => {
      console.error("[documents] New version upload failed.", error);
      toast.error("The document version could not be filed. Check your connection and try again.");
    },
  });

  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New version — {doc?.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            The current version ({doc?.version}) is retained in the version history and the document
            returns to unverified status.
          </p>
          <div className="space-y-2">
            <Label>Replacement file</Label>
            <Input type="file" ref={fileRef} />
          </div>
          <div className="space-y-2">
            <Label>Version note</Label>
            <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </div>
          {upload.isPending ? (
            <OperationProgress message="Uploading and filing the new version…" />
          ) : null}
          <Button className="w-full" disabled={upload.isPending} onClick={() => upload.mutate()}>
            {upload.isPending ? "Uploading…" : "File new version"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
