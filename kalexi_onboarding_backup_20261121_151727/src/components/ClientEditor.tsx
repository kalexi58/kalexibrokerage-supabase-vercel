import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];
const FIELDS = [
  ["full_name", "Full name"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["company_name", "Company"],
  ["client_type", "Client type"],
  ["sector", "Sector"],
  ["branch", "Branch"],
  ["address", "Address"],
  ["id_type", "ID type"],
  ["id_number", "ID number"],
  ["status", "Status"],
] as const;

export function ClientEditor({ client }: { client: Client }) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const init = () =>
    ({
      ...Object.fromEntries(FIELDS.map(([k]) => [k, (client[k] as string | null) ?? ""])),
      requirement: client.requirement,
    }) as Record<string, string>;
  const [draft, setDraft] = useState(init);
  if (!allows(session?.access, "clients.edit")) return null;

  async function save() {
    if (!session) return;
    if (!(draft["full_name"] ?? "").trim() || !(draft["phone"] ?? "").trim()) {
      toast.error("Name and phone are required.");
      return;
    }
    setBusy(true);
    const payload = Object.fromEntries(
      Object.entries(draft).map(([k, v]) => [
        k,
        v.trim() ||
          (["full_name", "phone", "client_type", "sector", "status", "requirement"].includes(k)
            ? v
            : null),
      ]),
    );
    let uploadedPath: string | null = null;
    if (photo) {
      const extension = photo.type === "image/jpeg" ? "jpg" : photo.type.split("/")[1];
      uploadedPath = `${session.userId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("client-photos")
        .upload(uploadedPath, photo, { contentType: photo.type, upsert: false });
      if (uploadError) {
        setBusy(false);
        toast.error(`The profile photo could not be uploaded: ${uploadError.message}`);
        return;
      }
    }
    const { data: updated, error } = await supabase
      .from("clients")
      .update({ ...payload, ...(uploadedPath ? { photo_path: uploadedPath } : {}) } as never)
      .eq("id", client.id)
      .select("id")
      .maybeSingle();
    setBusy(false);
    if (error || !updated) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from("client-photos")
          .remove([uploadedPath]);
        if (cleanupError) {
          console.error("[clients] Could not remove an unlinked replacement photo.", cleanupError);
        }
      }
      toast.error(
        `Client details could not be saved: ${error?.message ?? "The record is no longer available to edit."}`,
      );
      return;
    }
    let previousPhotoCleanupFailed = false;
    if (uploadedPath && client.photo_path) {
      const { error: removeError } = await supabase.storage
        .from("client-photos")
        .remove([client.photo_path]);
      if (removeError) {
        console.error("[clients] Could not remove the replaced profile photo.", removeError);
        previousPhotoCleanupFailed = true;
      }
    }
    await logAudit({
      actorId: session.userId,
      actorEmail: session.email,
      action: "client.updated",
      entityType: "client",
      entityId: client.id,
      newValue: { ...payload, profile_photo_changed: Boolean(uploadedPath) },
    });
    await qc.invalidateQueries({ queryKey: ["client", client.id] });
    await qc.invalidateQueries({ queryKey: ["client-ack", client.id] });
    if (previousPhotoCleanupFailed) {
      toast.error(
        "Client details were saved, but the previous private photo could not be removed.",
      );
    } else {
      toast.success("Client details saved");
    }
    setOpen(false);
    setPhoto(null);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraft(init());
          setPhoto(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Pencil color="#2563EB" strokeWidth={2.2} />
          Edit details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit client {client.client_ref}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([k, l]) => (
            <div key={k}>
              <Label htmlFor={`c-${k}`}>{l}</Label>
              <Input
                id={`c-${k}`}
                value={draft[k]}
                onChange={(e) => setDraft((p) => ({ ...p, [k]: e.target.value }))}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Label htmlFor="c-req">Requirement</Label>
            <Textarea
              id="c-req"
              rows={4}
              value={draft["requirement"]}
              onChange={(e) => setDraft((p) => ({ ...p, requirement: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="c-photo">Replace profile photo</Label>
            <Input
              id="c-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                if (
                  file &&
                  (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
                    file.size > 5 * 1024 * 1024)
                ) {
                  toast.error("Choose a JPEG, PNG, or WebP image up to 5 MB.");
                  event.currentTarget.value = "";
                  setPhoto(null);
                  return;
                }
                setPhoto(file);
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave empty to keep the current photo.
            </p>
          </div>
        </div>
        <Button disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
