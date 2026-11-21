import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALL_ROLES, type AppRole } from "@/lib/rbac";

const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(40)
  .regex(/^[+0-9().\s-]+$/)
  .refine((value) => value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 20);

const loginIdentifierSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3)
    .max(255)
    .transform((value) => (value.includes("@") ? value.toLowerCase() : value))
    .refine(
      (value) =>
        value.includes("@")
          ? z.string().email().max(255).safeParse(value).success
          : phoneSchema.safeParse(value).success,
      "Enter a valid email address or phone number.",
    ),
});

export interface LoginIdentity {
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  photoUrl: string | null;
}

/**
 * Safe, non-sensitive identity card used by the login screen.
 * Returns null for unknown or disabled accounts (no account enumeration detail).
 */
export const lookupLoginIdentity = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginIdentifierSchema.parse(input))
  .handler(async ({ data }): Promise<LoginIdentity | null> => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env["SUPABASE_URL"];
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

    if (!supabaseUrl || !publishableKey) {
      throw new Error("Missing Supabase URL or publishable key.");
    }

    const supabaseLookup = createClient(supabaseUrl, publishableKey);
    const { data: rows, error } = await supabaseLookup.rpc("login_identity", {
      _email: data.identifier,
    });
    if (error) {
      console.error("[login_identity RPC error]", error.message, error.code);
      throw new Error("Unable to verify this account right now.");
    }
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    let photoUrl = row.photo_url as string | null;
    if (photoUrl && !/^https?:\/\//.test(photoUrl)) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin.storage
        .from("kalexi-avatars")
        .createSignedUrl(photoUrl, 600);
      photoUrl = signed?.signedUrl ?? null;
    }
    return {
      fullName: row.full_name,
      jobTitle: row.job_title,
      department: row.department,
      photoUrl,
    };
  });

export const signInWithPhone = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ phone: phoneSchema, password: z.string().min(1).max(256) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error: lookupError } = await supabaseAdmin.rpc("login_email_by_phone", {
      _phone: data.phone,
    });
    if (lookupError) {
      console.error("[phone sign-in lookup error]", lookupError.message, lookupError.code);
      throw new Error("Unable to sign in with that phone number right now.");
    }
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.email) throw new Error("Incorrect phone number or password.");

    const supabaseUrl = process.env["SUPABASE_URL"];
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!supabaseUrl || !publishableKey) {
      throw new Error("Missing Supabase URL or publishable key.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(supabaseUrl, publishableKey);
    const { data: auth, error } = await authClient.auth.signInWithPassword({
      email: row.email,
      password: data.password,
    });
    if (error || !auth.session) {
      if (error) console.error("[phone sign-in authentication error]", error.message, error.code);
      throw new Error("Incorrect phone number or password.");
    }
    return { session: auth.session };
  });

const passwordResetRequestSchema = z.object({
  identifier: loginIdentifierSchema.shape.identifier,
  redirectTo: z.string().url().refine((value) => {
    const url = new URL(value);
    return (
      url.pathname === "/reset-password" &&
      (url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  }),
});

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => passwordResetRequestSchema.parse(input))
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["SUPABASE_URL"];
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!supabaseUrl || !publishableKey) {
      throw new Error("Missing Supabase URL or publishable key.");
    }

    let email = data.identifier;
    if (!email.includes("@")) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows, error } = await supabaseAdmin.rpc("login_email_by_phone", {
        _phone: data.identifier,
      });
      if (error) {
        console.error("[phone password reset lookup error]", error.message, error.code);
        throw new Error("Unable to process the password reset request right now.");
      }
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row?.email) return { accepted: true };
      email = row.email;
    }

    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(supabaseUrl, publishableKey);
    const { error } = await authClient.auth.resetPasswordForEmail(email, {
      redirectTo: data.redirectTo,
    });
    if (error) {
      console.error("[password reset email error]", error.message, error.code);
      throw new Error("Unable to send a password reset link right now.");
    }
    return { accepted: true };
  });

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden: Super Admin authority required.");
}

async function writeAudit(
  actorId: string,
  actorEmail: string | undefined,
  action: string,
  entityType: string,
  entityId: string | null,
  newValue?: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    actor_email: actorEmail ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    new_value: (newValue ?? null) as never,
  });
  if (error) throw new Error(`The action succeeded, but its audit record could not be saved: ${error.message}`);
}

function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("") + "!7";
}

const roleEnum = z.enum(ALL_ROLES as [AppRole, ...AppRole[]]);

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        fullName: z.string().trim().min(2).max(120),
        department: z.string().trim().max(80).nullish(),
        jobTitle: z.string().trim().max(80).nullish(),
        phone: z.string().trim().max(40).nullish(),
        roles: z.array(roleEnum).min(1).max(9),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const password = temporaryPassword();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create the account.");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        department: data.department ?? null,
        job_title: data.jobTitle ?? null,
        phone: data.phone ?? null,
        must_change_password: true,
        status: "active",
      })
      .eq("id", created.user.id)
      .select("id")
      .maybeSingle();
    if (profileError || !profile) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error("Could not save the staff profile and phone number.");
    }

    await supabaseAdmin
      .from("user_roles")
      .insert(data.roles.map((role) => ({ user_id: created.user!.id, role })));

    await writeAudit(
      context.userId,
      context.claims?.email as string,
      "user.created",
      "user",
      created.user.id,
      {
        email: data.email,
        roles: data.roles,
      },
    );

    return { userId: created.user.id, temporaryPassword: password };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = temporaryPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.userId);
    await writeAudit(
      context.userId,
      context.claims?.email as string,
      "user.password_reset",
      "user",
      data.userId,
    );
    return { temporaryPassword: password };
  });

