import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { EmptyState } from "@/components/records";
import { formatDateTime } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState, OperationProgress } from "@/components/LoadingStates";

export const MEDIA_BUCKET = "kalexi-vault";

export interface MediaRow {
  id: string;
  media_ref: string;
  caption: string | null;
  media_type: string;
  storage_path: string;
  mime_type: string | null;
  parent_type: string;
  parent_id: string;
  status: string;
  created_at: string;
}

export function mediaKindOf(file: File): "image" | "video" | "file" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

async function signedUrl(path: string, seconds = 600) {
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, seconds);
  if (error || !data) throw new Error(error?.message ?? "Could not open this file.");
  return data.signedUrl;
}

/** Reusable capture panel: photos & videos recorded against any record. */
export function MediaGallery({
  parentType,
  parentId,
  title = "Photos & videos",
  description,
  compact = false,
}: {
  parentType: string;
  parentId: string;
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const { data: session } = useSession();
  const access = session?.access;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ row: MediaRow; url: string } | null>(null);

  const canView = allows(access, "documents.view");
  const canUpload = allows(access, "documents.create");
  const canDelete = allows(access, "documents.archive") || allows(access, "documents.delete");

  const media = useQuery({
    queryKey: ["media", parentType, parentId],
    enabled: canView && !!parentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media")
        .select("*")
        .eq("parent_type", parentType)
        .eq("parent_id", parentId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as MediaRow[];
      const withUrls = await Promise.all(
        rows.map(async (row) => {
          try {
            return { row, url: await signedUrl(row.storage_path) };
          } catch {
            return { row, url: "" };
          }
        }),
      );
      return withUrls;
    },
  });

  async function upload(files: FileList | null) {
    if (!files?.length || !session) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const safe = file.name.replace(/[^\w.-]+/g, "_");
        const path = `media/${parentType}/${parentId}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(
            path,
            file,
            file.type ? { contentType: file.type, upsert: false } : { upsert: false },
          );
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("media").insert({
          caption: caption.trim() || file.name,
          media_type: mediaKindOf(file),
          storage_path: path,
          mime_type: file.type || null,
          parent_type: parentType,
          parent_id: parentId,
          created_by: session.userId,
        } as never);
        if (insErr) throw insErr;
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "media.uploaded",
          entityType: parentType,
          entityId: parentId,
          newValue: { file: safe, kind: mediaKindOf(file) },
        });
      }
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Media captured to the record.");
      qc.invalidateQueries({ queryKey: ["media", parentType, parentId] });
    } catch (e) {
      console.error("[media] Upload failed.", e);
      toast.error("Media could not be uploaded. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const remove = useMutation({
    mutationFn: async (row: MediaRow) => {
      if (!session) throw new Error("No session.");
      const { error } = await supabase
        .from("media")
        .update({
          archived_at: new Date().toISOString(),
          archived_by: session.userId,
          archive_reason: "Removed from record",
        })
        .eq("id", row.id);
      if (error) throw error;
      await logAudit({
        actorId: session.userId,
        actorEmail: session.email,
        action: "media.removed",
        entityType: parentType,
        entityId: parentId,
        newValue: { media_ref: row.media_ref },
      });
    },
    onSuccess: () => {
      toast.success("Media removed.");
      qc.invalidateQueries({ queryKey: ["media", parentType, parentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView) return null;

  const items = media.data ?? [];

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Images and video recorded against this record — stored in the secure vault.
            </p>
          )}
        </div>
        {canUpload ? (
          <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Uploading…" : "Upload media"}
          </Button>
        ) : null}
      </header>

      <div className="space-y-4 p-4">
        {canUpload ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption (optional)"
              className="max-w-xs"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              capture={undefined}
              className="hidden"
              onChange={(e) => void upload(e.target.files)}
            />
            <p className="text-xs text-muted-foreground">Images and videos, multiple allowed.</p>
          </div>
        ) : null}

        {busy ? <OperationProgress message="Uploading selected media…" /> : null}

        {media.isLoading ? (
          <p className="text-sm text-muted-foreground">Retrieving media for this record…</p>
        ) : media.isError ? (
          <ErrorState
            title="Media could not be retrieved"
            description="Check your connection and retry."
            onRetry={() => void media.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="No media recorded"
            {...(canUpload ? { hint: "Upload photos or video evidence for this record." } : {})}
          />
        ) : (
          <div
            className={`grid gap-3 ${compact ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"}`}
          >
            {items.map(({ row, url }) => (
              <figure key={row.id} className="overflow-hidden rounded-md border bg-muted/30">
                <button
                  type="button"
                  className="block w-full"
                  onClick={() => url && setPreview({ row, url })}
                >
                  {row.media_type === "image" && url ? (
                    <img
                      src={url}
                      alt={row.caption ?? row.media_ref}
                      loading="lazy"
                      className="h-32 w-full object-cover"
                    />
                  ) : row.media_type === "video" && url ? (
                    <video src={url} className="h-32 w-full object-cover" muted playsInline />
                  ) : (
                    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                      {row.mime_type ?? "File"}
                    </div>
                  )}
                </button>
                <figcaption className="space-y-1 px-2 py-2">
                  <p className="truncate text-xs font-medium">{row.caption ?? row.media_ref}</p>
                  <p className="ref-mono text-[10px] text-muted-foreground">{row.media_ref}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </p>
                  {canDelete ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1 text-[11px] text-destructive"
                      onClick={() => remove.mutate(row)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.row.caption ?? preview?.row.media_ref}</DialogTitle>
          </DialogHeader>
          {preview ? (
            preview.row.media_type === "video" ? (
              <video src={preview.url} controls className="max-h-[70vh] w-full rounded-md" />
            ) : (
              <img
                src={preview.url}
                alt={preview.row.caption ?? preview.row.media_ref}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
            )
          ) : null}
          {preview ? (
            <a
              href={preview.url}
              target="_blank"
              rel="noopener"
              className="text-xs text-primary underline"
            >
              Open original in new tab
            </a>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
