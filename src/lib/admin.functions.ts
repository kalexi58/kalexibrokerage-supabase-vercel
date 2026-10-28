import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden: Super Admin authority required.");
}

async function audit(
  actorId: string,
  actorEmail: string | undefined,
  action: string,
  entityType: string,
  entityId: string | null,
  newValue?: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    actor_email: actorEmail ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    new_value: (newValue ?? null) as never,
  });
}

const optionalText = z.string().trim().max(160).nullish();

/** Edit a staff identity: names, contact details, department, job title, photo. */
export const adminUpdateStaffIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        fullName: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(255),
        phone: optionalText,
        department: optionalText,
        jobTitle: optionalText,
        photoUrl: z.string().trim().max(500).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();

    if (current && current.email.toLowerCase() !== data.email.toLowerCase()) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        email: data.email,
        email_confirm: true,
      });
      if (authError) throw new Error(authError.message);
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        email: data.email,
        phone: data.phone ?? null,
        department: data.department ?? null,
        job_title: data.jobTitle ?? null,
        photo_url: data.photoUrl ?? null,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await audit(context.userId, context.claims?.email as string, "user.identity_updated", "user", data.userId, {
      full_name: data.fullName,
      email: data.email,
      job_title: data.jobTitle ?? null,
      department: data.department ?? null,
    });
    return { ok: true };
  });

/** Replace the granular permission set attached to a workspace role. */
export const adminSetRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        roleKey: z.string().trim().min(2).max(60),
        permissions: z.array(z.string().trim().min(3).max(60)).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.roleKey === "super_admin") {
      throw new Error("Super Admin authority is absolute and cannot be limited.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("role_permissions").delete().eq("role_key", data.roleKey);
    if (data.permissions.length) {
      const { error } = await supabaseAdmin
        .from("role_permissions")
        .insert(data.permissions.map((permission) => ({ role_key: data.roleKey, permission })));
      if (error) throw new Error(error.message);
    }

    await audit(context.userId, context.claims?.email as string, "role.permissions_updated", "role", data.roleKey, {
      permissions: data.permissions,
    });
    return { ok: true };
  });

/** Full permission map for the roles administration matrix. */
export const adminListRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("role_permissions").select("role_key, permission");
    if (error) throw new Error(error.message);
    const map: Record<string, string[]> = {};
    for (const row of data ?? []) {
      (map[row.role_key] ??= []).push(row.permission);
    }
    return map;
  });
