import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function cleanText(value: string, max = 30000) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function safeUrl(value: string, base: string): string | null {
  try {
    const u = new URL(value, base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;

    const host = u.hostname.toLowerCase();
    if (host !== "ubc.go.ug" && !host.endsWith(".ubc.go.ug")) return null;

    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function extractPage(html: string, url: string) {
  const title =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";

  const description =
    html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["'][^>]*>/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i)?.[1] ??
    "";

  const published =
    html.match(/<meta[^>]+(?:property|name)=["']article:published_time["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] ??
    null;

  const media: Array<Record<string, string>> = [];
  const seen = new Set<string>();

  function addMedia(raw: string | undefined, type: string, alt = "") {
    if (!raw || media.length >= 20) return;
    const u = safeUrl(raw, url);
    if (!u || seen.has(u)) return;
    seen.add(u);
    media.push({ url: u, type, alt: cleanText(alt, 300) });
  }

  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/gi)) {
    addMedia(m[1], "image");
  }
  for (const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/gi)) {
    addMedia(m[1], "image");
  }
  for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = m[1];
    const src = attrs.match(/\b(?:src|data-src)=["']([^"']+)["']/i)?.[1];
    const alt = attrs.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "";
    addMedia(src, "image", alt);
  }
  for (const m of html.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/gi)) {
    const src = m[0].match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const poster = m[0].match(/\bposter=["']([^"']+)["']/i)?.[1];
    if (src) addMedia(src, "video");
    if (poster) addMedia(poster, "image", "Video poster");
  }
  for (const m of html.matchAll(/<iframe\b[^>]*src=["']([^"']+)["']/gi)) {
    const raw = m[1];
    try {
      const u = new URL(raw, url);
      if (["www.youtube.com", "youtube.com", "youtu.be", "player.vimeo.com"].includes(u.hostname.toLowerCase())) {
        media.push({ url: u.toString(), type: "video_embed", alt: "Embedded video" });
      }
    } catch { /* Ignore malformed embed URLs. */ }
  }

  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

  return {
    title: cleanText(title.replace(/<[^>]+>/g, ""), 500),
    description: cleanText(description, 2000),
    publishedAt: published,
    articleText: cleanText(withoutNoise, 30000),
    media,
  };
}

