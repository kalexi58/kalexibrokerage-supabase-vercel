import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
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

export const Route = createFileRoute("/_authenticated/opportunities/new")({
  head: () => ({
    meta: [
      { title: "New Opportunity — Kalexi Brokerage" },
      { name: "description", content: "Log a new sourced opportunity into the Kalexi opportunity database." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewOpportunity,
});

const TYPES = ["supply", "demand", "sale", "lease", "investment", "service"];

const SECTOR_FIELDS: Record<string, { key: string; label: string }[]> = {
  "Real Estate & Land": [
    { key: "plot_size", label: "Plot size" },
    { key: "tenure", label: "Tenure" },
    { key: "title_number", label: "Title number" },
    { key: "land_use", label: "Land use" },
  ],
  "Minerals & Mining": [
    { key: "mineral", label: "Mineral" },
    { key: "grade", label: "Grade" },
    { key: "quantity_per_month", label: "Quantity/month" },
    { key: "licence_number", label: "Licence number" },
    { key: "origin", label: "Origin" },
  ],
  "Agriculture & Produce": [
    { key: "produce", label: "Produce" },
    { key: "grade", label: "Grade" },
    { key: "volume", label: "Volume" },
    { key: "harvest_window", label: "Harvest window" },
  ],
  "Vehicles & Machinery": [
    { key: "make", label: "Make" },
    { key: "model", label: "Model" },
    { key: "year", label: "Year" },
    { key: "mileage", label: "Mileage" },
    { key: "condition", label: "Condition" },
  ],
};

const schema = z.object({
  sector: z.string().min(1, "Select a sector"),
  opportunity_type: z.string().min(1, "Select a type"),
  title: z.string().trim().min(3, "Enter a title").max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  owner_name: z.string().trim().max(160).optional().or(z.literal("")),
  owner_contact: z.string().trim().max(80).optional().or(z.literal("")),
  source: z.string().trim().max(160).optional().or(z.literal("")),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  price: z.string().optional(),
  currency: z.string().min(1),
  quantity: z.string().trim().max(120).optional().or(z.literal("")),
  availability: z.string().trim().max(160).optional().or(z.literal("")),
  requirements: z.string().trim().max(2000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function NewOpportunity() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const access = session?.access;
  const [form, setForm] = useState({
    sector: "",
    opportunity_type: "",
    title: "",
    description: "",
    owner_name: "",
    owner_contact: "",
    source: "",
    location: "",
    price: "",
    currency: "UGX",
    quantity: "",
    availability: "",
    requirements: "",
    notes: "",
  });
  const [sectorDetails, setSectorDetails] = useState<Record<string, string>>({});
  const [freeRows, setFreeRows] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const structuredFields = SECTOR_FIELDS[form.sector];

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
      const details = structuredFields
        ? sectorDetails
        : Object.fromEntries(freeRows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]));

      const { data, error } = await supabase
        .from("opportunities")
        .insert({
          sector: v.sector,
          opportunity_type: v.opportunity_type,
          title: v.title,
          description: v.description || null,
          owner_name: v.owner_name || null,
          owner_contact: v.owner_contact || null,
          source: v.source || null,
          location: v.location || null,
          price: v.price ? Number(v.price) : null,
          currency: v.currency,
          quantity: v.quantity || null,
          availability: v.availability || null,
          requirements: v.requirements || null,
          notes: v.notes || null,
          sector_details: details,
          created_by: session!.userId,
        })
        .select("id, opportunity_ref")
        .single();
      if (error) throw error;
      await logAudit({
        actorId: session!.userId,
        actorEmail: session!.email,
        action: "opportunity.created",
        entityType: "opportunities",
        entityId: data.id,
        newValue: { title: v.title, sector: v.sector, opportunity_type: v.opportunity_type },
      });
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Opportunity logged as ${data.opportunity_ref}`);
      navigate({ to: "/opportunities/$opportunityId", params: { opportunityId: data.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allows(access, "opportunities.create")) {
    return (
      <AppShell>
        <PageHeader title="New opportunity" />
        <NoAccess module="Opportunities" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="New opportunity"
        description="Log a sourced supply, demand, sale, lease, investment or service opportunity."
      />

      <Card className="max-w-3xl shadow-[var(--shadow-panel)]">
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Sector" error={errors["sector"]}>
              <Select value={form.sector} onValueChange={set("sector")}>
                <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Opportunity type" error={errors["opportunity_type"]}>
              <Select value={form.opportunity_type} onValueChange={set("opportunity_type")}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
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

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Owner name" error={errors["owner_name"]}>
              <Input value={form.owner_name} onChange={(e) => set("owner_name")(e.target.value)} maxLength={160} />
            </Field>
            <Field label="Owner contact" error={errors["owner_contact"]}>
              <Input value={form.owner_contact} onChange={(e) => set("owner_contact")(e.target.value)} maxLength={80} />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Source" error={errors["source"]}>
              <Input value={form.source} onChange={(e) => set("source")(e.target.value)} maxLength={160} />
            </Field>
            <Field label="Location" error={errors["location"]}>
              <Input value={form.location} onChange={(e) => set("location")(e.target.value)} maxLength={160} />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Price" error={errors["price"]}>
              <Input type="number" value={form.price} onChange={(e) => set("price")(e.target.value)} />
            </Field>
            <Field label="Currency" error={errors["currency"]}>
              <Select value={form.currency} onValueChange={set("currency")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Quantity" error={errors["quantity"]}>
              <Input value={form.quantity} onChange={(e) => set("quantity")(e.target.value)} maxLength={120} />
            </Field>
          </div>

          <Field label="Availability" error={errors["availability"]}>
            <Input value={form.availability} onChange={(e) => set("availability")(e.target.value)} maxLength={160} />
          </Field>

          <Field label="Requirements from buyer/seller" error={errors["requirements"]}>
            <Textarea rows={3} value={form.requirements} onChange={(e) => set("requirements")(e.target.value)} maxLength={2000} />
          </Field>

          <Field label="Notes" error={errors["notes"]}>
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes")(e.target.value)} maxLength={2000} />
          </Field>

          <div className="space-y-3 rounded-md border p-4">
            <p className="label-caps">Sector-specific details</p>
            {structuredFields ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {structuredFields.map((f) => (
                  <div key={f.key} className="space-y-2">
                    <Label>{f.label}</Label>
                    <Input
                      value={sectorDetails[f.key] ?? ""}
                      onChange={(e) => setSectorDetails((d) => ({ ...d, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {freeRows.map((row, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      placeholder="Field"
                      value={row.key}
                      onChange={(e) => setFreeRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, key: e.target.value } : r)))}
                    />
                    <Input
                      placeholder="Value"
                      value={row.value}
                      onChange={(e) => setFreeRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)))}
                    />
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setFreeRows((rows) => [...rows, { key: "", value: "" }])}>
                  Add field
                </Button>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save opportunity"}
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/opportunities" })}>
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
