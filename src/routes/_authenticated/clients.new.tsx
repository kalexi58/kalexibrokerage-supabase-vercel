import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lookupReferral } from "@/lib/agents.functions";
import { AppShell, PageHeader } from "@/components/AppShell";
import { logAudit, useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { FormSubmissionState } from "@/components/LoadingStates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/clients/new")({
  head: () => ({
    meta: [
      { title: "Register Client — Kalexi Brokerage" },
      { name: "description", content: "Register a new client into the Kalexi Brokerage records." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RegisterClient,
});

const CLIENT_TYPES = ["Buyer", "Seller", "Supplier", "Investor", "Landlord", "Tenant", "Other"];
const SECTORS = [
  "Real Estate",
  "Minerals",
  "Petroleum & Energy",
  "Agriculture",
  "Commercial",
  "Other",
];

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter the client's full name").max(120),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(30),
  email: z.string().trim().email("Enter a valid email").max(255).optional().or(z.literal("")),
  company_name: z.string().trim().max(160).optional().or(z.literal("")),
  client_type: z.string().min(1, "Select a client type"),
  sector: z.string().min(1, "Select a sector"),
  requirement: z.string().trim().min(5, "Describe what the client wants").max(2000),
  branch: z.string().trim().max(80).optional().or(z.literal("")),
});

function RegisterClient() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    company_name: "",
    client_type: "",
    sector: "",
    requirement: "",
    branch: "",
    referral_code: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<File | null>(null);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Duplicate pre-check against existing internal records.
  const dupTerm = form.phone.trim().length >= 5 ? form.phone.trim() : form.full_name.trim();
  const duplicates = useQuery({
    queryKey: ["dup-check", dupTerm],
    enabled: dupTerm.length >= 4,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, client_ref, full_name, phone, company_name")
        .or(`phone.ilike.%${dupTerm}%,full_name.ilike.%${dupTerm}%`)
        .limit(5);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (errors["photo"]) throw new Error("Please correct the highlighted fields.");
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        const map: Record<string, string> = {};
        for (const issue of parsed.error.issues) map[String(issue.path[0])] = issue.message;
        setErrors(map);
        throw new Error("Please correct the highlighted fields.");
      }
      setErrors({});
      const v = parsed.data;
      let agentId: string | null = null;
      if (form.referral_code.trim()) {
        const ref = await lookupReferral({ data: { code: form.referral_code.trim() } });
        if (!ref) throw new Error("That referral code does not belong to an active agent.");
        agentId = ref.agentId;
      }
      let photoPath: string | null = null;
      if (photo) {
        const extension = photo.type === "image/jpeg" ? "jpg" : photo.type.split("/")[1];
        photoPath = `${session!.userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("client-photos")
          .upload(photoPath, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { data, error } = await supabase
        .from("clients")
        .insert({
          full_name: v.full_name,
          phone: v.phone,
          email: v.email || null,
          company_name: v.company_name || null,
          client_type: v.client_type,
          sector: v.sector,
          requirement: v.requirement,
          branch: v.branch || null,
          photo_path: photoPath,
          registered_by: session!.userId,
          agent_id: agentId,
          referral_code: agentId ? form.referral_code.trim().toUpperCase() : null,
        })
        .select("id, client_ref")
        .single();
      if (error) {
        if (photoPath) {
          const { error: cleanupError } = await supabase.storage
            .from("client-photos")
            .remove([photoPath]);
          if (cleanupError) {
            console.error("[clients] Could not remove an unlinked profile photo.", cleanupError);
            throw new Error(`${error.message} The uploaded photo could not be cleaned up.`);
          }
        }
        throw error;
      }
      await logAudit({
        actorId: session!.userId,
        actorEmail: session!.profile?.email ?? null,
        action: "client.created",
        entityType: "client",
        entityId: data.client_ref,
        newValue: { full_name: v.full_name, sector: v.sector, client_type: v.client_type },
      });
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Client registered as ${data.client_ref}`);
      navigate({ to: "/clients/$clientId/acknowledgement", params: { clientId: data.id } });
    },
    onError: (error: Error) => {
      console.error("[clients] Client registration failed.", error);
      toast.error(
        error.message === "Please correct the highlighted fields."
          ? error.message
          : `Client information could not be saved: ${error.message}`,
      );
    },
  });

  return (
    <AppShell>
      <PageHeader
        title="Register new client"
        description="Basic registration only — full KYC is collected later by the onboarding team."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,620px)_minmax(0,320px)]">
        <Card className="shadow-[var(--shadow-panel)]">
          <CardContent className="space-y-5 p-6">
            {create.isPending ? <FormSubmissionState message="Saving client information…" /> : null}
            <Field label="Full name" error={errors["full_name"]}>
              <Input
                value={form.full_name}
                onChange={(e) => set("full_name")(e.target.value)}
                maxLength={120}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Phone number" error={errors["phone"]}>
                <Input
                  value={form.phone}
                  onChange={(e) => set("phone")(e.target.value)}
                  maxLength={30}
                />
              </Field>
              <Field label="Email (optional)" error={errors["email"]}>
                <Input
                  value={form.email}
                  onChange={(e) => set("email")(e.target.value)}
                  maxLength={255}
                />
              </Field>
            </div>
            <Field label="Company name (if applicable)" error={errors["company_name"]}>
              <Input
                value={form.company_name}
                onChange={(e) => set("company_name")(e.target.value)}
                maxLength={160}
              />
            </Field>
            <Field label="Client profile photo (optional)" error={errors["photo"]}>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                    setErrors((previous) => ({
                      ...previous,
                      photo: "Choose a JPEG, PNG, or WebP image.",
                    }));
                    event.currentTarget.value = "";
                    setPhoto(null);
                    return;
                  }
                  if (file && file.size > 5 * 1024 * 1024) {
                    setErrors((previous) => ({
                      ...previous,
                      photo: "The image must be 5 MB or smaller.",
                    }));
                    event.currentTarget.value = "";
                    setPhoto(null);
                    return;
                  }
                  setErrors((previous) => ({ ...previous, photo: "" }));
                  setPhoto(file);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Private staff-only image, up to 5 MB. No confidential details are embedded in client
                QR codes.
              </p>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Client type" error={errors["client_type"]}>
                <Select value={form.client_type} onValueChange={set("client_type")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Sector" error={errors["sector"]}>
                <Select value={form.sector} onValueChange={set("sector")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sector" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTORS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="What does the client want?" error={errors["requirement"]}>
              <Textarea
                rows={4}
                value={form.requirement}
                onChange={(e) => set("requirement")(e.target.value)}
                maxLength={2000}
                placeholder="Short description of the requirement"
              />
            </Field>
            <Field label="Agent referral code (if referred by an agent)" error={undefined}>
              <Input
                value={form.referral_code}
                onChange={(e) => set("referral_code")(e.target.value)}
                maxLength={20}
                placeholder="e.g. 3FA9C21B"
              />
            </Field>
            <Field label="Office / branch (optional)" error={errors["branch"]}>
              <Input
                value={form.branch}
                onChange={(e) => set("branch")(e.target.value)}
                maxLength={80}
              />
            </Field>

            <div className="flex gap-3 pt-2">
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Registering…" : "Register client"}
              </Button>
              <Button variant="outline" onClick={() => navigate({ to: "/clients" })}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-[var(--shadow-panel)]">
            <CardContent className="p-5">
              <p className="label-caps">Duplicate pre-check</p>
              {duplicates.data && duplicates.data.length > 0 ? (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Possible existing records. Review before creating a duplicate.
                  </p>
                  {duplicates.data.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
                    >
                      <p className="ref-mono text-xs">{d.client_ref}</p>
                      <p className="font-medium">{d.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.phone}
                        {d.company_name ? ` · ${d.company_name}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No matching internal record detected so far.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-panel)]">
            <CardContent className="p-5 text-sm text-muted-foreground">
              <p className="label-caps mb-2">Reception scope</p>
              Registration captures basic details only. Identification documents, corporate records
              and KYC are collected by the onboarding team; risk screening is handled by authorized
              Risk and Verification Officers.
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
