import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SOURCE_MODE = "rio";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function cleanText(value: string): string {
  return decodeHtml(value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function publicHttpUrl(value: string): URL | null {
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return null;
    const h = u.hostname.toLowerCase();
    if (
      h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") ||
      h === "::1" || h.startsWith("127.") || h.startsWith("10.") ||
      h.startsWith("192.168.") || h.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "0.0.0.0"
    ) return null;
    return u;
  } catch {
    return null;
  }
}

function resolveResultUrl(raw: string): string | null {
  try {
    const href = decodeHtml(raw).replace(/&amp;/g, "&");
    const u = new URL(href, "https://html.duckduckgo.com");
    if (u.hostname.endsWith("duckduckgo.com")) {
      const target = u.searchParams.get("uddg");
      if (target) return publicHttpUrl(target)?.href ?? null;
    }
    return publicHttpUrl(u.href)?.href ?? null;
  } catch {
    return null;
  }
}

async function searchWeb(query: string, limit: number) {
  const searchUrl = new URL("https://html.duckduckgo.com/html/");
  searchUrl.searchParams.set("q", query);

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KalexiResearch/1.0)",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(300000),
  });

  if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}`);

  const html = (await response.text()).slice(0, 2_000_000);
  const anchors = [...html.matchAll(
    /<a\b(?=[^>]*\bclass=["'][^"']*\bresult__a\b[^"']*["'])[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  )];
  const snippets = [...html.matchAll(
    /<(?:a|div)\b(?=[^>]*\bclass=["'][^"']*\bresult__snippet\b[^"']*["'])[^>]*>([\s\S]*?)<\/(?:a|div)>/gi
  )];

  const results: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (let i = 0; i < anchors.length && results.length < limit; i++) {
    const url = resolveResultUrl(anchors[i][1]);
    if (!url || seen.has(url)) continue;

    const parsed = new URL(url);
    if (
      SOURCE_MODE === "rio" &&
      parsed.hostname !== "riotimesonline.com" &&
      !parsed.hostname.endsWith(".riotimesonline.com")
    ) continue;

    seen.add(url);
    const title = cleanText(anchors[i][2]).slice(0, 300);
    if (!title) continue;

    const snippet = cleanText(snippets[i]?.[1] ?? "").slice(0, 1200);
    results.push({
      id: crypto.randomUUID(),
      title,
      url,
      source_url: url,
      source_name: SOURCE_MODE === "rio" ? "The Rio Times" : parsed.hostname,
      snippet,
      description: snippet,
      content: "",
      extracted_content: "",
      published_at: null,
      extraction_status: "not_fetched",
      verification_status: "needs_review",
      evidence_type: "public_source",
      retrieved_at: new Date().toISOString(),
      provider: "DuckDuckGo HTML (unofficial, no API key)",
    });
  }

  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST required.", results: [] }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) {
      return reply({ error: "Sign in to use research search.", results: [] }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return reply({ error: "Search function server configuration is incomplete.", results: [] }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      return reply({ error: "Invalid or expired session. Sign in again.", results: [] }, 401);
    }

    const { data: permitted, error: permissionError } = await admin.rpc("has_permission", {
      _user_id: authData.user.id,
      _perm: "research.view",
    });
    if (permissionError) {
      console.error("Research permission check failed:", permissionError.message);
      return reply({ error: "Could not verify research permission.", results: [] }, 500);
    }
    if (!permitted) {
      return reply({ error: "Your account does not have research.view permission.", results: [] }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const query = String(body.query ?? body.search_query ?? body.subject ?? "").trim().slice(0, 240);
    if (!query) return reply({ results: [], items: [], query: "", result_count: 0 });

    const limit = Math.min(8, Math.max(1, Number(body.limit) || 5));
    const providerQuery = SOURCE_MODE === "rio"
      ? `${query} site:riotimesonline.com`
      : query;

    try {
      const results = await searchWeb(providerQuery, limit);
      return reply({
        results,
        items: results,
        query,
        source: SOURCE_MODE === "rio" ? "The Rio Times" : "Public web search",
        provider: "DuckDuckGo HTML (unofficial, no API key)",
        result_count: results.length,
        retrieved_at: new Date().toISOString(),
        learning_status: "Search results are unverified evidence. Check the source, identity, dates and context before recording a finding.",
        warning: results.length
          ? "Search results require investigator review. Article text is retrieved separately by the finding reader."
          : "No article links were returned. The provider may be blocked, rate-limited, or unable to find matching pages.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown search error";
      console.error("Public search failed:", { mode: SOURCE_MODE, message });
      return reply({
        error: `Public search unavailable: ${message}`,
        results: [],
        items: [],
        query,
        source: SOURCE_MODE === "rio" ? "The Rio Times" : "Public web search",
        provider: "DuckDuckGo HTML (unofficial, no API key)",
        result_count: 0,
        retrieved_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown function error";
    console.error("Research search function failed:", message);
    return reply({ error: "Research search failed. Check the Edge Function logs.", results: [], items: [] }, 500);
  }
});