// Heuristic extraction only. Every candidate must be reviewed by an investigator.
function extractEntityCandidates(text: string) {
  const candidates = new Set<string>();
  const pattern = /\b(?:[A-Z][a-z]{2,}|[A-Z]{2,})(?:[-'][A-Za-z]+)?(?:\s+(?:[A-Z][a-z]{2,}|[A-Z]{2,})(?:[-'][A-Za-z]+)?){1,3}\b/g;

  const stop = new Set([
    "Uganda Broadcasting Corporation", "Police Arrest",
    "September", "October", "November", "December",
    "United States", "United Kingdom", "East Africa",
    "The Investigation", "The Police", "The Suspects",
    "The Company", "The Business", "According To",
  ]);

  for (const match of text.matchAll(pattern)) {
    const value = cleanText(match[0], 180);
    if (value.length < 5 || stop.has(value)) continue;
    candidates.add(value);
    if (candidates.size >= 40) break;
  }

  return [...candidates];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return reply({ error: "Supabase server configuration is incomplete." }, 500);
    }
    if (!braveKey) {
      return reply({
        error: "Missing BRAVE_SEARCH_API_KEY. Configure it in Supabase Edge Function secrets.",
      }, 503);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) return reply({ error: "Sign-in required." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Invalid session." }, 401);

    const { data: permitted, error: permissionError } = await admin.rpc(
      "has_permission",
      { _user_id: authData.user.id, _perm: "research.view" },
    );
    if (permissionError || permitted !== true) {
      return reply({ error: "Your account does not have research.view permission." }, 403);
    }

    const body = await req.json();
    const query = cleanText(String(body.query ?? ""), 250);
    if (query.length < 2) return reply({ error: "Enter at least two characters." }, 400);

    const searchUrl = new URL("https://api.search.brave.com/res/v1/web/search");
    searchUrl.searchParams.set("q", `site:ubc.go.ug ${query}`);
    searchUrl.searchParams.set("count", "10");
    searchUrl.searchParams.set("country", "UG");
    searchUrl.searchParams.set("search_lang", "en");
    searchUrl.searchParams.set("safesearch", "moderate");

    const searchResponse = await fetch(searchUrl, {
      headers: { "X-Subscription-Token": braveKey, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!searchResponse.ok) {
      return reply({ error: `UBC search provider returned HTTP ${searchResponse.status}.` }, 502);
    }

    const searchJson = await searchResponse.json();
    const rawResults = Array.isArray(searchJson.web?.results)
      ? searchJson.web.results
      : [];

    const results: Array<Record<string, unknown>> = [];
    const candidatesBySource: Array<{ sourceId: string; names: string[] }> = [];
    const pageErrors: string[] = [];

    for (const result of rawResults.slice(0, 8)) {
      const sourceUrl = safeUrl(String(result.url ?? ""), "https://ubc.go.ug");
      if (!sourceUrl) continue;

      let page = {
        title: cleanText(String(result.title ?? ""), 500),
        description: cleanText(String(result.description ?? ""), 2000),
        publishedAt: null as string | null,
        articleText: "",
        media: [] as Array<Record<string, string>>,
      };

      try {
        const response = await fetch(sourceUrl, {
          headers: {
            "User-Agent": "KalexiResearchBot/1.0 (+https://kalexibrokerage.com)",
            Accept: "text/html,application/xhtml+xml",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(12000),
        });
        const finalUrl = safeUrl(response.url, sourceUrl);
        const type = response.headers.get("content-type") ?? "";
        if (response.ok && finalUrl && type.includes("text/html")) {
          const html = (await response.text()).slice(0, 1500000);
          page = extractPage(html, finalUrl);
          page.title ||= cleanText(String(result.title ?? ""), 500);
          page.description ||= cleanText(String(result.description ?? ""), 2000);
        } else {
          pageErrors.push(`Could not extract full page: ${sourceUrl}`);
        }
      } catch {
        pageErrors.push(`Could not fetch page: ${sourceUrl}`);
      }

      const publishedAt = page.publishedAt && !Number.isNaN(Date.parse(page.publishedAt))
        ? new Date(page.publishedAt).toISOString()
        : null;

      const { data: saved, error: saveError } = await admin
        .from("research_external_sources")
        .upsert({
          source_url: sourceUrl,
          title: page.title || "Untitled UBC article",
          publisher: "Uganda Broadcasting Corporation",
          published_at: publishedAt,
          retrieved_at: new Date().toISOString(),
          article_text: page.articleText,
          description: page.description,
          media: page.media,
          search_query: query,
          created_by: authData.user.id,
        }, { onConflict: "source_url" })
        .select("id,source_url,title,publisher,published_at,retrieved_at,review_status,media,description,article_text")
        .single();

      if (saveError || !saved) {
        return reply({
          error: "Could not save UBC results. Check the migration and database configuration.",
          detail: saveError?.message,
        }, 500);
      }

      const fullText = `${saved.title} ${saved.description} ${saved.article_text}`;
      const names = extractEntityCandidates(fullText);

      if (names.length) {
        const entityRows = names.map((name) => ({
          source_id: saved.id,
          entity_name: name,
          entity_type: "person_or_organisation",
          evidence_context: fullText.includes(name) ? `Mention found in source text: ${name}` : "",
          extraction_method: "automated_candidate",
          review_status: "needs_review",
          created_by: authData.user.id,
        }));

        const { error: entityError } = await admin
          .from("research_external_entities")
          .upsert(entityRows, { onConflict: "source_id,entity_name", ignoreDuplicates: true });

        if (entityError) pageErrors.push(`Some entity candidates were not saved for ${sourceUrl}`);
      }

      candidatesBySource.push({ sourceId: saved.id, names });
      results.push({
        id: saved.id,
        title: saved.title,
        url: saved.source_url,
        publisher: saved.publisher,
        publishedAt: saved.published_at,
        retrievedAt: saved.retrieved_at,
        description: saved.description,
        articleText: saved.article_text,
        media: saved.media,
        entityCandidates: names,
        reviewStatus: saved.review_status,
        verificationStatus: "unverified",
      });
    }

    return reply({
      provider: "Brave Search",
      sourceDomain: "ubc.go.ug",
      query,
      searchedAt: new Date().toISOString(),
      resultCount: results.length,
      results,
      warnings: pageErrors,
      notice: "Extracted names are candidates, not verified identities. Reports are allegations or claims attributed to their sources, not proven facts.",
    });
  } catch (error) {
    return reply({
      error: "UBC research search failed.",
      detail: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});
