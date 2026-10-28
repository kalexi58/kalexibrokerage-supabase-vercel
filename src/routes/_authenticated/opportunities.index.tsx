import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { NoAccess, StatusPill } from "@/components/records";
import { SECTORS, formatMoney, titleCase } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataEmptyState, DataTableSkeleton, ErrorState } from "@/components/LoadingStates";

export const Route = createFileRoute("/_authenticated/opportunities/")({
  head: () => ({
    meta: [
      { title: "Opportunity Database — Kalexi Brokerage" },
      { name: "description", content: "Search and manage the register of sourced opportunities." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OpportunitiesPage,
});

const TYPES = ["supply", "demand", "sale", "lease", "investment", "service"];
const VERIFICATIONS = ["unverified", "in_review", "verified", "rejected"];

function OpportunitiesPage() {
  const { data: session } = useSession();
  const access = session?.access;
  const [term, setTerm] = useState("");
  const [sector, setSector] = useState("all");
  const [type, setType] = useState("all");
  const [verification, setVerification] = useState("all");

  const opportunities = useQuery({
    queryKey: ["opportunities", term, sector, type, verification],
    enabled: allows(access, "opportunities.view"),
    queryFn: async () => {
      let query = supabase
        .from("opportunities")
        .select(
          "id, opportunity_ref, title, sector, opportunity_type, price, currency, owner_name, verification_status, status",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (sector !== "all") query = query.eq("sector", sector);
      if (type !== "all") query = query.eq("opportunity_type", type);
      if (verification !== "all") query = query.eq("verification_status", verification);
      const q = term.trim();
      if (q)
        query = query.or(`opportunity_ref.ilike.%${q}%,title.ilike.%${q}%,owner_name.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!allows(access, "opportunities.view")) {
    return (
      <AppShell>
        <PageHeader title="Opportunity database" />
        <NoAccess module="Opportunities" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Opportunity database"
        description="Sourced supply, demand, sale, lease, investment and service opportunities."
        actions={
          allows(access, "opportunities.create") ? (
            <Button asChild>
              <Link to="/opportunities/new">New opportunity</Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search ref, title or owner"
          className="max-w-xs"
          maxLength={80}
        />
        <Select value={sector} onValueChange={setSector}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sectors</SelectItem>
            {SECTORS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {titleCase(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={verification} onValueChange={setVerification}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Verification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All verification</SelectItem>
            {VERIFICATIONS.map((v) => (
              <SelectItem key={v} value={v}>
                {titleCase(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-x-auto shadow-[var(--shadow-panel)]">
        {opportunities.isLoading ? (
          <DataTableSkeleton rows={6} columns={7} />
        ) : opportunities.isError ? (
          <div className="p-4">
            <ErrorState
              title="Opportunities could not be retrieved"
              description="Check your connection and retry."
              onRetry={() => void opportunities.refetch()}
            />
          </div>
        ) : opportunities.data && opportunities.data.length > 0 ? (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Ref</th>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Sector</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Price</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Verification</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.data.map((o) => (
                <tr key={o.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      to="/opportunities/$opportunityId"
                      params={{ opportunityId: o.id }}
                      className="ref-mono text-xs font-medium underline-offset-2 hover:underline"
                    >
                      {o.opportunity_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{o.title}</td>
                  <td className="px-4 py-2.5">{o.sector}</td>
                  <td className="px-4 py-2.5">{titleCase(o.opportunity_type)}</td>
                  <td className="px-4 py-2.5">{formatMoney(o.price, o.currency ?? "UGX")}</td>
                  <td className="px-4 py-2.5">{o.owner_name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <StatusPill value={o.verification_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <DataEmptyState
            title={term ? "No opportunities match that search" : "No opportunities recorded"}
            description={
              term
                ? "Try another reference, title, or owner."
                : "New opportunities will appear here."
            }
          />
        )}
      </Card>
    </AppShell>
  );
}
