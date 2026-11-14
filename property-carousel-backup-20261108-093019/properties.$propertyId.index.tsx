import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Download, ExternalLink, FileText, MapPin, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ErrorState, OperationProgress } from "@/components/LoadingStates";
import { NoAccess, StatusPill } from "@/components/records";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { logAudit, useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { formatMoney, formatDateTime, titleCase } from "@/lib/records";

export const Route = createFileRoute("/_authenticated/properties/$propertyId/")({
  head: () => ({
    meta: [
      { title: "Property Record — Kalexi Brokerage" },
      { name: "description", content: "Property details, verification, and secure file history." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PropertyDetailPage,
});

const FILE_CATEGORIES = [
  "photo",
  "video",
  "ownership_document",
  "land_title",
  "agreement",
  "valuation_report",
  "inspection_report",
  "other",
];
const MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function PropertyDetailPage() {
  const { propertyId } = useParams({ from: "/_authenticated/properties/$propertyId/" });
  const { data: session } = useSession();
  const access = session?.access;
  const queryClient = useQueryClient();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [fileCategory, setFileCategory] = useState("photo");
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);

  const property = useQuery({
    queryKey: ["property", propertyId],
    enabled: allows(access, "properties.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*, clients(id, client_ref, full_name, company_name)")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const assignee = useQuery({
    queryKey: ["property-assignee", property.data?.assigned_to],
    enabled: !!property.data?.assigned_to,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, department")
        .eq("id", property.data!.assigned_to!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const files = useQuery({
    queryKey: ["property-files", propertyId],
    enabled: allows(access, "properties.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_files")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return Promise.all(
        (data ?? []).map(async (file) => {
          if (file.archived_at) return { ...file, url: null };
          const { data: urlData, error: urlError } = await supabase.storage
            .from("property-files")
            .createSignedUrl(file.storage_path, 600);
          if (urlError) throw urlError;
          return { ...file, url: urlData.signedUrl };
        }),
      );
    },
  });

  const history = useQuery({
    queryKey: ["property-history", propertyId],
    enabled: allows(access, "properties.view"),
    queryFn: async () => {
      const [reviews, statusEvents] = await Promise.all([
        supabase
          .from("property_reviews")
          .select("id, decision, note, reviewed_by, reviewed_at")
          .eq("property_id", propertyId)
          .order("reviewed_at", { ascending: false }),
        supabase
          .from("property_status_events")
          .select("id, previous_status, next_status, changed_by, changed_at")
          .eq("property_id", propertyId)
          .order("changed_at", { ascending: false }),
      ]);
      if (reviews.error) throw reviews.error;
      if (statusEvents.error) throw statusEvents.error;
      return { reviews: reviews.data ?? [], statusEvents: statusEvents.data ?? [] };
    },
  });

  const review = useMutation({
    mutationFn: async (decision: "verified" | "rejected") => {
      if (!session) throw new Error("Your session has expired. Sign in again.");
      const { data, error } = await supabase.rpc("review_property", {
        _property_id: propertyId,
        _decision: decision,
        _note: reviewNote.trim(),
      });
      if (error) throw error;
      await logAudit({
        actorId: session.userId,
        actorEmail: session.email,
        action: `property.${decision}`,
        entityType: "property",
        entityId: data.id,
        newValue: { property_ref: data.property_ref, note: reviewNote.trim() },
      });
      return data;
    },
    onSuccess: async (data) => {
      toast.success(`Property ${data.property_ref} ${data.verification_status}.`);
      setReviewNote("");
      await queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
      await queryClient.invalidateQueries({ queryKey: ["property-history", propertyId] });
    },
    onError: (error: Error) => toast.error(`Property review failed: ${error.message}`),
  });

  const transition = useMutation({
    mutationFn: async (nextStatus: string) => {
      const { data, error } = await supabase.rpc("transition_property_status", {
        _property_id: propertyId,
        _next_status: nextStatus,
      });
      if (error) throw error;
      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "property.status_changed",
          entityType: "property",
          entityId: data.id,
          newValue: { property_ref: data.property_ref, status: data.status },
        });
      }
      return data;
    },
    onSuccess: async (data) => {
      toast.success(`Property status changed to ${titleCase(data.status.replaceAll("_", " "))}.`);
      await queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
      await queryClient.invalidateQueries({ queryKey: ["property-history", propertyId] });
    },
    onError: (error: Error) =>
      toast.error(`Property status could not be changed: ${error.message}`),
  });

  async function uploadFiles(selected: FileList | null) {
    if (!selected?.length || !session) return;
    setBusy(true);
    try {
      for (const file of Array.from(selected)) {
        if (!MIME_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_FILE_SIZE) {
          throw new Error(`${file.name}: select a supported file no larger than 50 MB.`);
        }
        const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-120);
        const path = `${session.userId}/${propertyId}/${crypto.randomUUID()}-${safeName}`;
        const { error: storageError } = await supabase.storage
          .from("property-files")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (storageError) throw storageError;
        const { error: rowError } = await supabase.from("property_files").insert({
          property_id: propertyId,
          category: fileCategory,
          display_name: file.name.slice(0, 255),
          storage_path: path,
          mime_type: file.type,
          byte_size: file.size,
          uploaded_by: session.userId,
        });
        if (rowError) {
          const { error: cleanupError } = await supabase.storage
            .from("property-files")
            .remove([path]);
          if (cleanupError) {
            console.error("[properties] Failed to clean up an unlinked file.", cleanupError);
            throw new Error(`${rowError.message} The uploaded object could not be removed.`);
          }
          throw rowError;
        }
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "property.file_uploaded",
          entityType: "property",
          entityId: propertyId,
          newValue: { file_name: file.name, category: fileCategory, byte_size: file.size },
        });
      }
      toast.success("Property files uploaded.");
      await queryClient.invalidateQueries({ queryKey: ["property-files", propertyId] });
    } catch (error) {
      console.error("[properties] File upload failed.", error);
      toast.error(error instanceof Error ? error.message : "Property files could not be uploaded.");
    } finally {
      setBusy(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function archiveFile(file: NonNullable<typeof files.data>[number]) {
    if (!session || !window.confirm(`Remove ${file.display_name} from this property?`)) return;
    const { error: storageError } = await supabase.storage
      .from("property-files")
      .remove([file.storage_path]);
    if (storageError) {
      toast.error(`File could not be removed: ${storageError.message}`);
      return;
    }
    const { data, error } = await supabase
      .from("property_files")
      .update({ archived_at: new Date().toISOString(), archived_by: session.userId })
      .eq("id", file.id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      console.error("[properties] File object removed but metadata could not be archived.", error);
      toast.error(
        `The file object was removed, but its record could not be updated: ${error?.message ?? "No editable record."}`,
      );
      return;
    }
    await logAudit({
      actorId: session.userId,
      actorEmail: session.email,
      action: "property.file_archived",
      entityType: "property",
      entityId: propertyId,
      newValue: { file_id: file.id, display_name: file.display_name },
    });
    toast.success("Property file removed.");
    await queryClient.invalidateQueries({ queryKey: ["property-files", propertyId] });
  }

  if (!allows(access, "properties.view")) {
    return (
      <AppShell>
        <PageHeader title="Property record" />
        <NoAccess module="Properties & Assets" />
      </AppShell>
    );
  }

  if (property.isLoading)
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading property record…</p>
      </AppShell>
    );
  if (property.isError) {
    return (
      <AppShell>
        <ErrorState
          title="Property record could not be retrieved"
          description="Check your access and connection, then retry."
          onRetry={() => void property.refetch()}
        />
      </AppShell>
    );
  }
  if (!property.data) {
    return (
      <AppShell>
        <PageHeader
          title="Property record not found"
          description="This property is not available to your account."
        />
      </AppShell>
    );
  }

  const asset = property.data;
  const nextStatus =
    asset.status === "available"
      ? ["under_offer"]
      : asset.status === "under_offer"
        ? ["available", "sold", "leased"]
        : [];

  return (
    <AppShell>
      <PageHeader
        title={asset.name}
        description={`${asset.property_ref} · ${titleCase(asset.category)} · ${asset.location}`}
        actions={
          <Button variant="outline" asChild>
            <Link to="/properties">Property register</Link>
          </Button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card className="shadow-[var(--shadow-panel)]">
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
              <PropertyValue label="Property reference" value={asset.property_ref} />
              <PropertyValue
                label="Client"
                value={asset.clients?.company_name || asset.clients?.full_name || "—"}
              >
                {asset.clients ? (
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: asset.clients.id }}
                    className="text-xs text-primary hover:underline"
                  >
                    {asset.clients.client_ref} · View client
                  </Link>
                ) : null}
              </PropertyValue>
              <PropertyValue label="Category" value={titleCase(asset.category)} />
              <PropertyValue label="Location" value={asset.location}>
                <MapPin color="#DC2626" strokeWidth={2.2} className="mr-1 inline h-3.5 w-3.5 shrink-0" />
              </PropertyValue>
              <PropertyValue
                label="Asking price"
                value={
                  asset.asking_price === null
                    ? "Not provided"
                    : formatMoney(asset.asking_price, asset.currency)
                }
              />
              <PropertyValue label="Status" value="">
                <StatusPill value={asset.status} />
              </PropertyValue>
              <PropertyValue label="Verification" value="">
                <StatusPill value={asset.verification_status} />
              </PropertyValue>
              <PropertyValue
                label="Assigned officer"
                value={assignee.data?.full_name ?? "Unassigned"}
              />
              <div className="sm:col-span-2">
                <p className="label-caps">Description and ownership notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {asset.description || "No description recorded."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-panel)]">
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="font-semibold">Property documents and media</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Private files are permission-checked and served through short-lived signed links.
                </p>
              </div>
              {allows(access, "properties.create") || allows(access, "properties.edit") ? (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-48 space-y-1">
                    <Label>File category</Label>
                    <Select value={fileCategory} onValueChange={setFileCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FILE_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {titleCase(category.replaceAll("_", " "))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <input
                    ref={uploadRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    onChange={(event) => void uploadFiles(event.currentTarget.files)}
                  />
                  <Button disabled={busy} onClick={() => uploadRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    {busy ? "Uploading…" : "Upload files"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Images, videos, PDF, Word, or Excel; up to 50 MB per file.
                  </span>
                </div>
              ) : null}
              {busy ? <OperationProgress message="Uploading property files…" /> : null}
              {files.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading file history…</p>
              ) : files.isError ? (
                <ErrorState
                  title="Property files could not be loaded"
                  description="Your access or a signed-file link may have expired."
                  onRetry={() => void files.refetch()}
                />
              ) : files.data?.length ? (
                <ul className="divide-y rounded-md border">
                  {files.data.map((file) => (
                    <li
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {file.url && file.mime_type.startsWith("image/") ? (
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Preview ${file.display_name}`}
                          >
                            <img
                              src={file.url}
                              alt={file.display_name}
                              className="h-14 w-14 rounded border object-cover"
                            />
                          </a>
                        ) : (
                          <FileText color="#475569" strokeWidth={2.2}
                            className="h-8 w-8 shrink-0 text-muted-foreground shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{file.display_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {titleCase(file.category.replaceAll("_", " "))} ·{" "}
                            {(file.byte_size / 1024 / 1024).toFixed(2)} MB ·{" "}
                            {formatDateTime(file.created_at)}
                          </p>
                          {file.archived_at ? (
                            <p className="text-xs text-muted-foreground">
                              Removed {formatDateTime(file.archived_at)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {file.url && file.mime_type.startsWith("video/") ? (
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="mr-1 inline h-3.5 w-3.5" />
                            Play
                          </a>
                        ) : null}
                        {file.url ? (
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            download={file.display_name}
                            className="text-xs text-primary hover:underline"
                          >
                            <Download className="mr-1 inline h-3.5 w-3.5" />
                            Open / download
                          </a>
                        ) : null}
                        {!file.archived_at && allows(access, "properties.edit") ? (
                          <Button
                            aria-label={`Remove ${file.display_name}`}
                            size="icon"
                            variant="ghost"
                            onClick={() => void archiveFile(file)}
                          >
                            <Trash2 color="#DC2626" strokeWidth={2.2} className="h-4 w-4 shrink-0" />
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                  No property files have been uploaded.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-panel)]">
            <CardContent className="space-y-3 p-5">
              <h2 className="font-semibold">Verification and status history</h2>
              {history.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading audit history…</p>
              ) : history.isError ? (
                <ErrorState
                  title="Property history could not be loaded"
                  onRetry={() => void history.refetch()}
                />
              ) : (
                <div className="space-y-3">
                  {history.data?.reviews.map((event) => (
                    <div key={event.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">Review {event.decision}</p>
                      {event.note ? (
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                          {event.note}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(event.reviewed_at)} · {event.reviewed_by}
                      </p>
                    </div>
                  ))}
                  {history.data?.statusEvents.map((event) => (
                    <div key={event.id} className="rounded-md border p-3 text-sm">
                      <p>
                        {titleCase(event.previous_status.replaceAll("_", " "))} →{" "}
                        <span className="font-medium">
                          {titleCase(event.next_status.replaceAll("_", " "))}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(event.changed_at)} · {event.changed_by}
                      </p>
                    </div>
                  ))}
                  {!history.data?.reviews.length && !history.data?.statusEvents.length ? (
                    <p className="text-sm text-muted-foreground">No status changes recorded.</p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {asset.status === "pending_verification" && allows(access, "properties.verify") ? (
            <Card className="shadow-[var(--shadow-panel)]">
              <CardContent className="space-y-3 p-5">
                <h2 className="font-semibold">Review property</h2>
                <p className="text-sm text-muted-foreground">
                  Approval makes the property available. Rejection is recorded as a final review
                  decision.
                </p>
                <Label htmlFor="property-review-note">Review note</Label>
                <Textarea
                  id="property-review-note"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  maxLength={2000}
                  rows={4}
                />
                <div className="flex gap-2">
                  <Button disabled={review.isPending} onClick={() => review.mutate("verified")}>
                    Approve and verify
                  </Button>
                  <Button
                    disabled={review.isPending}
                    variant="destructive"
                    onClick={() => review.mutate("rejected")}
                  >
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {nextStatus.length && allows(access, "properties.edit") ? (
            <Card className="shadow-[var(--shadow-panel)]">
              <CardContent className="space-y-3 p-5">
                <h2 className="font-semibold">Update property status</h2>
                <p className="text-sm text-muted-foreground">
                  Status transitions are validated and recorded by the database.
                </p>
                {nextStatus.map((next) => (
                  <Button
                    key={next}
                    className="w-full"
                    variant="outline"
                    disabled={transition.isPending}
                    onClick={() => transition.mutate(next)}
                  >
                    Mark {titleCase(next.replaceAll("_", " "))}
                  </Button>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function PropertyValue({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="label-caps">{label}</p>
      {value ? <p className="mt-1 text-sm font-medium">{value}</p> : null}
      {children ? <div className="mt-1 text-sm">{children}</div> : null}
    </div>
  );
}
