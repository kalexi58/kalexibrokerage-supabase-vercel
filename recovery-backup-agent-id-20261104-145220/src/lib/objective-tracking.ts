import type { Json } from "@/integrations/supabase/types";

export const OBJECTIVE_METRICS = {
  clients_created: { label: "New clients registered", unit: "clients" },
  properties_approved: { label: "Properties approved", unit: "properties" },
  deals_completed: { label: "Deals completed", unit: "deals" },
  cleared_brokerage_fees: { label: "Cleared brokerage fees", unit: "currency" },
  opportunities_created: { label: "Opportunities created", unit: "opportunities" },
  verifications_completed: { label: "Verifications completed", unit: "cases" },
} as const;

export type ObjectiveMetric = keyof typeof OBJECTIVE_METRICS;

export type ObjectiveKeyResult = {
  metric: ObjectiveMetric;
  target: number;
  current: number;
};

export type ObjectiveKeyResultDraft = {
  metric: ObjectiveMetric;
  target: string;
};

export function readObjectiveKeyResults(value: Json): ObjectiveKeyResult[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return [];
    const metric = item["metric"];
    const target = item["target"];
    const current = item["current"];
    if (
      typeof metric !== "string" ||
      !Object.prototype.hasOwnProperty.call(OBJECTIVE_METRICS, metric) ||
      typeof target !== "number" ||
      !Number.isFinite(target) ||
      target <= 0
    ) {
      return [];
    }

    return [{
      metric: metric as ObjectiveMetric,
      target,
      current: typeof current === "number" && Number.isFinite(current) ? current : 0,
    }];
  });
}

export function calculateObjectiveProgress(results: ObjectiveKeyResult[]): number | null {
  if (!results.length) return null;

  const total = results.reduce(
    (sum, result) => sum + Math.min(100, Math.max(0, (result.current / result.target) * 100)),
    0,
  );
  return Math.round(total / results.length);
}
