import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/website")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;
          const url = new URL(request.url);
          const id = url.searchParams.get("id");

          let query = db.from("opportunities")
            .select("id,opportunity_ref,title,description,sector,opportunity_type,location,price,currency,quantity,availability,verification_status,website_published_at")
            .eq("website_published", true)
            .eq("verification_status", "verified")
            .is("archived_at", null);

          if (id) query = query.eq("id", id);

          const { data, error } = await query.order("website_published_at", { ascending: false });

          if (error) {
            console.error("[website listings]", error);
            return Response.json({ error: "Listings unavailable" }, { status: 500 });
          }

          const listings = data ?? [];
          const ids = listings.map((item: any) => item.id);
          let media: any[] = [];

          if (ids.length) {
            const result = await db.from("media")
              .select("id,parent_id,caption,storage_path")
              .eq("parent_type", "opportunities")
              .eq("media_type", "image")
              .eq("status", "active")
              .is("archived_at", null)
              .in("parent_id", ids);

            if (!result.error) media = result.data ?? [];
          }

          const output = await Promise.all(listings.map(async (item: any) => {
            const photos = await Promise.all(
              media.filter((m: any) => m.parent_id === item.id).map(async (m: any) => {
                const { data: signed } = await db.storage
                  .from("kalexi-vault")
                  .createSignedUrl(m.storage_path, 3600);
                return signed?.signedUrl ? {
                  url: signed.signedUrl,
                  caption: m.caption
                } : null;
              })
            );

            return {
              ...item,
              images: photos.filter(Boolean)
            };
          }));

          return Response.json(
            { listings: output },
            { headers: { "Cache-Control": "public, max-age=60" } }
          );
        } catch (error) {
          console.error("[website API]", error);
          return Response.json({ error: "Unable to load listings" }, { status: 500 });
        }
      }
    }
  }
});
