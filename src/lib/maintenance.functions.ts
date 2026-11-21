import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { MAINTENANCE_ROW_ID, readMaintenanceState } from "@/lib/maintenance";

const settingsInput = z.object({
  maintenanceEnabled: z.boolean(),
  maintenanceMessage: z.string().trim().max(1000).nullish(),
  estimatedCompletionTime: z.string().datetime().nullish(),
});

async function assertSuperAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error || !data) throw new Error("Super Admin authority is required.");
}

export const getMaintenanceAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const state = await readMaintenanceState(context.supabase);
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("user_id", context.userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (error) throw new Error("Could not verify maintenance administrator access.");
    return { isSuperAdmin: !!data, maintenanceEnabled: state.maintenance_enabled };
  });

export const getMaintenanceStatus = createServerFn({ method: "GET" }).handler(async () => {
  const state = await readMaintenanceState(supabase);
  return {
    maintenanceEnabled: state.maintenance_enabled,
    maintenanceMessage: state.maintenance_message,
    estimatedCompletionTime: state.estimated_completion_time,
  };
});

export const getMaintenanceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [state, historyResult] = await Promise.all([
      readMaintenanceState(context.supabase),
      supabaseAdmin
        .from("audit_logs")
        .select("id, created_at, actor_email, action")
        .in("action", [
          "system.maintenance_enabled",
          "system.maintenance_disabled",
          "system.maintenance_settings_updated",
        ])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (historyResult.error) throw new Error("Could not load maintenance change history.");

    let updatedBy: { fullName: string; email: string } | null = null;

    if (state.maintenance_updated_by) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email")
        .eq("id", state.maintenance_updated_by)
        .maybeSingle();
      if (error) throw new Error("Could not load the last maintenance administrator.");
      if (data) updatedBy = { fullName: data.full_name, email: data.email };
    }

    return { ...state, updatedBy, history: historyResult.data ?? [] };
  });

export const getMaintenanceHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();

    try {
      await readMaintenanceState(context.supabase);

      return {
        application: "healthy" as const,
        version: getApplicationVersion(),
        database: "healthy" as const,
        checkedAt,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      console.error("[maintenance] Administrator health check failed.", error);
      return {
        application: "healthy" as const,
        version: getApplicationVersion(),
        database: "unavailable" as const,
        checkedAt,
        durationMs: Date.now() - startedAt,
      };
    }
  });

function getApplicationVersion(): string {
  return (
    process.env["APP_VERSION"] ??
    process.env["VERCEL_GIT_COMMIT_SHA"]?.slice(0, 7) ??
    process.env["GITHUB_SHA"]?.slice(0, 7) ??
    "Development build"
  );
}

export const saveMaintenanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await readMaintenanceState(context.supabase);
    const now = new Date().toISOString();
    const startedAt = data.maintenanceEnabled
      ? before.maintenance_enabled
        ? before.maintenance_start_time
        : now
      : before.maintenance_start_time;
    const { data: updated, error } = await supabaseAdmin
      .from("system_maintenance")
      .update({
        maintenance_enabled: data.maintenanceEnabled,
        maintenance_message: data.maintenanceMessage?.trim() || null,
        maintenance_start_time: startedAt,
        estimated_completion_time: data.estimatedCompletionTime ?? null,
        maintenance_updated_at: now,
        maintenance_updated_by: context.userId,
      })
      .eq("id", MAINTENANCE_ROW_ID)
      .select(
        "maintenance_enabled, maintenance_message, maintenance_start_time, estimated_completion_time, maintenance_updated_at, maintenance_updated_by",
      )
      .single();
    if (error) throw new Error(`Could not save maintenance settings: ${error.message}`);

    const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      actor_email: (context.claims?.email as string | undefined) ?? null,
      action:
        before.maintenance_enabled === updated.maintenance_enabled
          ? "system.maintenance_settings_updated"
          : data.maintenanceEnabled
            ? "system.maintenance_enabled"
            : "system.maintenance_disabled",
      entity_type: "system_maintenance",
      entity_id: MAINTENANCE_ROW_ID,
      previous_value: before as never,
      new_value: updated as never,
    });
    if (auditError) {
      console.error("[maintenance] Settings saved, but audit recording failed.", auditError);
      throw new Error("Settings were saved, but the audit entry failed. Contact support.");
    }

    return updated;
  });
