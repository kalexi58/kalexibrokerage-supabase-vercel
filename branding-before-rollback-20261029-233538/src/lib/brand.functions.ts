import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const brandAppearanceInput = z.object({
  logoPath: z.string().max(300).nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

async function assertSuperAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error || !data) throw new Error("Super Admin authority is required.");
}

export const getCompanyBranding = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("company_branding")
    .select("logo_path, primary_color, accent_color")
    .eq("id", "default")
    .single();
  if (error) {
    console.error("[branding] Could not load public company branding.", error);
    throw new Error("Company branding could not be loaded.");
  }
  const logoUrl = data.logo_path
    ? supabaseAdmin.storage.from("company-branding").getPublicUrl(data.logo_path).data.publicUrl
    : null;
  return {
    logoPath: data.logo_path,
    logoUrl,
    primaryColor: data.primary_color,
    accentColor: data.accent_color,
  };
});

export const createBrandLogoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ extension: z.enum(["png", "jpg", "jpeg", "webp"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${context.userId}/${crypto.randomUUID()}.${data.extension}`;
    const { data: upload, error } = await supabaseAdmin.storage
      .from("company-branding")
      .createSignedUploadUrl(path);
    if (error || !upload) {
      console.error("[branding] Could not prepare company logo upload.", error);
      throw new Error("Could not prepare the company logo upload.");
    }
    return { path, token: upload.token };
  });

export const saveBrandAppearance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => brandAppearanceInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.logoPath && !data.logoPath.startsWith(`${context.userId}/`)) {
      throw new Error("The selected company logo is invalid.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: previous, error: readError } = await supabaseAdmin
      .from("company_branding")
      .select("*")
      .eq("id", "default")
      .single();
    if (readError) {
      console.error("[branding] Could not read current company branding.", readError);
      throw new Error("Company branding could not be saved.");
    }
    const { data: updated, error } = await supabaseAdmin
      .from("company_branding")
      .update({
        logo_path: data.logoPath,
        primary_color: data.primaryColor,
        accent_color: data.accentColor,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", "default")
      .select("logo_path, primary_color, accent_color")
      .single();
    if (error) {
      console.error("[branding] Could not save company branding.", error);
      throw new Error("Company branding could not be saved.");
    }
    const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      actor_email: (context.claims?.email as string | undefined) ?? null,
      action: "brand.appearance_updated",
      entity_type: "company_branding",
      entity_id: "default",
      previous_value: previous,
      new_value: updated,
    });
    if (auditError) {
      console.error("[branding] Appearance was saved, but the audit entry failed.", auditError);
      throw new Error("Appearance was saved, but its audit record could not be written.");
    }
    return {
      logoPath: updated.logo_path,
      logoUrl: updated.logo_path
        ? supabaseAdmin.storage.from("company-branding").getPublicUrl(updated.logo_path).data
            .publicUrl
        : null,
      primaryColor: updated.primary_color,
      accentColor: updated.accent_color,
    };
  });

export const createBrandSignatureUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ fileName: z.string().min(1).max(150) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_active_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Staff access required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `brand-signatures/${context.userId}/${crypto.randomUUID()}-${data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { data: upload, error } = await supabaseAdmin.storage.from("kalexi-vault").createSignedUploadUrl(path);
    if (error || !upload) throw new Error("Could not prepare signature upload.");
    return { path, token: upload.token };
  });

export const getBrandSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("brand_templates").select("signature_path").eq("id", data.id).single();
    if (error) throw new Error("Template not accessible.");
    if (!row.signature_path) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signingError } = await supabaseAdmin.storage.from("kalexi-vault").createSignedUrl(row.signature_path, 900);
    if (signingError) throw new Error("Could not load signature.");
    return signed?.signedUrl ?? null;
  });

/* Full Brand Control Center database persistence. */
const brandControlSettingsSchema = z.object({
  name: z.string().max(120),
  legalName: z.string().max(200),
  shortName: z.string().max(80),
  tagline: z.string().max(300),
  description: z.string().max(5000),
  vision: z.string().max(5000),
  mission: z.string().max(5000),
  values: z.string().max(5000),
  email: z.string().max(254),
  phone: z.string().max(80),
  website: z.string().max(500),
  address: z.string().max(1000),
  primary: z.string().max(40),
  secondary: z.string().max(40),
  accent: z.string().max(40),
  background: z.string().max(40),
  surface: z.string().max(40),
  text: z.string().max(40),
  muted: z.string().max(40),
  border: z.string().max(40),
  success: z.string().max(40),
  warning: z.string().max(40),
  danger: z.string().max(40),
  mode: z.string().max(30),
  logoLight: z.string().max(1500000),
  logoDark: z.string().max(1500000),
  icon: z.string().max(1500000),
  headingFont: z.string().max(150),
  bodyFont: z.string().max(150),
  radius: z.union([z.string().max(40), z.number().finite()]),
  density: z.string().max(40),
}).strict();

const brandControlInput = z.object({
  brandSettings: brandControlSettingsSchema,
});

function redactBrandImages(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy = { ...(value as Record<string, unknown>) };
  for (const key of ["logoLight", "logoDark", "icon"]) {
    if (typeof copy[key] === "string" && (copy[key] as string).startsWith("data:")) {
      copy[key] = "[image omitted from audit record]";
    }
  }
  return copy;
}

export const getBrandControlSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (table: string) => any;
    };

    const { data, error } = await db
      .from("company_branding")
      .select("brand_settings")
      .eq("id", "default")
      .single();

    if (error) {
      console.error("[branding] Failed to load brand settings.", error);
      throw new Error("Could not load brand settings from Supabase.");
    }

    const settings = data?.brand_settings;
    if (!settings || typeof settings !== "object" ||
        Array.isArray(settings) || Object.keys(settings).length === 0) {
      return { brandSettings: null };
    }

    const parsed = brandControlSettingsSchema.safeParse(settings);
    if (!parsed.success) {
      console.error("[branding] Stored settings failed validation.", parsed.error.flatten());
      throw new Error("Saved brand settings have an incompatible format. No settings were overwritten.");
    }

    return { brandSettings: parsed.data };
  });

export const saveBrandControlSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => brandControlInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (table: string) => any;
    };

    const { data: previous, error: readError } = await db
      .from("company_branding")
      .select("brand_settings")
      .eq("id", "default")
      .single();

    if (readError) {
      console.error("[branding] Failed to read settings before saving.", readError);
      throw new Error("Could not read the current brand settings.");
    }

    const settings = data.brandSettings;
    const { data: updated, error: updateError } = await db
      .from("company_branding")
      .update({
        brand_settings: settings,
        primary_color: settings.primary,
        accent_color: settings.accent,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", "default")
      .select("id")
      .single();

    if (updateError || !updated) {
      console.error("[branding] Failed to save settings.", updateError);
      throw new Error("Could not save brand settings to Supabase.");
    }

    const { error: auditError } = await db.from("audit_logs").insert({
      actor_id: context.userId,
      actor_email: (context.claims?.email as string | undefined) ?? null,
      action: "brand.control_center_updated",
      entity_type: "company_branding",
      entity_id: "default",
      previous_value: redactBrandImages(previous?.brand_settings ?? null),
      new_value: redactBrandImages(settings),
    });

    if (auditError) {
      console.error("[branding] Settings saved but audit logging failed.", auditError);
      throw new Error("Settings were saved, but the audit record failed. Verify the audit log.");
    }

    return { brandSettings: settings };
  });