export const adminSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), status: z.enum(["active", "disabled"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot disable your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    if (data.status === "disabled") {
      await supabaseAdmin.auth.admin.signOut(data.userId).catch(() => undefined);
    }
    await writeAudit(
      context.userId,
      context.claims?.email as string,
      `user.${data.status}`,
      "user",
      data.userId,
    );
    return { ok: true };
  });

export const adminSetRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), roles: z.array(roleEnum).min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.userId === context.userId && !data.roles.includes("super_admin")) {
      throw new Error("You cannot remove your own Super Admin authority.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert(data.roles.map((role) => ({ user_id: data.userId, role })));
    if (error) throw new Error(error.message);
    await writeAudit(
      context.userId,
      context.claims?.email as string,
      "user.roles_changed",
      "user",
      data.userId,
      {
        roles: data.roles,
      },
    );
    return { ok: true };
  });

export const adminTerminateSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(data.userId);
    if (signOutError) {
      throw new Error("The account is disabled, but active sessions could not be terminated. Retry deletion.");
    }
    await writeAudit(
      context.userId,
      context.claims?.email as string,
      "user.sessions_terminated",
      "user",
      data.userId,
    );
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), confirmation: z.literal("DELETE") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) {
      throw new Error("You cannot delete your own account.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profile, error: profileError }, { data: targetRoles, error: rolesError }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, email, photo_url")
          .eq("id", data.userId)
          .maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
      ]);
    if (profileError) throw new Error("Could not verify the selected user's profile.");
    if (rolesError) throw new Error("Could not verify the selected user's access roles.");
    if (!profile) throw new Error("User profile not found.");

    if ((targetRoles ?? []).some((role) => role.role === "super_admin")) {
      const { count, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "super_admin");
      if (error) throw new Error("Could not verify the remaining Super Admin accounts.");
      if ((count ?? 0) <= 1) {
        throw new Error("The last Super Admin account cannot be deleted.");
      }
    }

    const tombstoneEmail = `deleted+${data.userId}@deleted.invalid`;
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: tombstoneEmail,
      password: temporaryPassword(),
      email_confirm: true,
      ban_duration: "876000h",
      user_metadata: { account_status: "deleted" },
    });
    if (authError) throw new Error(`Could not revoke the user's sign-in: ${authError.message}`);

    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: "Deleted user",
        email: tombstoneEmail,
        phone: null,
        department: null,
        job_title: null,
        photo_url: null,
        status: "disabled",
        must_change_password: true,
        last_login_at: null,
      })
      .eq("id", data.userId);
    if (profileUpdateError) {
      throw new Error("Sign-in was revoked, but the profile could not be anonymized. Retry the deletion.");
    }

    const { error: rolesDeleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (rolesDeleteError) {
      throw new Error("Sign-in was revoked, but the user's roles could not be removed.");
    }

    const { error: assignmentsDeleteError } = await supabaseAdmin
      .from("user_role_assignments")
      .delete()
      .eq("user_id", data.userId);
    if (assignmentsDeleteError) {
      throw new Error("Sign-in was revoked, but the user's assigned permissions could not be removed.");
    }

    if (profile.photo_url && !/^https?:\/\//i.test(profile.photo_url)) {
      const { error: photoError } = await supabaseAdmin.storage
        .from("kalexi-avatars")
        .remove([profile.photo_url]);
      if (photoError) {
        throw new Error("Sign-in was revoked, but the user's profile photo could not be removed.");
      }
    }

    await supabaseAdmin.auth.admin.signOut(data.userId);
    await writeAudit(
      context.userId,
      context.claims?.email as string,
      "user.access_deleted_and_profile_anonymized",
      "user",
      data.userId,
      { retainedBusinessAndAuditHistory: true },
    );
    return { ok: true };
  });

export const completePasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    await writeAudit(
      context.userId,
      context.claims?.email as string,
      "user.password_changed",
      "user",
      context.userId,
    );
    return { ok: true };
  });

export const recordSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("profiles")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", context.userId);
    await writeAudit(
      context.userId,
      context.claims?.email as string,
      "auth.login",
      "session",
      context.userId,
    );
    return { ok: true };
  });

/** Public, minimal document verification used by receipt/registration QR codes. */
export const verifyDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ reference: z.string().trim().min(6).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("clients")
      .select("client_ref, status, created_at, registered_by")
      .eq("verification_ref", data.reference)
      .maybeSingle();

    if (error) {
      console.error("[verifyDocument] Document lookup failed:", error);
      throw new Error("Document verification is temporarily unavailable.");
    }

    if (!row) return { valid: false as const };

    let officer = {
      fullName: "Not available",
      jobTitle: "Not available",
      department: "Not available",
    };

    if (row.registered_by) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("full_name, job_title, department, status")
        .eq("id", row.registered_by)
        .maybeSingle();

      if (profileError) {
        console.error("[verifyDocument] Officer lookup failed:", profileError);
      } else if (profile && profile.status === "active") {
        officer = {
          fullName: profile.full_name || "Not available",
          jobTitle: profile.job_title || "Not available",
          department: profile.department || "Not available",
        };
      }
    }

    return {
      valid: true as const,
      documentType: "Client Registration Acknowledgement",
      reference: row.client_ref,
      status: row.status,
      issuedAt: row.created_at,
      officer,
    };
  });