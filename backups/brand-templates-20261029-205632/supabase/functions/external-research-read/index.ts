import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function publicUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;

    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host === "::1" ||
      host.startsWith("127.") || host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === "169.254.169.254" || host === "0.0.0.0"
    ) return null;

    return url;
  } catch {
    return null;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
}

function metaContent(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return "";
}

function extractArticle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?? metaContent(html, "og:title")
    ?? "Untitled webpage";

  const publishedAt =
    metaContent(html, "article:published_time") ||
    metaContent(html, "date") ||
    metaContent(html, "datePublished") ||
    null;

  const description =
    metaContent(html, "description") ||
    metaContent(html, "og:description");

  const cleaned = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe|aside)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/article|\/section|\/h[1-6]|\/li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const content = decodeEntities(cleaned)
    .replace(/[\t\r ]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 30000);

  return {
    title: decodeEntities(title.replace(/<[^>]+>/g, "").trim()),
    published_at: publishedAt,
    description,
    content,
    content_length: content.length,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "POST required." }, 405);

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) {
      return reply({ error: "Sign in to read external findings." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return reply({ error: "Server configuration is incomplete." }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: auth, error: authError } = await userClient.auth.getUser(token);
    if (authError || !auth.user) {
      return reply({ error: "Invalid or expired session." }, 401);
    }

    const { data: permitted, error: permissionError } = await admin.rpc(
      "has_permission",
      { _user_id: auth.user.id, _perm: "research.view" }
    );

    if (permissionError || !permitted) {
      return reply({ error: "Research permission required." }, 403);
    }

    const body = await req.json();
    const url = publicUrl(String(body.url ?? ""));
    if (!url) return reply({ error: "A valid public HTTP(S) URL is required." }, 400);

    // Follow redirects manually so every destination is revalidated.
    let fetchUrl = url;
    let response: Response | undefined;
    const maxRedirects = 3;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      response = await fetch(fetchUrl, {
        redirect: "manual",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "KalexiBrokerageResearch/1.0",
        },
        signal: AbortSignal.timeout(12000),
      });

      const redirectStatus = [301, 302, 303, 307, 308].includes(response.status);

      if (!redirectStatus) break;

      const location = response.headers.get("location");
      if (!location) {
        await response.body?.cancel();
        throw new Error("Source returned a redirect without a Location header.");
      }

      if (hop === maxRedirects) {
        await response.body?.cancel();
        throw new Error("Source exceeded the maximum of 3 redirects.");
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(location, fetchUrl);
      } catch {
        await response.body?.cancel();
        throw new Error("Source returned an invalid redirect destination.");
      }

      const validatedUrl = publicUrl(nextUrl.href);
      await response.body?.cancel();

      if (!validatedUrl) {
        throw new Error("Source redirected to a disallowed or non-public URL.");
      }

      fetchUrl = validatedUrl;
    }

    if (!response) {
      throw new Error("Source request did not return a response.");
    }

    if (!response.ok) {
      return reply({ error: `Source returned HTTP ${response.status}.`, source_url: url.href }, 502);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") &&
        !contentType.includes("application/xhtml+xml")) {
      return reply({
        error: "This source is not an HTML webpage. PDF and other files need a dedicated reader.",
        source_url: url.href,
      }, 415);
    }

    const html = await response.text();
    if (html.length > 2000000) {
      return reply({ error: "The webpage is too large to process." }, 413);
    }

    const article = extractArticle(html);
    return reply({
      success: true,
      source_url: url.href,
      source_host: url.hostname,
      retrieved_at: new Date().toISOString(),
      verification_status: "needs_review",
      ...article,
      notice: "Extracted webpage text is unverified evidence, not proof of a claim.",
    });
  } catch (error) {
    return reply({
      error: error instanceof Error ? error.message : "Unable to retrieve the webpage.",
    }, 502);
  }
});

