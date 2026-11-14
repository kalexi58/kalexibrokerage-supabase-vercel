import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession, logAudit } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { NoAccess } from "@/components/records";
import { CURRENCIES, SECTORS } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/deals/new")({
  head: () => ({
    meta: [
      { title: "Open a Deal — Kalexi Brokerage" },
      { name: "description", content: "Open a new brokered deal file in the Kalexi pipeline." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewDealPage,
});

function NewDealPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: "",
    sector: SECTORS[0] as string,
    client_id: "",
    opportunity_id: "",
    requirement_id: "",
    value: "",
    currency: "UGX",
    commission_rate: "",
    expected_close: "",
    notes: "",
  });

  const clients = useQuery({
    queryKey: ["deal-clients"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, client_ref, full_name")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      return data ?? [];
    },
  });

  const opportunities = useQuery({
    queryKey: ["deal-opportunities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("opportunities")
        .select("id, opportunity_ref, title")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      return data ?? [];
    },
  });

  const requirements = useQuery({
    queryKey: ["deal-requirements", form.client_id],
    queryFn: async () => {
      let q = supabase
        .from("client_requirements")
        .select("id, requirement_ref, title, client_id")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (form.client_id) q = q.eq("client_id", form.client_id);
      const { data } = await q;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const ref = `KBL-DEAL-${Date.now().toString().slice(-6)}`;
      const { data, error } = await supabase
        .from("deals")
        .insert({
          deal_ref: ref,
          title: form.title.trim(),
          sector: form.sector,
          client_id: form.client_id || null,
          opportunity_id: form.opportunity_id || null,
          requirement_id: form.requirement_id || null,
          stage: "deal_open",
          status: "active",
          value: form.value ? Number(form.value) : null,
          currency: form.currency,
          commission_rate: form.commission_rate ? Number(form.commission_rate) : null,
          expected_close: form.expected_close || null,
          notes: form.notes.trim() || null,
          created_by: session?.userId ?? null,
          assigned_to: session?.userId ?? null,
        })
        .select("id, deal_ref")
        .single();
      if (error) throw error;
      if (session) {
        await logAudit({
          actorId: session.userId,
          actorEmail: session.email,
          action: "deal.created",
          entityType: "deals",
          entityId: data.id,
          newValue: { deal_ref: data.deal_ref, title: form.title },
        });
      }
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Deal ${data.deal_ref} opened.`);
      navigate({ to: "/deals/$dealId", params: { dealId: data.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allows(access, "deals.create")) {
    return (
      <AppShell>
        <PageHeader title="Open a deal" />
        <NoAccess module="Deal creation" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Open a deal" description="Create the deal file that governs the brokerage mandate." />

      <div className="max-w-3xl space-y-5 rounded-lg border bg-card p-5">
        <div className="space-y-2">
          <Label>Deal title</Label>
          <Input
            value={form.title}
            maxLength={160}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Supply of 500 tonnes maize to Kampala buyer"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Sector</Label>
            <Select value={form.sector} onValueChange={(v) => setForm((f) => ({ ...f, sector: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTORS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Client</Label>
            <Select
              value={form.client_id || "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, client_id: v === "none" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client linked</SelectItem>
                {(clients.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name} · {c.client_ref}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Linked requirement</Label>
            <Select
              value={form.requirement_id || "none"}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, requirement_id: v === "none" ? "" : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(requirements.data ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title} · {r.requirement_ref}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Linked opportunity</Label>
            <Select
              value={form.opportunity_id || "none"}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, opportunity_id: v === "none" ? "" : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(opportunities.data ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.title} · {o.opportunity_ref}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Deal value</Label>
            <Input
              type="number"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select
              value={form.currency}
              onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Commission rate (%)</Label>
            <Input
              type="number"
              value={form.commission_rate}
              onChange={(e) => setForm((f) => ({ ...f, commission_rate: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Expected close</Label>
            <Input
              type="date"
              value={form.expected_close}
              onChange={(e) => setForm((f) => ({ ...f, expected_close: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Internal notes</Label>
          <Textarea
            rows={4}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        <Button
          disabled={create.isPending || form.title.trim().length < 3}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Opening…" : "Open deal"}
        </Button>
      </div>
    </AppShell>
  );
}
