import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { saveAgentIdTheme } from "@/lib/agents.functions";
import {
  AGENT_ID_THEME_ID,
  DEFAULT_AGENT_ID_THEME,
  parseAgentIdTheme,
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

export function AgentIdCardDesigner({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AgentIdTheme>(DEFAULT_AGENT_ID_THEME);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["agent-id-theme"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_templates")
        .select("accent, body")
        .eq("id", AGENT_ID_THEME_ID)
        .maybeSingle();

      if (error) throw error;
      return parseAgentIdTheme(data?.body, data?.accent);
    },
  });

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  function update<K extends keyof AgentIdTheme>(key: K, value: AgentIdTheme[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await saveAgentIdTheme({ data: draft });
      await qc.invalidateQueries({ queryKey: ["agent-id-theme"] });
      toast.success("Shared ID card design saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the ID card design.");
    } finally {
      setSaving(false);
    }
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
              onClick={() => setDraft(DEFAULT_AGENT_ID_THEME)}>
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
            <div className="min-w-0 space-y-2 text-[10px]">
              <p className="font-bold" style={{ color: draft.accent }}>AGENT VERIFICATION</p>
              <p>Referral code: KBLR000001</p>
              <p>Scan to verify agent status.</p>
              <p>Kalexi Brokerage Ltd</p>
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
