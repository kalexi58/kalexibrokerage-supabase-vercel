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
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
}

function cleanText(html: string): string {
  return decodeHtml(html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|article|section|h[1-6]|li|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeSearchUrl(raw: string): string {
  const href = decodeHtml(raw.replace(/&amp;/g, "&"));
  try {
    const parsed = new URL(href, "https://html.duckduckgo.com");
    const target = parsed.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : parsed.href;
  } catch {
    return href;
  }
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
    const match = host.match(/^172\.(\d+)\./);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchArticle(url: string): Promise<Record<string, unknown>> {
  if (!isPublicHttpUrl(url)) return {
    extracted_content: "",
    extraction_status: "skipped_unsafe_or_invalid_url",
  };

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KalexiResearch/1.0; +https://kalexibrokerage.com)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(9000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { extracted_content: "", extraction_status: "redirect_without_location" };
      const redirected = new URL(location, url).href;
      if (!isPublicHttpUrl(redirected)) return { extracted_content: "", extraction_status: "redirect_blocked" };
      const second = await fetch(redirected, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; KalexiResearch/1.0; +https://kalexibrokerage.com)",
          "Accept": "text/html,application/xhtml+xml",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(9000),
      });
      if (!second.ok) return { extracted_content: "", extraction_status: `http_${second.status}` };
      const type = second.headers.get("content-type") || "";
      if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) {
        return { extracted_content: "", extraction_status: "not_html" };
      }
      return extractArticleHtml(await second.text());
    }

    if (!response.ok) return { extracted_content: "", extraction_status: `http_${response.status}` };
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) {
      return { extracted_content: "", extraction_status: "not_html" };
    }
    return extractArticleHtml(await response.text());
  } catch (error) {
    return {
      extracted_content: "",
      extraction_status: error instanceof Error ? `unavailable: ${error.message}` : "unavailable",
    };
  }
}

function extractArticleHtml(html: string): Record<string, unknown> {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const description =
    html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]+content=["']([^"']*)["'][^>]*>/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]*>/i)?.[1] || "";
  const published =
    html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished|pubdate)["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] || "";

  const main = html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)?.[1] || html;
  const extracted = cleanText(main).slice(0, 5000);
  return {
    page_title: cleanText(title).slice(0, 300),
    page_description: cleanText(description).slice(0, 1000),
    published_at: published || null,
    extracted_content: extracted,
    extraction_status: extracted.length > 180 ? "extracted_needs_review" : "limited_text_needs_review",
  };
}

async function duckSearch(query: string, limit: number): Promise<Array<Record<string, unknown>>> {
  const searchUrl = new URL("https://html.duckduckgo.com/html/");
  searchUrl.searchParams.set("q", query);
  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}`);
  const html = await response.text();

  const anchors = [...html.matchAll(/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const snippets = [...html.matchAll(/<a\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>|<div\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)];
  const results: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (let i = 0; i < anchors.length && results.length < limit; i++) {
    const rawUrl = decodeSearchUrl(anchors[i][1]);
    if (!isPublicHttpUrl(rawUrl) || seen.has(rawUrl)) continue;
    seen.add(rawUrl);
    const title = cleanText(anchors[i][2]);
    const snippet = cleanText(snippets[i]?.[1] || snippets[i]?.[2] || "");
    const article = await fetchArticle(rawUrl);
    const extracted = String(article.extracted_content || "");
    results.push({
      id: crypto.randomUUID(),
      title: String(article.page_title || title || "Search result").slice(0, 300),
      url: rawUrl,
      source_url: rawUrl,
      source_name: SOURCE_MODE === "rio" ? "The Rio Times (public web search)" : "Public web search",
      snippet,
      description: String(article.page_description || snippet).slice(0, 1200),
      content: extracted,
      extracted_content: extracted,
      published_at: article.published_at || null,
      extraction_status: article.extraction_status || "not_extracted",
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return reply({ error: "Supabase Edge Function configuration is incomplete. Check SUPABASE_URL, an anon/publishable key, and SUPABASE_SERVICE_ROLE_KEY.", results: [] }, 200);
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
      return reply({ error: "Your session is invalid or expired. Sign in again.", results: [] }, 401);
    }

    const { data: permitted, error: permissionError } = await admin.rpc("has_permission", {
      _user_id: authData.user.id,
      _perm: "research.view",
    });
    if (permissionError) {
      console.error("research permission check failed", permissionError.message);
      return reply({ error: `Permission check failed: ${permissionError.message}`, results: [] }, 200);
    }
    if (!permitted) {
      return reply({ error: "Your account does not have the research.view permission.", results: [] }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const query = String(body.query ?? body.search_query ?? body.subject ?? "").trim().slice(0, 240);
    if (!query) return reply({ results: [], items: [], query: "", result_count: 0 });

    const limit = Math.min(10, Math.max(1, Number(body.limit) || 8));
    const providerQuery = SOURCE_MODE === "rio" ? `${query} site:riotimesonline.com` : query;

    try {
      const results = await duckSearch(providerQuery, limit);
      return reply({
        results,
        items: results,
        query,
        source: SOURCE_MODE === "rio" ? "The Rio Times" : "Public web search",
        provider: "DuckDuckGo HTML (unofficial, no API key)",
        result_count: results.length,
        retrieved_at: new Date().toISOString(),
        learning_status: "Search results and extracted page text are unverified. Review source, identity, dates and context before recording a finding.",
        warning: "This is a best-effort no-key provider. Results can be incomplete, blocked or rate-limited.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown search provider error";
      console.error("DuckDuckGo search failed", { mode: SOURCE_MODE, message });
      return reply({
        error: `Public search provider failed: ${message}. This no-key provider may be rate-limited or blocked.`,
        results: [],
        items: [],
        query,
        source: SOURCE_MODE,
        provider: "DuckDuckGo HTML (unofficial)",
        result_count: 0,
        retrieved_at: new Date().toISOString(),
      }, 200);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown function error";
    console.error("research search function failed", message);
    return reply({ error: message, results: [], items: [] }, 200);
  }
});