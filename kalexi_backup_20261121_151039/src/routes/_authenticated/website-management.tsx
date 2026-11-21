import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { NoAccess } from "@/components/records";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/website-management")({
  component: WebsiteManagement
});

function WebsiteManagement() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const access = session?.access;
  const canView = allows(access, "opportunities.view");
  const canEdit = allows(access, "opportunities.edit");

  const opportunities = useQuery({
    queryKey: ["website-management-opportunities"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunities")
        .select("id,opportunity_ref,title,sector,opportunity_type,location,price,currency,verification_status,website_published,website_published_at,archived_at")
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }
  });

  const enquiries = useQuery({
    queryKey: ["website-management-enquiries"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("website_enquiries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    }
  });

  const publish = useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await (supabase as any).from("opportunities")
        .update({
          website_published: published,
          website_published_at: published ? new Date().toISOString() : null
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Website publication updated.");
      queryClient.invalidateQueries({ queryKey: ["website-management-opportunities"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  if (!canView) return <AppShell><NoAccess module="Website management" /></AppShell>;

  return (
    <AppShell>
      <PageHeader
        title="Website Management"
        description="Control which verified opportunities appear on the public website and review incoming enquiries."
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Property and deal publishing</h2>
          <p className="text-sm text-muted-foreground">Only verified opportunities can be published publicly.</p>
        </div>

        {opportunities.isLoading ? <p>Loading opportunities...</p> : null}
        {opportunities.error ? <p className="text-sm text-destructive">{opportunities.error.message}</p> : null}

        <div className="grid gap-3">
          {(opportunities.data ?? []).map((item: any) => (
            <Card key={item.id}>
              <CardContent className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.opportunity_ref} · {item.sector} · {item.location || "Location not supplied"}
                  </p>
                  <p className="mt-1 text-xs">
                    Verification: <strong>{item.verification_status}</strong>
                    {" · "}
                    Website: <strong>{item.website_published ? "Published" : "Not published"}</strong>
                  </p>
                </div>
                <Button
                  variant={item.website_published ? "outline" : "default"}
                  disabled={!canEdit || publish.isPending || (!item.website_published && item.verification_status !== "verified")}
                  onClick={() => publish.mutate({ id: item.id, published: !item.website_published })}
                >
                  {item.website_published ? "Unpublish" :
                    item.verification_status === "verified" ? "Publish to website" : "Verification required"}
                </Button>
              </CardContent>
            </Card>
          ))}
          {!opportunities.isLoading && !(opportunities.data ?? []).length ?
            <p className="text-sm text-muted-foreground">No opportunities found.</p> : null}
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Website enquiries</h2>
          <p className="text-sm text-muted-foreground">Messages submitted through the public website.</p>
        </div>

        {enquiries.isLoading ? <p>Loading enquiries...</p> : null}
        {enquiries.error ? <p className="text-sm text-destructive">{enquiries.error.message}</p> : null}

        <div className="grid gap-3">
          {(enquiries.data ?? []).map((item: any) => (
            <Card key={item.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold">{item.name}</p>
                  <span className="text-xs font-semibold uppercase text-primary">{item.status}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {[item.email, item.phone, item.interest].filter(Boolean).join(" · ")}
                </p>
                <p className="whitespace-pre-wrap text-sm">{item.message}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
          {!enquiries.isLoading && !(enquiries.data ?? []).length ?
            <p className="text-sm text-muted-foreground">No website enquiries received yet.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
