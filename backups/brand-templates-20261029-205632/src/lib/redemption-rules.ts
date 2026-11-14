export type RedemptionStatus = "requested" | "approved" | "paid" | "rejected";
export function canProcessRedemption(current: string, next: Exclude<RedemptionStatus, "requested">) {
  return current === "requested" && (next === "approved" || next === "rejected")
    || current === "approved" && (next === "paid" || next === "rejected");
}