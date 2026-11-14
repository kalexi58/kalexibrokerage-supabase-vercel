import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MediaGallery } from "@/components/MediaGallery";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClientEditor } from "@/components/ClientEditor";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { StatusPill } from "@/components/records";
import { formatMoney } from "@/lib/records";

export const Route = createFileRoute("/_authenticated/clients/$clientId/")({
  head: () => ({
    meta: [
      { title: "Client Record — Kalexi Brokerage" },
      { name: "description", content: "Complete internal record for a registered Kalexi client." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientDetail,
});

function ClientDetail() {
  const { clientId } = useParams({ from: "/_authenticated/clients/$clientId/" });
  const { data: session } = useSession();

  const client = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const registrar = useQuery({
    queryKey: ["registrar", client.data?.registered_by],
    enabled: !!client.data?.registered_by,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, job_title")
        .eq("id", client.data!.registered_by!)
        .maybeSingle();
      return data;
    },
  });

  const photo = useQuery({
    queryKey: ["client-photo", client.data?.id, client.data?.photo_path],
    enabled: !!client.data?.photo_path,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("client-photos")
        .createSignedUrl(client.data!.photo_path!, 600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const properties = useQuery({
    queryKey: ["client-properties", clientId],
    enabled: allows(session?.access, "properties.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, property_ref, name, category, location, asking_price, currency, status")
        .eq("client_id", clientId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (client.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading client record…</p>
      </AppShell>
    );
  }

  if (!client.data) {
    return (
      <AppShell>
        <PageHeader
          title="Record not found"
          description="This client record is not available to you."
        />
        <Button asChild variant="outline">
          <Link to="/clients">Back to client register</Link>
        </Button>
      </AppShell>
    );
  }

  const c = client.data;
  const rows: [string, string][] = [
    ["Client ID", c.client_ref],
    ["Full name", c.full_name],
    ["Phone", c.phone],
    ["Email", c.email ?? "—"],
    ["Company", c.company_name ?? "—"],
    ["Client type", c.client_type],
    ["Sector", c.sector],
    ["Branch", c.branch ?? "—"],
    ["Status", c.status],
    ["Registered", new Date(c.created_at).toLocaleString()],
    ["Registered by", registrar.data?.full_name ?? "—"],
  ];

  return (
    <AppShell>
      <PageHeader
        title={c.full_name}
        description={`${c.client_ref} · ${c.client_type} · ${c.sector}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ClientEditor client={c} />
            <Button asChild variant="outline">
              <Link to="/clients/$clientId/acknowledgement" params={{ clientId }}>
                Registration acknowledgement
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Card className="shadow-[var(--shadow-panel)]">
          <CardContent className="p-0">
            {photo.data ? (
              <img
                src={photo.data}
                alt={`${c.full_name} profile`}
                className="m-5 h-28 w-28 rounded-lg border object-cover"
              />
            ) : null}
            {photo.isError ? (
              <p className="px-5 pt-4 text-sm text-destructive">
                The private client photo could not be loaded.
              </p>
            ) : null}
            <dl className="divide-y text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="flex gap-4 px-5 py-3">
                  <dt className="w-40 shrink-0 text-muted-foreground">{k}</dt>
                  <dd className={k === "Client ID" ? "ref-mono" : ""}>{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-[var(--shadow-panel)]">
            <CardContent className="p-5">
              <p className="label-caps">Stated requirement</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{c.requirement}</p>
            </CardContent>
          </Card>
          <Card className="shadow-[var(--shadow-panel)]">
            <CardContent className="p-5">
              <p className="label-caps">Case progress</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li className="text-foreground">✓ Registered</li>
                <li>Onboarding &amp; KYC — pending module</li>
                <li>Verification &amp; risk check — pending module</li>
                <li>Matching &amp; deals — pending module</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="mt-6">
        <MediaGallery parentType="clients" parentId={clientId} title="Client photos & videos" />
      </div>
      {allows(session?.access, "properties.view") ? (
        <section className="mt-6 rounded-lg border bg-card shadow-[var(--shadow-panel)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">Linked properties and assets</h2>
              <p className="text-xs text-muted-foreground">
                Every property record remains linked to this client.
              </p>
            </div>
            {allows(session?.access, "properties.create") ? (
              <Button asChild size="sm">
                <Link to="/properties/new">Register property</Link>
              </Button>
            ) : null}
          </header>
          {properties.isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Loading linked properties…</p>
          ) : properties.isError ? (
            <div className="p-5 text-sm text-destructive">
              Linked properties could not be retrieved. Retry from the property register.
            </div>
          ) : properties.data?.length ? (
            <ul className="divide-y">
              {properties.data.map((property) => (
                <li
                  key={property.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <Link
                      to="/properties/$propertyId"
                      params={{ propertyId: property.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {property.name}
                    </Link>
                    <p className="ref-mono text-xs text-muted-foreground">
                      {property.property_ref} · {property.category} · {property.location}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm">
                      {property.asking_price === null
                        ? "—"
                        : formatMoney(property.asking_price, property.currency)}
                    </span>
                    <StatusPill value={property.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              No properties are currently linked to this client.
            </p>
          )}
        </section>
      ) : null}
    </AppShell>
  );
}
