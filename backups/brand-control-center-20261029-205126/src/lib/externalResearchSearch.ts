import { supabase } from "@/integrations/supabase/client";

export type ExternalResearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  published: string | null;
  sourceType: "external_web";
  verificationStatus: "unverified";
};

export type ExternalResearchResponse = {
  query: string;
  provider: string;
  searchedAt: string;
  resultCount: number;
  results: ExternalResearchResult[];
  notice: string;
};

export async function searchExternalResearch(
  query: string,
): Promise<ExternalResearchResponse> {
  const cleaned = query.trim();

  if (cleaned.length < 2) {
    throw new Error("Enter at least two search characters.");
  }

  const { data, error } = await supabase.functions.invoke(
    "external-research-search",
    { body: { q: cleaned } },
  );

  if (error) {
    throw new Error(error.message || "External research search failed.");
  }

  if (!data || !Array.isArray(data.results)) {
    throw new Error(data?.error || "Unexpected external search response.");
  }

  return data as ExternalResearchResponse;
}
