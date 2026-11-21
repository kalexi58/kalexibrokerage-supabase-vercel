import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import {
  DEFAULT_AGENT_ID_THEME,
  type AgentIdTheme,
} from "@/lib/agent-id-theme";
import {
  getAgentIdTheme,
  prepareAgentIdentityUpload,
  saveAgentIdTheme,
  updateAgentIdentity,
} from "@/lib/agents.functions";
import type { Database } from "@/integrations/supabase/types";

type Agent = Database["public"]["Tables"]["agents"]["Row"];

const THEME_FIELDS: {
  key: "background" | "accent" | "text" | "accentText";
  label: string;
}[] = [
  { key: "background", label: "Card background" },
  { key: "accent", label: "Brand accent" },
  { key: "text", label: "Card text" },
  { key: "accentText", label: "Text on accent" },
];

export function AgentIdentityEditor({ agent }: { agent: Agent }) {
  const [draft, setDraft] = useState({
    full_name: agent.full_name,
    phone: agent.phone,
    district: agent.district ?? "",
    village: agent.village ?? "",
    designation: agent.designation,
    agent_code: agent.agent_code,
    referral_code: agent.referral_code,
    company_phone: agent.company_phone ?? "",
    issued_at: agent.issued_at.slice(0, 10),
    expires_at: agent.expires_at.slice(0, 10),
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [theme, setTheme] = useState<AgentIdTheme>(DEFAULT_AGENT_ID_THEME);
  const [busy, setBusy] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const qc = useQueryClient();
  const session = useSession();
  const themeQuery = useQuery({
    queryKey: ["agent-id-theme", session.data?.userId],
    enabled: !!session.data?.userId,
    queryFn: () => getAgentIdTheme(),
  });

  useEffect(() => {
    if (themeQuery.data) setTheme(themeQuery.data.theme);
  }, [themeQuery.data]);

  async function save() {
    setBusy(true);
    try {
      let photo_path = agent.photo_path;
      let signature_path = agent.signature_path;
      for (const [kind, file] of [
        ["photo", photo],
        ["signature", signature],
      ] as const) {
        if (!file) continue;
        if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
          throw new Error("Choose an image under 5 MB.");
        }
        const slot = await prepareAgentIdentityUpload({
          data: { id: agent.id, kind, name: file.name },
        });
        const { error } = await supabase.storage
          .from("kalexi-vault")
          .uploadToSignedUrl(slot.path, slot.token, file);
        if (error) throw error;
        if (kind === "photo") photo_path = slot.path;
        else signature_path = slot.path;
      }
      await updateAgentIdentity({
        data: {
          ...draft,
          id: agent.id,
          issued_at: new Date(`${draft.issued_at}T00:00:00Z`).toISOString(),
          expires_at: new Date(`${draft.expires_at}T23:59:59Z`).toISOString(),
          photo_path,
          signature_path,
        },
      });
      await qc.invalidateQueries({ queryKey: ["agent", agent.id] });
      toast.success("Agent identity saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save identity");
    } finally {
      setBusy(false);
    }
  }

  async function saveTheme() {
    setSavingTheme(true);
    try {
      await saveAgentIdTheme({ data: theme });
      await qc.invalidateQueries({ queryKey: ["agent-id-theme"] });
      toast.success("Shared agent ID theme saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save ID theme");
    } finally {
      setSavingTheme(false);
    }
  }

  return (
    <section className="no-print mt-8 border-t pt-5">
      <h2 className="mb-4 font-display text-lg font-semibold">Edit agent identity &amp; card</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["full_name", "Full legal name"],
            ["phone", "Agent phone"],
            ["designation", "Designation"],
            ["agent_code", "Unique Agent ID"],
            ["referral_code", "Referral code"],
            ["district", "District"],
            ["village", "Village"],
            ["company_phone", "Official company contact number"],
            ["issued_at", "Date of issue"],
            ["expires_at", "Expiry date"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={`agent-${key}`}>{label}</Label>
            <Input
              id={`agent-${key}`}
              type={key.endsWith("_at") ? "date" : "text"}
              value={draft[key]}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, [key]: event.target.value }))
              }
            />
          </div>
        ))}
        <div>
          <Label htmlFor="agent-photo">Agent photograph</Label>
          <Input
            id="agent-photo"
            type="file"
            accept="image/*"
            onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
          />
        </div>
        <div>
          <Label htmlFor="agent-signature">Authorised signature</Label>
          <Input
            id="agent-signature"
            type="file"
            accept="image/*"
            onChange={(event) => setSignature(event.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <Button className="mt-4" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save agent identity"}
      </Button>

      <div className="mt-8 border-t pt-5">
        <h3 className="font-display text-base font-semibold">Shared agent ID theme</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the colors used on every agent ID, including printed cards.
        </p>
        {themeQuery.isError ? (
          <p className="mt-2 text-sm text-destructive">
            Could not load the saved theme. Default colors are shown until access is restored.
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {THEME_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <Input
                id={`agent-id-theme-${key}`}
                aria-label={label}
                type="color"
                className="h-10 w-14 p-1"
                value={theme[key]}
                onChange={(event) =>
                  setTheme((previous) => ({ ...previous, [key]: event.target.value }))
                }
              />
              <Label htmlFor={`agent-id-theme-${key}`}>{label}</Label>
              <span className="font-mono text-xs text-muted-foreground">{theme[key]}</span>
            </div>
          ))}
        </div>
        <Button
          className="mt-4"
          disabled={savingTheme || themeQuery.isLoading || themeQuery.isError}
          onClick={saveTheme}
        >
          {savingTheme ? "Saving…" : "Save shared ID theme"}
        </Button>
      </div>
    </section>
  );
}
