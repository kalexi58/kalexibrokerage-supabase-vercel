import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { logAudit, useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { NoAccess } from "@/components/records";
import { CURRENCIES, SECTORS } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/requirements/new")({
  head: () => ({
    meta: [
      { title: "New Requirement — Kalexi Brokerage" },
      { name: "description", content: "Log a new client requirement and generate matching opportunities." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewRequirement,
});

const PRIORITIES = ["low", "medium", "high", "urgent"];

const schema = z.object({
  client_id: z.string().min(1, "Select a client"),
  sector: z.string().min(1, "Select a sector"),
  title: z.string().trim().min(3, "Enter a title").max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  budget_min: z.string().optional(),
  budget_max: z.string().optional(),
  currency: z.string().min(1),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  quantity: z.string().trim().max(120).optional().or(z.literal("")),
  specifications: z.string().trim().max(2000).optional().or(z.literal("")),
  deadline: z.string().optional().or(z.literal("")),
  priority: z.string().min(1),
});

function tokenize(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

function scoreOpportunity(
  req: { sector: string; title: string; description: string; budget_min: number | null; budget_max: number | null; location: string },
  opp: { sector: string; title: string; description: string | null; price: number | null; location: string | null },
) {
  let score = 0;
  const reasons: string[] = [];

  if (opp.sector === req.sector) {
    score += 40;
    reasons.push(`Sector match: ${opp.sector}`);
  }

  if (opp.price !== null && (req.budget_min !== null || req.budget_max !== null)) {
    const min = req.budget_min ?? 0;
    const max = req.budget_max ?? Number.POSITIVE_INFINITY;
    if (opp.price >= min && opp.price <= max) {
      score += 30;
      reasons.push("Price within client budget");
    }
  }

  if (req.location && opp.location && opp.location.toLowerCase().includes(req.location.toLowerCase())) {
    score += 20;
    reasons.push(`Location match: ${opp.location}`);
  }

  const reqTokens = tokenize(`${req.title} ${req.description}`);
  const oppTokens = tokenize(`${opp.title} ${opp.description ?? ""}`);
  let overlap = 0;
  for (const t of reqTokens) if (oppTokens.has(t)) overlap += 1;
  if (overlap > 0) {
    score += 10;
    reasons.push(`Keyword overlap (${overlap} term${overlap > 1 ? "s" : ""})`);
  }

  return { score, reasons };
}

function NewRequirement() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const access = session?.access;
  const [clientTerm, setClientTerm] = useState("");
  const [form, setForm] = useState({
    client_id: "",
    client_label: "",
    sector: "",
    title: "",
    description: "",
    budget_min: "",
    budget_max: "",
    currency: "UGX",
    location: "",
    quantity: "",
    specifications: "",
    deadline: "",
    priority: "medium",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const clients = useQuery({
    queryKey: ["client-picker", clientTerm],
    enabled: clientTerm.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, client_ref, full_name, company_name")
        .or(`full_name.ilike.%${clientTerm}%,client_ref.ilike.%${clientTerm}%,company_name.ilike.%${clientTerm}%`)
        .limit(8);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        const map: Record<string, string> = {};
        for (const issue of parsed.error.issues) map[String(issue.path[0])] = issue.message;
        setErrors(map);
        throw new Error("Please correct the highlighted fields.");
      }
      setErrors({});
      const v = parsed.data;
      const budget_min = v.budget_min ? Number(v.budget_min) : null;
      const budget_max = v.budget_max ? Number(v.budget_max) : null;

      const { data: reqRow, error } = await supabase
        .from("client_requirements")
        .insert({
          client_id: v.client_id,
          sector: v.sector,
          title: v.title,
          description: v.description || null,
          budget_min,
          budget_max,
          currency: v.currency,
          location: v.location || null,
          quantity: v.quantity || null,
          specifications: v.specifications || null,
          deadline: v.deadline || null,
          priority: v.priority,
          created_by: session!.userId,
        })
        .select("id, requirement_ref")
        .single();
      if (error) throw error;

      const { data: opportunities } = await supabase
        .from("opportunities")
        .select("id, sector, title, description, price, location")
        .is("archived_at", null)
        .eq("sector", v.sector);

      const matches = (opportunities ?? [])
        .map((opp) => {
          const { score, reasons } = scoreOpportunity(
            { sector: v.sector, title: v.title, description: v.description ?? "", budget_min, budget_max, location: v.location ?? "" },
            opp,
          );
          return { opp, score, reasons };
        })
        .filter((m) => m.score >= 40);

      if (matches.length > 0) {
        const { error: matchError } = await supabase.from("opportunity_matches").insert(
          matches.map((m) => ({
            requirement_id: reqRow.id,
            opportunity_id: m.opp.id,
            score: m.score,
            reasons: m.reasons,
            created_by: session!.userId,
          })),
        );
        if (matchError) throw matchError;
      }

      await logAudit({
        actorId: session!.userId,
        actorEmail: session!.email,
        action: "requirement.created",
        entityType: "client_requirements",
        entityId: reqRow.id,
        newValue: { title: v.title, sector: v.sector, matches: matches.length },
      });

      return reqRow;
    },
    onSuccess: (data) => {
      toast.success(`Requirement logged as ${data.requirement_ref}`);
      navigate({ to: "/requirements/$requirementId", params: { requirementId: data.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allows(access, "requirements.create")) {
    return (
      <AppShell>
        <PageHeader title="New requirement" />
        <NoAccess module="Client Requirements" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="New client requirement"
        description="Capture what the client needs — matching opportunities will be generated automatically."
      />

      <Card className="max-w-3xl shadow-[var(--shadow-panel)]">
        <CardContent className="space-y-5 p-6">
          <Field label="Client" error={errors["client_id"]}>
            {form.client_id ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{form.client_label}</span>
                <Button variant="ghost" size="sm" onClick={() => set("client_id")("")}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  value={clientTerm}
                  onChange={(e) => setClientTerm(e.target.value)}
                  placeholder="Search client by name, ref or company"
                  maxLength={80}
                />
                {clients.data && clients.data.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    {clients.data.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setForm((f) => ({ ...f, client_id: c.id, client_label: `${c.full_name} (${c.client_ref})` }));
                        }}
                      >
                        {c.full_name} <span className="text-muted-foreground">· {c.client_ref}</span>
                        {c.company_name ? ` · ${c.company_name}` : ""}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Sector" error={errors["sector"]}>
              <Select value={form.sector} onValueChange={set("sector")}>
                <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Priority" error={errors["priority"]}>
              <Select value={form.priority} onValueChange={set("priority")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Title" error={errors["title"]}>
            <Input value={form.title} onChange={(e) => set("title")(e.target.value)} maxLength={160} />
          </Field>

          <Field label="Description" error={errors["description"]}>
            <Textarea rows={4} value={form.description} onChange={(e) => set("description")(e.target.value)} maxLength={2000} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Budget min" error={errors["budget_min"]}>
              <Input type="number" value={form.budget_min} onChange={(e) => set("budget_min")(e.target.value)} />
            </Field>
            <Field label="Budget max" error={errors["budget_max"]}>
              <Input type="number" value={form.budget_max} onChange={(e) => set("budget_max")(e.target.value)} />
            </Field>
            <Field label="Currency" error={errors["currency"]}>
              <Select value={form.currency} onValueChange={set("currency")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Location" error={errors["location"]}>
              <Input value={form.location} onChange={(e) => set("location")(e.target.value)} maxLength={160} />
            </Field>
            <Field label="Quantity" error={errors["quantity"]}>
              <Input value={form.quantity} onChange={(e) => set("quantity")(e.target.value)} maxLength={120} />
            </Field>
          </div>

          <Field label="Specifications" error={errors["specifications"]}>
            <Textarea rows={3} value={form.specifications} onChange={(e) => set("specifications")(e.target.value)} maxLength={2000} />
          </Field>

          <Field label="Deadline" error={errors["deadline"]}>
            <Input type="date" value={form.deadline} onChange={(e) => set("deadline")(e.target.value)} />
          </Field>

          <div className="flex gap-3 pt-2">
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save & generate matches"}
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/requirements" })}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Field({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
