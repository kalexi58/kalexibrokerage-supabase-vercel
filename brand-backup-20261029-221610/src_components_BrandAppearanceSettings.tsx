import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageUp, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  createBrandLogoUpload,
  getCompanyBranding,
  saveBrandAppearance,
} from "@/lib/brand.functions";

const MAX_LOGO_SIZE = 5 * 1024 * 1024;
const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function BrandAppearanceSettings() {
  const queryClient = useQueryClient();
  const getBranding = useServerFn(getCompanyBranding);
  const createUpload = useServerFn(createBrandLogoUpload);
  const saveAppearance = useServerFn(saveBrandAppearance);
  const query = useQuery({
    queryKey: ["company-branding"],
    queryFn: () => getBranding({ data: undefined }),
    staleTime: 5 * 60_000,
  });
  const [primaryColor, setPrimaryColor] = useState("#145453");
  const [accentColor, setAccentColor] = useState("#d3ad52");
  const [logo, setLogo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setPrimaryColor(query.data.primaryColor);
    setAccentColor(query.data.accentColor);
  }, [query.data]);

  useEffect(() => {
    if (!logo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(logo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  async function save() {
    setSaving(true);
    try {
      let logoPath = query.data?.logoPath ?? null;

      if (logo) {
        if (!ACCEPTED_LOGO_TYPES.includes(logo.type) || logo.size > MAX_LOGO_SIZE) {
          throw new Error("Choose a PNG, JPEG, or WebP logo under 5 MB.");
        }
        const extension = logo.name.split(".").pop()?.toLowerCase();
        if (extension !== "png" && extension !== "jpg" && extension !== "jpeg" && extension !== "webp") {
          throw new Error("The logo file extension is not supported.");
        }
        const slot = await createUpload({ data: { extension } });
        const { error } = await supabase.storage
          .from("company-branding")
          .uploadToSignedUrl(slot.path, slot.token, logo, { contentType: logo.type });
        if (error) throw new Error("The company logo could not be uploaded.");
        logoPath = slot.path;
      }

      const saved = await saveAppearance({
        data: { logoPath, primaryColor, accentColor },
      });
      queryClient.setQueryData(["company-branding"], saved);
      setLogo(null);
      await queryClient.invalidateQueries({ queryKey: ["company-branding"] });
      toast.success("Company logo and theme saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the company theme.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-xl border bg-card p-5 shadow-[var(--shadow-panel)]">
      <div>
        <h2 className="font-display text-lg font-semibold">Company logo and theme</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Update the shared application mark and brand colors. Only Super Admins can save changes.
        </p>
      </div>

      {query.isError ? (
        <div className="mt-4">
          <p className="text-sm text-destructive" role="alert">
            Company appearance settings could not be loaded.
          </p>
          <Button className="mt-2" variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : query.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Loading company appearance…
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company-logo">Company logo</Label>
              <Input
                id="company-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={saving}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  if (file && (file.size > MAX_LOGO_SIZE || !ACCEPTED_LOGO_TYPES.includes(file.type))) {
                    toast.error("Choose a PNG, JPEG, or WebP logo under 5 MB.");
                    event.currentTarget.value = "";
                    setLogo(null);
                    return;
                  }
                  setLogo(file);
                }}
              />
              <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP; maximum 5 MB.</p>
            </div>
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <img
                src={previewUrl ?? query.data?.logoUrl ?? "/favicon.png"}
                alt="Company logo preview"
                className="h-14 w-14 rounded-md object-contain"
              />
              <div>
                <p className="text-sm font-medium">Shared application logo</p>
                <p className="text-xs text-muted-foreground">Preview of the logo used in navigation.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-primary">Primary theme color</Label>
              <div className="flex gap-2">
                <Input
                  id="brand-primary"
                  type="color"
                  className="h-10 w-16 p-1"
                  value={primaryColor}
                  disabled={saving}
                  onChange={(event) => {
                    if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) {
                      setPrimaryColor(event.target.value);
                    }
                  }}
                />
                <Input
                  aria-label="Primary color hex value"
                  value={primaryColor}
                  maxLength={7}
                  disabled={saving}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-accent">Accent theme color</Label>
              <div className="flex gap-2">
                <Input
                  id="brand-accent"
                  type="color"
                  className="h-10 w-16 p-1"
                  value={accentColor}
                  disabled={saving}
                  onChange={(event) => {
                    if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) {
                      setAccentColor(event.target.value);
                    }
                  }}
                />
                <Input
                  aria-label="Accent color hex value"
                  value={accentColor}
                  maxLength={7}
                  disabled={saving}
                  onChange={(event) => setAccentColor(event.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button disabled={saving || query.isLoading} onClick={() => void save()}>
              {saving ? <ImageUp aria-hidden="true" className="mr-2 h-4 w-4 animate-pulse" /> : <Save aria-hidden="true" className="mr-2 h-4 w-4" />}
              {saving ? "Saving appearance…" : "Save appearance"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
