import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { DataEmptyState, DataTableSkeleton, ErrorState } from "@/components/LoadingStates";
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
      if (search)
        query = query.or(
          `property_ref.ilike.%${search}%,name.ilike.%${search}%,location.ilike.%${search}%`,
        );
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as {
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
        clients: { id: string; full_name: string; client_ref: string } | null;
      }[];
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
        description="Assets linked to registered clients, with verification and secure document history."
        actions={
          allows(access, "properties.create") ? (
            <Button asChild>
              <Link to="/properties/new">Register property</Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
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
      <Card className="overflow-x-auto shadow-[var(--shadow-panel)]">
        {properties.isLoading ? (
          <DataTableSkeleton rows={6} columns={7} />
        ) : properties.isError ? (
          <div className="p-4">
            <ErrorState
              title="Property records could not be retrieved"
              description="Check your access and connection, then retry."
              onRetry={() => void properties.refetch()}
            />
          </div>
        ) : properties.data?.length ? (
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Asking price</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {properties.data.map((property) => (
                <tr key={property.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link
                      to="/properties/$propertyId"
                      params={{ propertyId: property.id }}
                      className="ref-mono text-xs font-medium underline-offset-2 hover:underline"
                    >
                      {property.property_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">{property.name}</td>
                  <td className="px-4 py-3">
                    {property.clients ? (
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: property.clients.id }}
                        className="hover:underline"
                      >
                        {property.clients.full_name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">{titleCase(property.category)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {property.location}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {property.asking_price === null
                      ? "—"
                      : formatMoney(property.asking_price, property.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill value={property.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      </Card>
    </AppShell>
  );
}
