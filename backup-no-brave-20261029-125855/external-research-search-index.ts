import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function respond(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond(405, { error: "POST required." });
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return respond(401, { error: "Sign in to use research search." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey || !braveKey) {
    return respond(500, {
      error: "Server configuration incomplete. Check Edge Function secrets.",
    });
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } =
      await userClient.auth.getUser(token);

    if (authError || !authData.user) {
      return respond(401, { error: "Your session is invalid or expired." });
    }

    // Use the existing database permission function.
    // Fail closed if permission cannot be verified.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: allowed, error: permissionError } = await admin.rpc(
      "has_permission",
      {
        _user_id: authData.user.id,
        _perm: "research.view",
      },
    );

    if (permissionError || allowed !== true) {
      return respond(403, {
        error: "Your account does not have research.view permission.",
      });
    }

    const body = await req.json().catch(() => ({}));
    const query = typeof body.q === "string" ? body.q.trim() : "";

    if (query.length < 2) {
      return respond(400, { error: "Enter at least two search characters." });
    }

    if (query.length > 600) {
      return respond(400, { error: "Search query is too long." });
    }

    // Search public web results. Do not treat results as verified facts.
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "10");
    url.searchParams.set("country", "UG");
    url.searchParams.set("search_lang", "en");
    url.searchParams.set("safesearch", "moderate");

    const searchResponse = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": braveKey,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!searchResponse.ok) {
      console.error("Brave Search returned status:", searchResponse.status);
      return respond(502, {
        error: "External search provider failed. Check provider quota and API key.",
      });
    }

    const result = await searchResponse.json();
    const webResults = Array.isArray(result?.web?.results)
      ? result.web.results
      : [];

    const results = webResults.map((item: Record<string, unknown>) => ({
      title: typeof item.title === "string" ? item.title : "Untitled result",
      url: typeof item.url === "string" ? item.url : "",
      snippet: typeof item.description === "string" ? item.description : "",
      source: typeof item.profile?.long_name === "string"
        ? item.profile.long_name
        : (typeof item.meta_url?.hostname === "string"
          ? item.meta_url.hostname
          : ""),
      published: typeof item.page_age === "string" ? item.page_age : null,
      sourceType: "external_web",
      verificationStatus: "unverified",
    })).filter((item: { url: string }) =>
      item.url.startsWith("https://") || item.url.startsWith("http://")
    );

    return respond(200, {
      query,
      provider: "Brave Search",
      searchedAt: new Date().toISOString(),
      resultCount: results.length,
      results,
      notice: "Search results are unverified leads. Open and assess each source before relying on it.",
    });
  } catch (error) {
    console.error("External research search failed:", error);
    return respond(500, {
      error: "Search could not be completed. Check Edge Function logs.",
    });
  }
});
