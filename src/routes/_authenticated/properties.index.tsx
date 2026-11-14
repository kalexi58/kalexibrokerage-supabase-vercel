import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin, Images } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { DataEmptyState, ErrorState } from "@/components/LoadingStates";
import { NoAccess, StatusPill } from "@/components/records";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { formatMoney, titleCase } from "@/lib/records";
import {
  PropertyMediaCarousel,
  type PropertyMediaItem,
} from "@/components/PropertyMediaCarousel";

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({
    meta: [
      { title: "Property Register — Kalexi Brokerage" },
      { name: "description", content: "Client-linked property and asset records." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PropertiesPage,
});

const CATEGORIES = ["land", "house", "commercial", "industrial", "hotel", "rental", "other"];
const STATUSES = ["pending_verification", "available", "under_offer", "sold", "leased", "rejected"];

interface PropertyRow {
  id: string;
  property_ref: string;
  name: string;
  category: string;
  location: string;
  asking_price: number | null;
  currency: string;
  status: string;
  verification_status: string;
  created_at: string;
  clients: {
    id: string;
    full_name: string;
    client_ref: string;
  } | null;
}

function PropertiesPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");

  const properties = useQuery({
    queryKey: ["properties", term, category, status],
    enabled: allows(access, "properties.view"),
    queryFn: async () => {
      let query = supabase
        .from("properties")
        .select(
          "id, property_ref, name, category, location, asking_price, currency, status, verification_status, created_at, clients(id, full_name, client_ref)",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(300);

      if (category !== "all") query = query.eq("category", category);
      if (status !== "all") query = query.eq("status", status);

      const search = term.trim();
      if (search) {
        query = query.or(
          `property_ref.ilike.%${search}%,name.ilike.%${search}%,location.ilike.%${search}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as PropertyRow[];
    },
  });

  const propertyIds = properties.data?.map((property) => property.id) ?? [];

  const propertyMedia = useQuery({
    queryKey: ["property-card-media", propertyIds],
    enabled: allows(access, "properties.view") && propertyIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_files")
        .select("id, property_id, display_name, storage_path, mime_type, category")
        .in("property_id", propertyIds)
        .is("archived_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const rows = data ?? [];

      const resolved = await Promise.all(
        rows
          .filter(
            (file) =>
              file.mime_type?.startsWith("image/") ||
              file.mime_type?.startsWith("video/"),
          )
          .map(async (file) => {
            const { data: signed, error: signedError } = await supabase.storage
              .from("property-files")
              .createSignedUrl(file.storage_path, 600);

            if (signedError || !signed) {
              return { property_id: file.property_id, item: null };
            }

            const item: PropertyMediaItem = {
              id: file.id,
              display_name: file.display_name,
              mime_type: file.mime_type,
              url: signed.signedUrl,
            };

            return { property_id: file.property_id, item };
          }),
      );

      return resolved.reduce<Record<string, PropertyMediaItem[]>>(
        (result, entry) => {
          if (!entry.item) return result;
          result[entry.property_id] ??= [];
          result[entry.property_id].push(entry.item);
          return result;
        },
        {},
      );
    },
  });

  if (!allows(access, "properties.view")) {
    return (
      <AppShell>
        <PageHeader title="Property register" />
        <NoAccess module="Properties & Assets" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Property register"
        description="Browse property records, photos, videos and ownership information."
        actions={
          allows(access, "properties.create") ? (
            <Button asChild>
              <Link to="/properties/new">Register property</Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search reference, name or location"
          maxLength={100}
        />

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((item) => (
              <SelectItem key={item} value={item}>
                {titleCase(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((item) => (
              <SelectItem key={item} value={item}>
                {titleCase(item.replaceAll("_", " "))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {properties.isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="h-80 animate-pulse bg-muted/50" />
          ))}
        </div>
      ) : properties.isError ? (
        <ErrorState
          title="Property records could not be retrieved"
          description="Check your access and connection, then retry."
          onRetry={() => void properties.refetch()}
        />
      ) : properties.data?.length ? (
        <>
          {propertyMedia.isError ? (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Property records loaded, but some property images could not be retrieved.
              Open an individual property record to review its files.
            </p>
          ) : null}

          <div className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {properties.data.map((property) => {
              const media = propertyMedia.data?.[property.id] ?? [];

              return (
                <Card
                  key={property.id}
                  className="relative overflow-hidden border bg-card shadow-[var(--shadow-panel)] transition duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <Link
                    to="/properties/$propertyId"
                    params={{ propertyId: property.id }}
                    aria-label={`Open ${property.name}`}
                    className="absolute inset-0 z-0 rounded-lg"
                  />

                  <div className="relative z-10 pointer-events-none">
                    <PropertyMediaCarousel
                      items={media}
                      compact
                      label={property.name}
                    />

                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="ref-mono text-[10px] font-semibold text-muted-foreground">
                            {property.property_ref}
                          </p>
                          <h2 className="mt-1 line-clamp-2 text-base font-semibold">
                            {property.name}
                          </h2>
                        </div>
                        <span className="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
                          <Building2 className="h-5 w-5" />
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-red-600" />
                        <span className="line-clamp-1">{property.location}</span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {titleCase(property.category)}
                        </span>
                        <StatusPill value={property.status} />
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t pt-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Asking price
                          </p>
                          <p className="mt-1 text-sm font-bold">
                            {property.asking_price === null
                              ? "Price not provided"
                              : formatMoney(property.asking_price, property.currency)}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Images className="h-3.5 w-3.5" />
                          {media.length} media
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          Owner: {property.clients?.full_name ?? "Not linked"}
                        </span>
                        <StatusPill value={property.verification_status} />
                      </div>

                      <p className="text-center text-xs font-semibold text-primary">
                        View property details →
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <DataEmptyState
          title={term ? "No properties match that search" : "No properties registered"}
          description={
            term
              ? "Try another property reference, name, or location."
              : "Client-linked property records will appear here."
          }
        >
          {!term && allows(access, "properties.create") ? (
            <Button asChild>
              <Link to="/properties/new">
                <Building2 className="mr-2 h-4 w-4" />
                Register property
              </Link>
            </Button>
          ) : null}
        </DataEmptyState>
      )}
    </AppShell>
  );
}
