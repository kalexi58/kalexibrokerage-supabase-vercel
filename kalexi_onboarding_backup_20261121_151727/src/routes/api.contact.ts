import { createFileRoute } from "@tanstack/react-router";

const recentRequests = new Map<string, number[]>();

export const Route = createFileRoute("/api/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const origin = request.headers.get("origin");
          const current = new URL(request.url);

          if (origin && new URL(origin).host !== current.host) {
            return Response.json({ error: "Invalid request origin" }, { status: 403 });
          }

          const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
          const now = Date.now();
          const previous = (recentRequests.get(ip) || []).filter(t => now - t < 60000);

          if (previous.length >= 5) {
            return Response.json({ error: "Please wait before sending another enquiry." }, { status: 429 });
          }

          previous.push(now);
          recentRequests.set(ip, previous);

          const body = await request.json();

          // Honeypot field used by the existing website forms.
          if (body.website) return Response.json({ success: true });

          const name = String(body.name || "").trim();
          const email = String(body.email || "").trim().toLowerCase();
          const phone = String(body.phone || "").trim();
          const message = String(body.message || "").trim();
          const interest = String(body.interest || "").trim();
          const sourcePage = String(body.form || "website").slice(0, 100);

          if (name.length < 2 || name.length > 140 ||
              message.length < 10 || message.length > 5000 ||
              (!email && !phone) ||
              (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
              phone.length > 40 ||
              body.consent !== "yes") {
            return Response.json({ error: "Please check your details and consent." }, { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;

          const { error } = await db.from("website_enquiries").insert({
            name,
            email: email || null,
            phone: phone || null,
            interest: interest || null,
            message,
            source_page: sourcePage,
            status: "new"
          });

          if (error) {
            console.error("[website enquiry save]", error);
            return Response.json({ error: "Your enquiry could not be saved." }, { status: 500 });
          }

          return Response.json({ success: true });
        } catch (error) {
          console.error("[website contact]", error);
          return Response.json({ error: "Unable to process enquiry." }, { status: 500 });
        }
      }
    }
  }
});
