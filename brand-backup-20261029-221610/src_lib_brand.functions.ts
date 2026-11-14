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