import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type MediaItem = { url: string; type: string; alt?: string };
type ResearchResult = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  retrievedAt: string;
  description: string;
  articleText: string;
  media: MediaItem[];
  entityCandidates: string[];
  verificationStatus: string;
};
type SearchResponse = {
  results: ResearchResult[];
  resultCount: number;
  searchedAt: string;
  warnings?: string[];
  notice?: string;
};

export default function RioTimesResearchPanel() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function search() {
    const q = query.trim();
    if (q.length < 2) {
      setError("Enter a name, company or keyword with at least two characters.");
      return;
    }

    setLoading(true);
    setError("");
    setData(null);

    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke(
        "rio-times-research-search",
        { body: { query: q } },
      );
      if (invokeError) throw invokeError;
      if (!result || result.error) throw new Error(result?.error ?? "No response received.");
      setData(result as SearchResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "External search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          External source connector · The Rio Times
        </p>
        <h2 className="mt-2 text-2xl font-semibold">The Rio Times Research Search</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Search public The Rio Times articles and consolidate source-linked results with existing research.
        </p>
      </div>

      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Person, company, phone or keyword"
          maxLength={250}
          aria-label="Search The Rio Times articles"
        />
        <button
          className="rounded-md bg-primary px-5 py-2 font-medium text-primary-foreground disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          {loading ? "Searching The Rio Times..." : "Search The Rio Times"}
        </button>
      </form>

      {error && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">{error}</p>}

      {data && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {data.resultCount} result(s) · searched {new Date(data.searchedAt).toLocaleString()}
          </p>
          {data.notice && <p className="rounded-md bg-muted p-3 text-sm">{data.notice}</p>}

          {data.results.map((item) => (
            <article key={item.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-muted px-2 py-1">The Rio Times source</span>
                <span className="rounded-full bg-muted px-2 py-1">Unverified</span>
                <span className="text-muted-foreground">
                  Published: {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : "Not extracted"}
                </span>
              </div>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="text-sm">{item.description || "No description extracted."}</p>
              <a className="break-all text-sm underline" href={item.url} target="_blank" rel="noopener noreferrer">
                Open original article
              </a>

              {item.media?.length > 0 && (
                <div>
                  <h4 className="mb-2 font-medium">Extracted media references</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {item.media.map((media, i) => (
                      <div key={`${media.url}-${i}`} className="overflow-hidden rounded-md border p-2">
                        {media.type === "image" ? (
                          <a href={media.url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={media.url}
                              alt={media.alt || "Image from The Rio Times source"}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="max-h-64 w-full rounded object-contain"
                            />
                          </a>
                        ) : media.type === "video_embed" ? (
                          <a href={media.url} target="_blank" rel="noopener noreferrer" className="underline">
                            Open embedded video
                          </a>
                        ) : (
                          <a href={media.url} target="_blank" rel="noopener noreferrer" className="underline">
                            Open video
                          </a>
                        )}
                        <p className="mt-2 break-all text-xs text-muted-foreground">{media.url}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {item.entityCandidates?.length > 0 && (
                <div>
                  <h4 className="mb-2 font-medium">Possible names and organisations</h4>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Automatically extracted text candidates. Confirm identity and relevance before relying on them.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {item.entityCandidates.map((name) => (
                      <span key={name} className="rounded-md border px-2 py-1 text-sm">{name}</span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                className="text-sm underline"
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
              >
                {expanded === item.id ? "Hide extracted article text" : "View extracted article text"}
              </button>
              {expanded === item.id && (
                <div className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                  {item.articleText || "Full article text was not available. Use the original source link."}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Retrieved: {new Date(item.retrievedAt).toLocaleString()}
              </p>
            </article>
          ))}
          {data.resultCount === 0 && <p>No The Rio Times results found for this query.</p>}
          {data.warnings?.map((warning) => <p key={warning} className="text-xs text-muted-foreground">{warning}</p>)}
        </div>
      )}
    </section>
  );
}

