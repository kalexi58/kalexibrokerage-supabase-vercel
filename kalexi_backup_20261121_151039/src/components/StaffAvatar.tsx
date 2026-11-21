import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const AVATAR_BUCKET = "kalexi-avatars";

function initials(name?: string | null) {
  if (!name) return "K";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Resolves a stored avatar reference (storage path or absolute URL) to a viewable URL. */
export function useAvatarUrl(photoUrl?: string | null) {
  return useQuery({
    queryKey: ["avatar-url", photoUrl],
    enabled: !!photoUrl,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!photoUrl) return null;
      if (/^https?:\/\//.test(photoUrl)) return photoUrl;
      const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(photoUrl, 3600);
      return data?.signedUrl ?? null;
    },
  });
}

export function StaffAvatar({
  photoUrl,
  name,
  className,
}: {
  photoUrl?: string | null | undefined;
  name?: string | null | undefined;
  className?: string | undefined;
}) {
  const { data: url } = useAvatarUrl(photoUrl);
  return (
    <span
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/25 bg-gradient-to-br from-primary/25 to-primary/5 text-sm font-semibold text-foreground",
        className,
      )}
    >
      {url ? (
        <img src={url} alt={name ? `${name} profile photo` : "Profile photo"} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Avatar with an upload control — used by the admin for any staff member, and on My Account. */
export function AvatarUploader({
  userId,
  name,
  photoUrl,
  onUploaded,
  disabled,
}: {
  userId: string;
  name?: string | null | undefined;
  photoUrl?: string | null | undefined;
  onUploaded: (path: string) => void | Promise<void>;
  disabled?: boolean | undefined;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(error.message);
      await onUploaded(path);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <StaffAvatar photoUrl={photoUrl} name={name} className="h-16 w-16 text-base" />
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || disabled}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Uploading…" : photoUrl ? "Replace photo" : "Upload photo"}
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">JPG or PNG, square works best.</p>
      </div>
    </div>
  );
}
