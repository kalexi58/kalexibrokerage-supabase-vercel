import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ErrorState, FormSubmissionState } from "@/components/LoadingStates";
import { NoAccess } from "@/components/records";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { logAudit, useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { CURRENCIES, titleCase } from "@/lib/records";

export const Route = createFileRoute("/_authenticated/properties/new")({
  head: () => ({
    meta: [
      { title: "Register Property — Kalexi Brokerage" },
      { name: "description", content: "Register an asset against an existing Kalexi client." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewPropertyPage,
});

const categories = ["land", "house", "commercial", "industrial", "hotel", "rental", "other"];
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const schema = z.object({
  client_id: z.string().uuid("Select a registered client."),
  name: z.string().trim().min(2, "Enter a property name.").max(160),
  category: z.enum(["land", "house", "commercial", "industrial", "hotel", "rental", "other"]),
  location: z.string().trim().min(2, "Enter the property location.").max(240),
  description: z.string().trim().max(4000),
  asking_price: z
    .string()
    .refine(
      (value) => !value || (Number.isFinite(Number(value)) && Number(value) >= 0),
      "Enter a non-negative asking price.",
    ),
  currency: z.string().min(3).max(3),
  assigned_to: z.string(),
});

function NewPropertyPage() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const access = session?.access;
  const [values, setValues] = useState({
    client_id: "",
    name: "",
    category: "",
    location: "",
    description: "",
    asking_price: "",
    currency: "UGX",
    assigned_to: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const update = (key: keyof typeof values) => (value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const clients = useQuery({
    queryKey: ["property-client-options"],
    enabled: allows(access, "properties.create"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, client_ref, full_name, company_name")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const staff = useQuery({
    queryKey: ["property-assignee-options"],
    enabled: allows(access, "properties.create"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, department")
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(values);
      if (!parsed.success) {
        const next: Record<string, string> = {};
        for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
        setErrors(next);
        throw new Error("Please correct the highlighted fields.");
      }
      const invalidMedia = mediaFiles.find(
        (file) => !MEDIA_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_FILE_SIZE,
      );
      if (invalidMedia) {
        setErrors({
          media: `${invalidMedia.name}: choose a supported image or video no larger than 50 MB.`,
        });
        throw new Error("Please correct the highlighted fields.");
      }
      if (!session) throw new Error("Your session has expired. Sign in again.");
      setErrors({});
      const value = parsed.data;
      const { data, error } = await supabase
        .from("properties")
        .insert({
          client_id: value.client_id,
          name: value.name,
          category: value.category,
          location: value.location,
          description: value.description,
          asking_price: value.asking_price ? Number(value.asking_price) : null,
          currency: value.currency,
          assigned_to: value.assigned_to || null,
          created_by: session.userId,
        })
        .select("id, property_ref")
        .single();
      if (error) throw error;

      const mediaErrors: string[] = [];
      for (const file of mediaFiles) {
        const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-120);
        const path = `${session.userId}/${data.id}/${crypto.randomUUID()}-${safeName}`;
        let uploaded = false;
        try {
          const { error: storageError } = await supabase.storage
            .from("property-files")
            .upload(path, file, { contentType: file.type, upsert: false });
          if (storageError) throw storageError;
          uploaded = true;

          const { error: rowError } = await supabase.from("property_files").insert({
            property_id: data.id,
            category: file.type.startsWith("video/") ? "video" : "photo",
            display_name: file.name.slice(0, 255),
            storage_path: path,
            mime_type: file.type,
            byte_size: file.size,
            uploaded_by: session.userId,
          });
          if (rowError) {
            const { error: cleanupError } = await supabase.storage
              .from("property-files")
              .remove([path]);
            if (cleanupError) {
              console.error("[properties] Failed to remove media without a file record.", cleanupError);
            }
            throw rowError;
          }
        } catch (uploadError) {
          const reason =
            uploadError instanceof Error ? uploadError.message : "The file could not be uploaded.";
          mediaErrors.push(`${file.name}: ${reason}`);
        }
      }

      await logAudit({
        actorId: session.userId,
        actorEmail: session.email,
        action: "property.created",
        entityType: "property",
        entityId: data.id,
        newValue: { property_ref: data.property_ref, client_id: value.client_id },
      });
      return { property: data, mediaErrors };
    },
    onSuccess: async ({ property, mediaErrors }) => {
      toast.success(`Property registered as ${property.property_ref}`);
      if (mediaErrors.length) {
        toast.error(
          `The property was saved, but ${mediaErrors.length} media file(s) could not be attached: ${mediaErrors
            .slice(0, 3)
            .join("; ")}. You can retry from the property record.`,
        );
      }
      await navigate({ to: "/properties/$propertyId", params: { propertyId: property.id } });
    },
    onError: (error: Error) => {
      if (error.message !== "Please correct the highlighted fields.") {
        console.error("[properties] Property creation failed.", error);
        toast.error(`Property could not be saved: ${error.message}`);
      }
    },
  });

  if (!allows(access, "properties.create")) {
    return (
      <AppShell>
        <PageHeader title="Register property" />
        <NoAccess module="Properties & Assets" />
      </AppShell>
    );
  }

  const fieldError = (key: string) =>
    errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null;

  return (
    <AppShell>
      <PageHeader
        title="Register property"
        description="Every property must be linked to an existing client and is submitted for verification."
      />
      {create.isPending ? <FormSubmissionState message="Saving property and uploading media…" /> : null}
      {clients.isError || staff.isError ? (
        <ErrorState
          title="Registration options could not be loaded"
          description="Client or staff records could not be retrieved. Retry before saving."
          onRetry={() => {
            void clients.refetch();
            void staff.refetch();
          }}
        />
      ) : (
        <Card className="max-w-3xl shadow-[var(--shadow-panel)]">
          <CardContent className="grid gap-5 p-6 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Owner / client</Label>
              <Select value={values.client_id} onValueChange={update("client_id")}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      clients.isLoading ? "Loading clients…" : "Select an existing client"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(clients.data ?? []).map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.client_ref} · {client.company_name || client.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("client_id")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="property-name">Property name</Label>
              <Input
                id="property-name"
                value={values.name}
                maxLength={160}
                onChange={(event) => update("name")(event.target.value)}
              />
              {fieldError("name")}
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={values.category} onValueChange={update("category")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {titleCase(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("category")}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="property-location">Location</Label>
              <Input
                id="property-location"
                value={values.location}
                maxLength={240}
                onChange={(event) => update("location")(event.target.value)}
                placeholder="District, city, and address or plot reference"
              />
              {fieldError("location")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="property-price">Asking price (optional)</Label>
              <Input
                id="property-price"
                type="number"
                min="0"
                step="0.01"
                value={values.asking_price}
                onChange={(event) => update("asking_price")(event.target.value)}
              />
              {fieldError("asking_price")}
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={values.currency} onValueChange={update("currency")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("currency")}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="property-description">Description and ownership notes</Label>
              <Textarea
                id="property-description"
                rows={5}
                maxLength={4000}
                value={values.description}
                onChange={(event) => update("description")(event.target.value)}
              />
              {fieldError("description")}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="property-media">Property photos, logos, and videos (optional)</Label>
              <Input
                id="property-media"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                disabled={create.isPending}
                onChange={(event) => setMediaFiles(Array.from(event.currentTarget.files ?? []))}
              />
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                Select any number of JPEG, PNG, WebP, MP4, or WebM files (up to 50 MB each).
                Uploads remain private and are attached to this property.
              </p>
              {mediaFiles.length ? (
                <p className="text-xs text-muted-foreground">
                  {mediaFiles.length} file{mediaFiles.length === 1 ? "" : "s"} selected
                </p>
              ) : null}
              {fieldError("media")}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Assigned officer (optional)</Label>
              <Select
                value={values.assigned_to || "unassigned"}
                onValueChange={(value) =>
                  update("assigned_to")(value === "unassigned" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an officer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {(staff.data ?? []).map((officer) => (
                    <SelectItem key={officer.id} value={officer.id}>
                      {officer.full_name}
                      {officer.department ? ` · ${officer.department}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <Button
                disabled={create.isPending || clients.isLoading}
                onClick={() => create.mutate()}
              >
                {create.isPending ? "Registering…" : "Register property"}
              </Button>
              <Button variant="outline" onClick={() => window.history.back()}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
