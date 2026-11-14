import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import {
  getAgentIdTheme,
  prepareAgentIdThemeSignatureUpload,
  saveAgentIdTheme,
} from "@/lib/agents.functions";
import {
  DEFAULT_AGENT_ID_THEME,
  type AgentIdTheme,
} from "@/lib/agent-id-theme";

const COLORS = [
  { key: "background", label: "Card background" },
  { key: "accent", label: "Header and accent" },
  { key: "text", label: "Main text" },
  { key: "accentText", label: "Text on header" },
] as const;

const FONTS = [
  "Arial, sans-serif",
  "Georgia, serif",
  "'Trebuchet MS', sans-serif",
  "'Times New Roman', serif",
  "Verdana, sans-serif",
];

function isSignatureImageType(
  contentType: string,
): contentType is "image/jpeg" | "image/png" | "image/webp" {
  return (
    contentType === "image/jpeg" ||
    contentType === "image/png" ||
    contentType === "image/webp"
  );
}

export function AgentIdCardDesigner({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const session = useSession();
  const [draft, setDraft] = useState<AgentIdTheme>(DEFAULT_AGENT_ID_THEME);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["agent-id-theme", session.data?.userId],
    enabled: !!session.data?.userId,
    queryFn: () => getAgentIdTheme(),
  });

  useEffect(() => {
    if (query.data) setDraft(query.data.theme);
  }, [query.data]);

  useEffect(() => {
    if (!signatureFile) {
      setSignaturePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(signatureFile);
    setSignaturePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [signatureFile]);

  function update<K extends keyof AgentIdTheme>(key: K, value: AgentIdTheme[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      let nextDraft = draft;
      if (signatureFile) {
        if (!isSignatureImageType(signatureFile.type))
          throw new Error("Choose a PNG, JPEG or WebP signature image under 5 MB.");
        const upload = await prepareAgentIdThemeSignatureUpload({
          data: { contentType: signatureFile.type },
        });
        const { error } = await supabase.storage
          .from(upload.bucket)
          .uploadToSignedUrl(upload.path, upload.token, signatureFile, {
            contentType: signatureFile.type,
          });
        if (error) throw error;
        nextDraft = { ...draft, authorizedSignaturePath: upload.path };
      }
      await saveAgentIdTheme({ data: nextDraft });
      setDraft(nextDraft);
      setSignatureFile(null);
      await qc.invalidateQueries({ queryKey: ["agent-id-theme"] });
      toast.success("Shared ID card design saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the ID card design.");
    } finally {
      setSaving(false);
    }
  }

  const displayedSignatureUrl = signaturePreviewUrl ??
    (draft.authorizedSignaturePath ? query.data?.authorizedSignatureUrl : null);
  function updateCustomField(index: number, key: "label" | "value", value: string) {
    setDraft((previous) => ({
      ...previous,
      customFields: previous.customFields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, [key]: value } : field,
      ),
    }));
  }

  return (
    <section className="space-y-6 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Agent ID Card Designer</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize the shared card dimensions, colors and font.
        </p>
      </div>

      {query.isLoading && <p>Loading saved design…</p>}
      {query.isError && (
        <p className="text-sm text-destructive">
          Could not load the saved design. Refresh before saving changes.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <h3 className="font-semibold">Dimensions and typography</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="card-width">Width (mm)</Label>
              <Input id="card-width" type="number" min={50} max={150} step={0.1}
                disabled={!canManage || saving} value={draft.widthMm}
                onChange={(e) => update("widthMm", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-height">Height (mm)</Label>
              <Input id="card-height" type="number" min={30} max={100} step={0.1}
                disabled={!canManage || saving} value={draft.heightMm}
                onChange={(e) => update("heightMm", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-radius">Corner radius (mm)</Label>
              <Input id="card-radius" type="number" min={0} max={10} step={0.5}
                disabled={!canManage || saving} value={draft.radiusMm}
                onChange={(e) => update("radiusMm", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-font">Font</Label>
              <select id="card-font"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                disabled={!canManage || saving} value={draft.fontFamily}
                onChange={(e) => update("fontFamily", e.target.value)}>
                {FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
              </select>
            </div>
          </div>

          <h3 className="font-semibold">Colors</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {COLORS.map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`card-color-${key}`}>{label}</Label>
                <div className="flex items-center gap-2">
                  <Input id={`card-color-${key}`} type="color" className="h-10 w-14 p-1"
                    disabled={!canManage || saving} value={draft[key]}
                    onChange={(e) => update(key, e.target.value)} />
                  <span className="font-mono text-sm">{draft[key]}</span>
                </div>
              </div>
            ))}
          </div>

          <h3 className="font-semibold">Back-of-card details</h3>
          <div className="space-y-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Additional card information</p>
                <p className="text-xs text-muted-foreground">
                  Add up to four labelled details to the agent card.
                </p>
              </div>
              {draft.customFields.map((field, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                  <Input
                    aria-label={`Card information label ${index + 1}`}
                    maxLength={24}
                    placeholder="Label"
                    disabled={!canManage || saving}
                    value={field.label}
                    onChange={(event) => updateCustomField(index, "label", event.target.value)}
                  />
                  <Input
                    aria-label={`Card information value ${index + 1}`}
                    maxLength={48}
                    placeholder="Information"
                    disabled={!canManage || saving}
                    value={field.value}
                    onChange={(event) => updateCustomField(index, "value", event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canManage || saving}
                    onClick={() =>
                      setDraft((previous) => ({
                        ...previous,
                        customFields: previous.customFields.filter((_, fieldIndex) => fieldIndex !== index),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={!canManage || saving || draft.customFields.length >= 4}
                onClick={() =>
                  setDraft((previous) => ({
                    ...previous,
                    customFields: [...previous.customFields, { label: "", value: "" }],
                  }))
                }
              >
                Add card information
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.showCorporateSeal}
                disabled={!canManage || saving}
                onCheckedChange={(checked) => update("showCorporateSeal", checked === true)}
              />
              Show corporate seal
            </label>
            <div className="space-y-2">
              <Label htmlFor="card-seal-text">Seal text</Label>
              <Input
                id="card-seal-text"
                maxLength={40}
                disabled={!canManage || saving || !draft.showCorporateSeal}
                value={draft.corporateSealText}
                onChange={(e) => update("corporateSealText", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-authorization">Authorization message</Label>
              <Input
                id="card-authorization"
                maxLength={160}
                disabled={!canManage || saving}
                value={draft.authorizationMessage}
                onChange={(e) => update("authorizationMessage", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-if-found">If-found message</Label>
              <Input
                id="card-if-found"
                maxLength={120}
                disabled={!canManage || saving}
                value={draft.ifFoundMessage}
                onChange={(e) => update("ifFoundMessage", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-authorized-signature">Shared authorised signature</Label>
              <Input
                id="card-authorized-signature"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={!canManage || saving}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file && (!isSignatureImageType(file.type) || file.size > 5 * 1024 * 1024)) {
                    toast.error("Choose a PNG, JPEG or WebP signature image under 5 MB.");
                    event.target.value = "";
                    return;
                  }
                  setSignatureFile(file);
                }}
              />
              {displayedSignatureUrl ? (
                <img
                  src={displayedSignatureUrl}
                  alt="Shared authorised signature preview"
                  className="h-14 max-w-56 border bg-white p-2 object-contain"
                />
              ) : (
                <p className="text-xs text-muted-foreground">No shared signature is configured.</p>
              )}
              {draft.authorizedSignaturePath && canManage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setSignatureFile(null);
                    setDraft((previous) => ({ ...previous, authorizedSignaturePath: null }));
                  }}
                >
                  Remove shared signature
                </Button>
              ) : null}
            </div>
          </div>

          {!canManage && (
            <p className="text-sm text-muted-foreground">
              You can preview the design. Agent-management permission is required to save it.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button disabled={!canManage || saving || query.isLoading || query.isError}
              onClick={() => void save()}>
              {saving ? "Saving…" : "Save shared design"}
            </Button>
            <Button variant="outline" disabled={saving}
              onClick={() => {
                setDraft(DEFAULT_AGENT_ID_THEME);
                setSignatureFile(null);
              }}>
              Reset preview
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">Live front preview</h3>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="mx-auto flex max-w-full flex-col overflow-hidden border shadow-sm"
              style={{
                width: `min(100%, ${draft.widthMm * 3.2}px)`,
                aspectRatio: `${draft.widthMm} / ${draft.heightMm}`,
                borderRadius: `${draft.radiusMm}mm`,
                backgroundColor: draft.background,
                color: draft.text,
                fontFamily: draft.fontFamily,
              }}>
              <div className="flex justify-between gap-2 p-3 text-xs font-bold"
                style={{ backgroundColor: draft.accent, color: draft.accentText }}>
                <span>KALEXI BROKERAGE LTD</span>
                <span>AGENT ID</span>
              </div>
              <div className="flex flex-1 items-center gap-3 p-3">
                <div className="flex aspect-[4/5] w-1/4 shrink-0 items-center justify-center text-xs"
                  style={{ backgroundColor: draft.accent, color: draft.accentText }}>
                  PHOTO
                </div>
                <div className="min-w-0 space-y-2 text-xs">
                  <p className="truncate font-bold">AGENT FULL NAME</p>
                  <p style={{ color: draft.accent }}>Digital Agent</p>
                  <p>Agent ID: KBL-AG-000001</p>
                  <p>Region: Kampala</p>
                  <p>Expiry: DD MMM YYYY</p>
                  {draft.customFields.slice(0, 2).map((field, index) => (
                    <p key={`${field.label}-${index}`}>
                      {field.label || "Information"}: {field.value || "—"}
                    </p>
                  ))}
                </div>
              </div>
              <div className="p-2 text-center text-[10px]"
                style={{ borderTop: `1px solid ${draft.accent}` }}>
                Official agent identification
              </div>
            </div>
          </div>
          <h3 className="pt-3 font-semibold">Live back preview</h3>
          <div className="mx-auto flex max-w-full items-center gap-3 overflow-hidden border p-3"
            style={{
              width: `min(100%, ${draft.widthMm * 3.2}px)`,
              aspectRatio: `${draft.widthMm} / ${draft.heightMm}`,
              borderRadius: `${draft.radiusMm}mm`,
              backgroundColor: draft.background,
              color: draft.text,
              fontFamily: draft.fontFamily,
            }}>
            <div className="flex aspect-square w-1/4 shrink-0 items-center justify-center text-xs"
              style={{ backgroundColor: draft.accent, color: draft.accentText }}>
              QR
            </div>
            <div className="min-w-0 space-y-1 text-[10px]">
              <p className="font-bold" style={{ color: draft.accent }}>AGENT VERIFICATION</p>
              <p>Referral code: KBLR000001</p>
              {draft.customFields.slice(2).map((field, index) => (
                <p key={`${field.label}-${index}`}>
                  {field.label || "Information"}: {field.value || "—"}
                </p>
              ))}
              <p>{draft.authorizationMessage}</p>
              <p>{draft.ifFoundMessage}</p>
              {draft.showCorporateSeal ? (
                <div className="grid h-10 w-10 place-content-center rounded-full border-2 text-center text-[6px] font-bold uppercase"
                  style={{ borderColor: draft.accent, color: draft.accent }}>
                  <span>Seal</span>
                  <span className="line-clamp-2 max-w-8">{draft.corporateSealText}</span>
                </div>
              ) : null}
              {displayedSignatureUrl ? (
                <img
                  src={displayedSignatureUrl}
                  alt="Authorised signature preview"
                  className="ml-auto h-8 max-w-24 object-contain"
                />
              ) : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            These are sample previews. Real agent details and verification codes remain on issued cards.
          </p>
        </div>
      </div>
    </section>
  );
}
