import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST required." }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) {
      return reply({ error: "Sign in to use research search." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return reply({ error: "Supabase server configuration is incomplete." }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Invalid or expired session." }, 401);

    const { data: permitted, error: permissionError } = await admin.rpc("has_permission", {
      _user_id: authData.user.id,
      _perm: "research.view",
    });
    if (permissionError || !permitted) {
      return reply({ error: "You do not have permission to use research search." }, 403);
    }

    const body = await req.json();
    const query = String(body.query ?? body.search_query ?? body.subject ?? "").trim();
    if (!query) return reply({ results: [], query, result_count: 0 });

    const limit = Math.min(10, Math.max(1, Number(body.limit) || 5));
    const isRio = "true";
    const providerQuery = isRio ? `${query} site:riotimesonline.com` : query;
    const results: Array<Record<string, unknown>> = [];

    // Wikipedia's public API: useful for background, not comprehensive web coverage.
    if (!isRio) {
      const url = new URL("https://en.wikipedia.org/w/api.php");
      url.searchParams.set("action", "query");
      url.searchParams.set("generator", "search");
      url.searchParams.set("gsrsearch", query);
      url.searchParams.set("gsrlimit", String(limit));
      url.searchParams.set("gsrnamespace", "0");
      url.searchParams.set("prop", "pageimages|extracts|info");
      url.searchParams.set("inprop", "url");
      url.searchParams.set("exintro", "1");
      url.searchParams.set("explaintext", "1");
      url.searchParams.set("exsentences", "3");
      url.searchParams.set("format", "json");
      url.searchParams.set("origin", "*");

      const response = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "KalexiBrokerageResearch/1.0" },
        signal: AbortSignal.timeout(12000),
      });

      if (response.ok) {
        const payload = await response.json();
        const pages = Object.values(payload.query?.pages ?? {}) as any[];
        for (const page of pages) {
          if (page.fullurl) results.push({
            title: page.title ?? "Wikipedia result",
            url: page.fullurl,
            snippet: page.extract ?? "",
            source: "Wikipedia",
            source_name: "Wikipedia",
            retrieved_at: new Date().toISOString(),
            verification_status: "needs_review",
          });
        }
      }
    } else {
      // Public-site discovery links; do not scrape article content or bypass access controls.
      // Search engines may interpret the query themselves when the user opens the link.
      results.push({
        title: `Search The Rio Times for: ${query}`,
        url: `https://www.google.com/search?q=${encodeURIComponent(providerQuery)}`,
        snippet: "Open this search to find Rio Times articles. Article results have not yet been independently retrieved.",
        source: "The Rio Times search link",
        source_name: "The Rio Times",
        retrieved_at: new Date().toISOString(),
        verification_status: "needs_review",
      });
      results.push({
        title: `Browse The Rio Times`,
        url: "https://www.riotimesonline.com/",
        snippet: "Official publication homepage.",
        source: "The Rio Times",
        source_name: "The Rio Times",
        retrieved_at: new Date().toISOString(),
        verification_status: "needs_review",
      });
    }

    return reply({
      results,
      items: results,
      query,
      source: isRio ? "The Rio Times" : "Wikipedia",
      provider: isRio ? "Public search links" : "Wikipedia public API",
      result_count: results.length,
      learning_status: "Sources retrieved or linked; findings require investigator review.",
      retrieved_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Research search error:", error);
    return reply({
      error: error instanceof Error ? error.message : "External search failed.",
      results: [],
    }, 502);
  }
});
