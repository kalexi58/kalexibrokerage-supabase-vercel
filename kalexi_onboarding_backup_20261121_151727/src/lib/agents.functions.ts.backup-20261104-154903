import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { approximateReward, agentPermissions, validAgent } from "@/lib/agent-rules";
import {
  expectedApplicationUpdatedAtSchema,
  updateAgentApplicationSchema,
} from "@/lib/agent-application-validation";
import {
  AGENT_ID_THEME_ID,
  parseAgentIdTheme,
  type AgentIdTheme,
} from "@/lib/agent-id-theme";

const BUCKET = "kalexi-vault";
const token = z.string().trim().min(10).max(200);

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function openCampaign(t: string) {
  const db = await admin();
  const { data, error } = await db
    .from("agent_campaigns")
    .select("id, title, active, expires_at")
    .eq("token", t)
    .maybeSingle();
  if (error) throw new Error("Could not verify this registration link.");
  let campaign = data;
  if (!campaign && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
    const legacy = await db
      .from("agent_campaigns")
      .select("id, title, active, expires_at")
      .eq("id", t)
      .maybeSingle();
    if (legacy.error) throw new Error("Could not verify this registration link.");
    campaign = legacy.data;
  }
  if (!campaign) return null;
  const expired = !!campaign.expires_at && new Date(campaign.expires_at) < new Date();
  return { ...campaign, open: campaign.active && !expired };
}

async function assertPerm(supabase: SupabaseClient<Database>, userId: string, perm: string) {
  const { data, error } = await supabase.rpc("has_permission", { _user_id: userId, _perm: perm });
  if (error) throw new Error("Could not verify Digital Agent Programme permissions.");
  if (!data) throw new Error("Forbidden: you do not have Digital Agent Programme authority.");
}

async function assertAnyPerm(
  supabase: SupabaseClient<Database>,
  userId: string,
  permissions: string[],
) {
  const checks = await Promise.all(
    permissions.map((permission) =>
      supabase.rpc("has_permission", { _user_id: userId, _perm: permission }),
    ),
  );
  if (checks.some(({ error }) => error))
    throw new Error("Could not verify Digital Agent Programme permissions.");
  if (!checks.some(({ data }) => data))
    throw new Error("Forbidden: you do not have Digital Agent Programme authority.");
}

async function audit(
  actorId: string | null,
  email: string | null,
  action: string,
  entityId: string,
  value?: unknown,
  entityType = "agent",
) {
  const db = await admin();
  const { error } = await db.from("audit_logs").insert({
    actor_id: actorId,
    actor_email: email,
    action,
    entity_type: entityType,
    entity_id: entityId,
    new_value: (value ?? null) as never,
  });
  if (error) throw new Error("The action could not be recorded in the audit log.");
}

export const listAgentCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPerm(context.supabase, context.userId, "agents.manage");
    const { data, error } = await (await admin())
      .from("agent_campaigns")
      .select("id, title, token, active, expires_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load registration links.");
    return data ?? [];
  });

export const listAgentApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAnyPerm(context.supabase, context.userId, ["agents.view", "agents.manage"]);
    const { data, error } = await (await admin())
      .from("agent_applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load agent applications.");
    return data ?? [];
  });

export const updateAgentApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateAgentApplicationSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertPerm(context.supabase, context.userId, "agents.manage");
    
    const db = await admin();
const { id, expectedUpdatedAt, ...fields } = data;
    const { data: current, error: currentError } = await db
      .from("agent_applications")
      .select("updated_at")
      .eq("id", id)
      .maybeSingle();
    if (currentError) {
      throw new Error(`Could not check the current application version: ${currentError.message}`);
    }
    if (!current) throw new Error("Application not found or unavailable to your account.");
    const actualUpdatedAt = expectedApplicationUpdatedAtSchema.safeParse(current.updated_at);
    if (!actualUpdatedAt.success) {
      console.error("[agents] Invalid application updated_at returned by Supabase.", {
        applicationId: id,
        updatedAt: current.updated_at,
      });
      throw new Error("The application timestamp is invalid. Refresh the application and retry.");
    }
    if (actualUpdatedAt.data !== expectedUpdatedAt) {
      throw new Error("This application changed while you were editing it. Refresh and retry.");
    }

    const { data: updated, error } = await db
      .from("agent_applications")
      .update(fields)
      .eq("id", id)
      .eq("updated_at", actualUpdatedAt.data)
      .select("id, updated_at")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        throw new Error("That ID number is already on an active agent application.");
      }
      throw new Error(`Could not update the application: ${error.message}`);
    }
    if (!updated) {
      throw new Error("This application changed while you were editing it. Refresh and retry.");
    }

    await audit(
      context.userId,
      (context.claims?.email as string) ?? null,
      "agent.application_details_updated",
      id,
      {
        changed_fields: Object.keys(fields),
        sensitive_values_omitted: true,
      },
      "agent_application",
    );
    return { ok: true, updatedAt: updated.updated_at };
  });

export const isDigitalAgentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const [{ data: agent, error: agentError }, { data: application, error: applicationError }] =
      await Promise.all([
        db.from("agents").select("id").eq("user_id", context.userId).limit(1).maybeSingle(),
        db
          .from("agent_applications")
          .select("id")
          .eq("user_id", context.userId)
          .limit(1)
          .maybeSingle(),
      ]);
    if (agentError || applicationError)
      throw new Error("Could not determine the correct workspace for this account.");
    return !!agent || !!application;
  });

export const canViewCompanyCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: hasPermission, error: permissionError } = await context.supabase.rpc(
      "has_permission",
      { _user_id: context.userId, _perm: "clients.view" },
    );
    if (permissionError) throw new Error("Could not verify company calendar access.");
    if (!hasPermission) return false;

    const db = await admin();
    const [{ data: agent, error: agentError }, { data: application, error: applicationError }] =
      await Promise.all([
        db
          .from("agents")
          .select("id,status,expires_at")
          .eq("user_id", context.userId)
          .maybeSingle(),
        db
          .from("agent_applications")
          .select("id")
          .eq("user_id", context.userId)
          .maybeSingle(),
      ]);
    if (agentError || applicationError)
      throw new Error("Could not verify company calendar access.");
    if (agent) {
      return agent.status === "active" && new Date(agent.expires_at).getTime() > Date.now();
    }
    return !application;
  });

export const getUpcomingAgentEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: agent, error: agentError } = await db
      .from("agents")
      .select("id, status, expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (agentError) throw new Error(`Could not verify the agent account: ${agentError.message}`);
    if (!agent || !validAgent(agent.status, agent.expires_at))
      throw new Error("An active agent account is required to view upcoming events.");

    const { data, error } = await db
      .from("calendar_events")
      .select("id, title, description, starts_at, ends_at, event_type, location, requirements")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(100);
    if (error) throw new Error(`Could not load upcoming agent events: ${error.message}`);
    return data ?? [];
  });

export const getAgentRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAnyPerm(context.supabase, context.userId, ["agents.view", "agents.manage"]);
    const { data: agent, error } = await (await admin())
      .from("agents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error("Could not load this agent ID card.");
    if (!agent) throw new Error("Agent record not found or unavailable to your account.");
    return agent;
  });

export const createAgentCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ title: z.string().trim().min(1).max(160) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPerm(context.supabase, context.userId, "agents.manage");
    const db = await admin();
    const { data: campaign, error } = await db
      .from("agent_campaigns")
      .insert({ title: data.title, created_by: context.userId })
      .select("id, title, token, active, expires_at, created_at")
      .single();
    if (error) throw new Error("Could not create the registration link.");
    await audit(
      context.userId,
      (context.claims?.email as string) ?? null,
      "agent.campaign_created",
      campaign.id,
      { title: campaign.title },
    );
    return campaign;
  });

export const setAgentCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPerm(context.supabase, context.userId, "agents.manage");
    const db = await admin();
    const { data: campaign, error } = await db
      .from("agent_campaigns")
      .update({ active: data.active })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Could not update the registration link.");
    if (!campaign) throw new Error("Registration link not found.");
    await audit(
      context.userId,
      (context.claims?.email as string) ?? null,
      data.active ? "agent.campaign_enabled" : "agent.campaign_disabled",
      data.id,
    );
    return { ok: true };
  });

export const getAgentCampaign = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ token }).parse(i))
  .handler(async ({ data }) => {
    const c = await openCampaign(data.token);
    return c ? { title: c.title, open: c.open } : null;
  });

export const createAgentUpload = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({
      token,
      fileName: z.string().trim().min(1).max(200),
      fileType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
      fileSize: z.number().int().positive().max(50 * 1024 * 1024),
      kind: z.enum(["photo", "idFront", "idBack"]),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const c = await openCampaign(data.token);
    if (!c?.open) throw new Error("This registration link is closed.");
    if (data.kind === "photo" && data.fileType === "application/pdf") {
      throw new Error("Passport photo must be JPG, PNG or WebP.");
    }
    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "application/pdf": "pdf",
    };
    const path = `agent-applications/${c.id}/${crypto.randomUUID()}.${extensions[data.fileType]}`;
    const { data: slot, error } = await (await admin()).storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !slot) throw new Error("Could not prepare the upload.");
    return { path, uploadToken: slot.token, bucket: BUCKET, contentType: data.fileType };
  });
const path = z.string().trim().min(3).max(400).startsWith("agent-applications/");

export const submitAgentApplication = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        token,
        fullName: z.string().trim().min(2).max(140),
        phone: z.string().trim().min(7).max(40),
        email: z.string().trim().email().max(255),
        dateOfBirth: z.string().trim().max(20).nullish(),
        gender: z.string().trim().max(30).nullish(),
        nationality: z.string().trim().max(80).nullish(),
        address: z.string().trim().max(300).nullish(),
        district: z.string().trim().max(100).nullish(),
        occupation: z.string().trim().max(120).nullish(),
        idType: z.string().trim().min(2).max(60),
        idNumber: z.string().trim().min(3).max(60),
        photoPath: path,
        idFrontPath: path,
        idBackPath: path.nullish(),
        paymentMethod: z.enum(["mobile_money", "bank"]),
        paymentProvider: z.string().trim().max(100).nullish(),
        paymentAccountName: z.string().trim().min(2).max(140),
        paymentAccountNumber: z.string().trim().min(4).max(60),
        password: z.string().min(8).max(72),
        registryId: z.string().uuid().nullish(),
        village: z.string().trim().max(100).nullish(),
        declarations: z.object({
          commissionPolicyVersion: z.literal("DAP-COMMISSION-2PCT-v1"),
          commissionRate: z.literal(2),
          accurate: z.literal(true),
          terms: z.literal(true),
          conduct: z.literal(true),
          consent: z.literal(true),
        }),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const c = await openCampaign(data.token);
    if (!c?.open) throw new Error("This registration link is closed.");
    const db = await admin();
    const { data: dup } = await db
      .from("agent_applications")
      .select("id")
      .eq("id_number", data.idNumber)
      .in("status", ["pending", "approved"])
      .maybeSingle();
    if (dup) throw new Error("An application with this ID number is already on record.");
    const { data: created, error: authErr } = await db.auth.admin.createUser({
      email: data.email.toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, job_title: "Digital Agent (pending)" },
    });
    if (authErr || !created.user)
      throw new Error(
        authErr?.message?.includes("already")
          ? "This email already has an account. Sign in instead."
          : "Could not create your sign-in.",
      );
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .update({
        job_title: "Digital Agent (pending)",
        department: "Digital Agent Programme",
        phone: data.phone,
      })
      .eq("id", created.user.id)
      .select("id")
      .maybeSingle();
    if (profileError || !profile) {
      await db.auth.admin.deleteUser(created.user.id);
      throw new Error("Your phone number could not be linked to your account. Please try again.");
    }
    const { data: row, error } = await db
      .from("agent_applications")
      .insert({
        campaign_id: c.id,
        full_name: data.fullName,
        phone: data.phone,
        email: data.email.toLowerCase(),
        date_of_birth: data.dateOfBirth || null,
        gender: data.gender ?? null,
        nationality: data.nationality ?? null,
        address: data.address ?? null,
        district: data.district ?? null,
        occupation: data.occupation ?? null,
        id_type: data.idType,
        id_number: data.idNumber,
        photo_path: data.photoPath,
        id_front_path: data.idFrontPath,
        id_back_path: data.idBackPath ?? null,
        payment_method: data.paymentMethod,
        payment_provider: data.paymentProvider ?? null,
        payment_account_name: data.paymentAccountName,
        payment_account_number: data.paymentAccountNumber,
        user_id: created.user.id,
        registry_id: data.registryId ?? null,
        village: data.village ?? null,
        declarations: { ...data.declarations, agreed_at: new Date().toISOString() } as never,
      })
      .select("id, application_ref")
      .single();
    if (error) {
      await db.auth.admin.deleteUser(created.user.id);
      throw new Error("Your application could not be recorded. Please try again.");
    }
    if (data.registryId)
      await db
        .from("agent_registry")
        .update({ linked_application_id: row.id, status: "linked" })
        .eq("id", data.registryId);
    await audit(null, data.email, "agent.application_submitted", row.id);
    return { reference: row.application_ref };
  });

export const reviewAgentApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "more_info"]),
        note: z.string().trim().max(1000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPerm(context.supabase, context.userId, "agents.manage");
    const db = await admin();
    const { data: app, error: appError } = await db
      .from("agent_applications")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (appError) throw new Error(`Could not load the application: ${appError.message}`);
    if (!app) throw new Error("Application not found.");
    if (data.decision === "rejected" && !data.note)
      throw new Error("A reason is required to reject.");

    if (app.status === "approved" && data.decision !== "approved")
      throw new Error("An approved application cannot be changed to another decision.");
    const wasApproved = app.status === "approved";

    if (data.decision !== "approved") {
      const { data: updated, error } = await db
        .from("agent_applications")
        .update({
          status: data.decision,
          review_note: data.note ?? null,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .eq("status", app.status)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Could not save the application decision: ${error.message}`);
      if (!updated)
        throw new Error("This application changed while you were reviewing it. Refresh the list.");
      await audit(
        context.userId,
        (context.claims?.email as string) ?? null,
        `agent.application_${data.decision}`,
        data.id,
        { note: data.note },
      );
      return { agentId: null };
    }

    if (!app.user_id)
      throw new Error("This applicant has no linked sign-in account. Resolve the account before approval.");

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("status, full_name, phone, department, job_title")
      .eq("id", app.user_id)
      .maybeSingle();
    if (profileError) throw new Error(`Could not verify the applicant account: ${profileError.message}`);
    if (!profile || profile.status !== "active")
      throw new Error("The applicant's sign-in profile is not active. Resolve account access before approval.");

    if (app.status !== "approved") {
      const { data: updated, error } = await db
        .from("agent_applications")
        .update({
          status: "approved",
          review_note: data.note ?? null,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .eq("status", app.status)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Could not approve the application: ${error.message}`);
      if (!updated) {
        const { data: latest, error: latestError } = await db
          .from("agent_applications")
          .select("status")
          .eq("id", data.id)
          .maybeSingle();
        if (latestError) throw new Error(`Could not verify the application status: ${latestError.message}`);
        if (latest?.status !== "approved")
          throw new Error("This application changed while you were reviewing it. Refresh the list.");
      }
    }

    const { data: existingAgent, error: agentReadError } = await db
      .from("agents")
      .select("id, user_id, status")
      .eq("application_id", app.id)
      .maybeSingle();
    if (agentReadError) throw new Error(`Could not check the official agent record: ${agentReadError.message}`);

    let agent = existingAgent;
    let createdAgent = false;
    let linkedAccount = false;
    if (!agent) {
      const { data: inserted, error } = await db
        .from("agents")
        .insert({
          application_id: app.id,
          commission_rate: 2,
          full_name: app.full_name,
          phone: app.phone,
          email: app.email,
          district: app.district,
          village: app.village,
          registry_id: app.registry_id,
          user_id: app.user_id,
          photo_path: app.photo_path,
          created_by: context.userId,
          status: "active",
        })
        .select("id, user_id, status")
        .maybeSingle();

      if (error || !inserted) {
        const { data: existing, error: retryError } = await db
          .from("agents")
          .select("id, user_id, status")
          .eq("application_id", app.id)
          .maybeSingle();
        if (retryError) throw new Error(`Could not verify the official agent record: ${retryError.message}`);
        if (!existing) throw new Error(`Could not create the official agent record: ${error?.message ?? "No record was returned."}`);
        agent = existing;
      } else {
        agent = inserted;
        createdAgent = true;
      }
    }

    if (agent.user_id && agent.user_id !== app.user_id)
      throw new Error("The official agent record is linked to a different sign-in account. Resolve it before approval.");
    if (agent.status !== "active")
      throw new Error("An official agent record already exists but is not active. Review its status before proceeding.");
    if (!agent.user_id) {
      const { data: linked, error } = await db
        .from("agents")
        .update({ user_id: app.user_id })
        .eq("id", agent.id)
        .is("user_id", null)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Could not link the agent sign-in account: ${error.message}`);
      if (!linked)
        throw new Error("The agent record changed while linking its account. Refresh and retry approval.");
      linkedAccount = true;
    }

    const profileNeedsUpdate =
      profile.full_name !== app.full_name ||
      profile.phone !== app.phone ||
      profile.department !== "Digital Agent Programme" ||
      profile.job_title !== "Digital Agent";
    if (profileNeedsUpdate) {
      const { data: updatedProfile, error } = await db
        .from("profiles")
        .update({
          full_name: app.full_name,
          phone: app.phone,
          department: "Digital Agent Programme",
          job_title: "Digital Agent",
        })
        .eq("id", app.user_id)
        .eq("status", "active")
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Could not update the agent sign-in profile: ${error.message}`);
      if (!updatedProfile)
        throw new Error("The applicant's sign-in profile changed during approval. Refresh and retry.");
    }

    if (!wasApproved || createdAgent || linkedAccount || profileNeedsUpdate) {
      await audit(
        context.userId,
        (context.claims?.email as string) ?? null,
        wasApproved ? "agent.application_approval_repaired" : "agent.application_approved",
        data.id,
        { note: data.note, agentId: agent.id },
      );
    }
    return { agentId: agent.id };
  });

export const setAgentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["active", "suspended", "revoked"]) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPerm(context.supabase, context.userId, "agents.manage");
    await (await admin()).from("agents").update({ status: data.status }).eq("id", data.id);
    await audit(
      context.userId,
      (context.claims?.email as string) ?? null,
      `agent.${data.status}`,
      data.id,
    );
    return { ok: true };
  });

export const signAgentFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ paths: z.array(path).max(10) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAnyPerm(context.supabase, context.userId, ["agents.view", "agents.manage"]);
    const db = await admin();
    const out: Record<string, string> = {};
    for (const p of data.paths) {
      const { data: s } = await db.storage.from(BUCKET).createSignedUrl(p, 900);
      if (s) out[p] = s.signedUrl;
    }
    return out;
  });

/** Public QR verification - returns only safe card details. */
export const verifyAgent = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ token: z.string().trim().min(10).max(80) }).parse(i))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: a } = await db
      .from("agents")
      .select(
        "full_name, agent_code, district, status, issued_at, expires_at, photo_path, referral_code, designation, application_id",
      )
      .eq("verification_token", data.token)
      .maybeSingle();
    if (!a) return null;
    let photoUrl: string | null = null;
    if (a.photo_path)
      photoUrl =
        (await db.storage.from(BUCKET).createSignedUrl(a.photo_path, 600)).data?.signedUrl ?? null;
    const expired = new Date(a.expires_at) < new Date();
    return {
      fullName: a.full_name,
      agentCode: a.agent_code,
      district: a.district,
      status: expired && a.status === "active" ? "expired" : a.status,
      issuedAt: a.issued_at,
      expiresAt: a.expires_at,
      photoUrl,
      referralCode: a.referral_code,
      designation: a.designation,
      registrationVerified: !!a.application_id,
      valid: validAgent(a.status, a.expires_at),
      permissions: agentPermissions(a.status, a.expires_at),
    };
  });

/** Public: look up a manually registered agent record while applying. */
export const matchAgentRegistry = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        token,
        regId: z.string().trim().max(60).nullish(),
        phone: z.string().trim().max(40).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const c = await openCampaign(data.token);
    if (!c?.open) return null;
    const db = await admin();
    const phone = (data.phone ?? "").replace(/\D/g, "");
    let q = db
      .from("agent_registry")
      .select("id, reg_id, full_name, phone, village, district")
      .is("linked_application_id", null);
    if (data.regId && data.regId.length >= 3) q = q.ilike("reg_id", data.regId);
    else if (phone.length >= 9) q = q.ilike("phone", `%${phone.slice(-9)}`);
    else return null;
    const { data: r } = await q.limit(1).maybeSingle();
    return r
      ? {
          id: r.id,
          regId: r.reg_id,
          fullName: r.full_name,
          phone: r.phone,
          village: r.village,
          district: r.district,
        }
      : null;
  });

/** Staff: issue sign-in details so an approved agent can reach their dashboard. */
export const createAgentLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        email: z.string().trim().email().max(255),
        password: z.string().min(8).max(72),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPerm(context.supabase, context.userId, "agents.manage");
    const db = await admin();
    const { data: ag } = await db
      .from("agents")
      .select("id, full_name, user_id, phone")
      .eq("id", data.agentId)
      .single();
    if (!ag) throw new Error("Agent not found.");
    let uid = ag.user_id;
    if (uid) {
      const { error } = await db.auth.admin.updateUserById(uid, {
        email: data.email,
        password: data.password,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await db.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: ag.full_name, job_title: "Digital Agent" },
      });
      if (error || !created.user)
        throw new Error(error?.message ?? "Could not create the sign-in.");
      uid = created.user.id;
      await db.from("agents").update({ user_id: uid, email: data.email }).eq("id", ag.id);
    }
    await db
      .from("profiles")
      .update({
        full_name: ag.full_name,
        email: data.email,
        job_title: "Digital Agent",
        department: "Digital Agent Programme",
        phone: ag.phone,
        status: "active",
      })
      .eq("id", uid);
    await audit(
      context.userId,
      (context.claims?.email as string) ?? null,
      "agent.login_issued",
      ag.id,
      { email: data.email },
    );
    return { ok: true };
  });

async function tokenState(db: any, agentId: string) {
  const [{ count }, { data: red }] = await Promise.all([
    db.from("clients").select("id", { count: "exact", head: true }).eq("agent_id", agentId),
    db.from("agent_redemptions").select("tokens_used, status").eq("agent_id", agentId),
  ]);
  const used = (red ?? [])
    .filter((r: any) => r.status !== "rejected")
    .reduce((n: number, r: any) => n + r.tokens_used, 0);
  const earned = count ?? 0;
  return {
    earned,
    available: Math.max(0, earned - used),
    canRedeem: earned - used > 0,
  };
}

/** Agent: own dashboard - never exposes other agents' identities. */
export const getAgentDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: me } = await db
      .from("agents")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (me && (me.status !== "active" || (me.expires_at && new Date(me.expires_at).getTime() <= Date.now()))) {
      throw new Error("Your agent account is not active. Contact Kalexi Brokerage Ltd.");
    }

    if (!me) {
      const { data: app } = await db
        .from("agent_applications")
        .select("application_ref, full_name, status, review_note, created_at, district")
        .eq("user_id", context.userId)
        .maybeSingle();
      return app ? { kind: "pending" as const, application: app } : null;
    }
    const [{ data: all }, { data: clients }, { data: notices }, { data: redemptions }] =
      await Promise.all([
        db.from("agents").select("id").eq("status", "active"),
        db
          .from("clients")
          .select("id, agent_id, client_ref, full_name, status, sector, created_at, updated_at")
          .not("agent_id", "is", null)
          .is("archived_at", null),
        db
          .from("agent_notices")
          .select("id, title, body, created_at")
          .order("created_at", { ascending: false })
          .limit(20),
        db
          .from("agent_redemptions")
          .select("id, amount, currency, status, created_at")
          .eq("agent_id", me.id)
          .order("created_at", { ascending: false }),
      ]);
    const counts = new Map<string, number>();
    for (const c of clients ?? []) {
      if (c.agent_id) counts.set(c.agent_id, (counts.get(c.agent_id) ?? 0) + 1);
    }
    const ids = (all ?? []).map((a) => a.id);
    if (!ids.includes(me.id)) ids.push(me.id);
    const sorted = ids.map((id) => counts.get(id) ?? 0).sort((a, b) => b - a);
    const mine = counts.get(me.id) ?? 0;
    const rank = sorted.indexOf(mine) + 1;
    const average = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const myClients = (clients ?? []).filter((c) => c.agent_id === me.id);
    const clientIds = myClients.map((client) => client.id);
    const [dealsResult, transactionsResult, communicationsResult, requirementsResult, tasksResult] =
      clientIds.length
        ? await Promise.all([
            db
              .from("deals")
              .select(
                "id, deal_ref, title, client_id, stage, status, value, currency, expected_close, closed_at, close_outcome, updated_at, created_at",
              )
              .in("client_id", clientIds)
              .is("archived_at", null)
              .order("updated_at", { ascending: false })
              .limit(1000),
            db
              .from("transactions")
              .select("id, transaction_ref, client_id, deal_id, amount, currency, status, occurred_on")
              .in("client_id", clientIds)
              .is("archived_at", null)
              .order("occurred_on", { ascending: false })
              .limit(1000),
            db
              .from("communications")
              .select("id, client_id, deal_id, channel, subject, occurred_at")
              .in("client_id", clientIds)
              .is("archived_at", null)
              .order("occurred_at", { ascending: false })
              .limit(1000),
            db
              .from("client_requirements")
              .select("id, client_id, requirement_ref, title, status, deadline, updated_at")
              .in("client_id", clientIds)
              .is("archived_at", null)
              .order("updated_at", { ascending: false })
              .limit(1000),
            db
              .from("tasks")
              .select("id, client_id, deal_id, title, due_date, status, updated_at")
              .in("client_id", clientIds)
              .is("archived_at", null)
              .order("updated_at", { ascending: false })
              .limit(1000),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ];
    const trackingError =
      dealsResult.error ??
      transactionsResult.error ??
      communicationsResult.error ??
      requirementsResult.error ??
      tasksResult.error;
    if (trackingError) {
      console.error("[agent dashboard] Could not load referred client activity.", trackingError);
      throw new Error("Client pipeline details could not be loaded.");
    }

    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const activityCutoff = today.getTime() - 30 * 24 * 60 * 60 * 1000;
    const trackingByClient = new Map(
      myClients.map((client) => {
        const clientDeals = (dealsResult.data ?? []).filter((deal) => deal.client_id === client.id);
        const clientTransactions = (transactionsResult.data ?? []).filter(
          (transaction) => transaction.client_id === client.id,
        );
        const clientCommunications = (communicationsResult.data ?? []).filter(
          (communication) => communication.client_id === client.id,
        );
        const clientRequirements = (requirementsResult.data ?? []).filter(
          (requirement) => requirement.client_id === client.id,
        );
        const clientTasks = (tasksResult.data ?? []).filter((task) => task.client_id === client.id);
        const overdueTasks = clientTasks.filter(
          (task) =>
            task.due_date &&
            task.due_date < todayKey &&
            !["completed", "complete", "done", "cancelled"].includes(task.status.toLowerCase()),
        );
        const activityDates = [
          client.updated_at,
          ...clientDeals.map((deal) => deal.updated_at),
          ...clientCommunications.map((communication) => communication.occurred_at),
          ...clientRequirements.map((requirement) => requirement.updated_at),
          ...clientTasks.map((task) => task.updated_at),
        ]
          .filter(Boolean)
          .map((date) => new Date(date).getTime())
          .filter(Number.isFinite);
        const lastActivityAt = activityDates.length
          ? new Date(Math.max(...activityDates)).toISOString()
          : client.created_at;
        const daysSinceActivity = Math.max(
          0,
          Math.floor((today.getTime() - new Date(lastActivityAt).getTime()) / 86_400_000),
        );
        const latestDeal = clientDeals[0] ?? null;
        const recentCommunicationCount = clientCommunications.filter(
          (communication) => new Date(communication.occurred_at).getTime() >= activityCutoff,
        ).length;
        const clearedTransactions = clientTransactions.filter(
          (transaction) => transaction.status.toLowerCase() === "cleared",
        );
        const pendingTransactions = clientTransactions.filter(
          (transaction) =>
            !["cleared", "rejected", "cancelled", "canceled", "failed", "void", "reversed"].includes(
              transaction.status.toLowerCase(),
            ),
        );
        const openTasks = clientTasks.filter(
          (task) =>
            !["completed", "complete", "done", "cancelled"].includes(task.status.toLowerCase()),
        );
        let stalledReason: string | null = null;
        if (overdueTasks.length) {
          stalledReason = `${overdueTasks.length} follow-up task${overdueTasks.length === 1 ? "" : "s"} overdue`;
        } else if (latestDeal && latestDeal.stage !== "closed" && daysSinceActivity >= 30) {
          stalledReason = "No recorded client or deal activity in over 30 days";
        } else if (latestDeal && latestDeal.stage !== "closed" && daysSinceActivity >= 14) {
          stalledReason = "No recorded client or deal activity in over 14 days";
        }

        return [
          client.id,
          {
            deals: clientDeals,
            latestDeal,
            requirements: clientRequirements,
            transactionCount: clientTransactions.length,
            clearedTransactionCount: clearedTransactions.length,
            pendingTransactionCount: pendingTransactions.length,
            recentCommunicationCount,
            lastActivityAt,
            daysSinceActivity,
            overdueTaskCount: overdueTasks.length,
            openTaskCount: openTasks.length,
            stalledReason,
          },
        ];
      }),
    );
    const months: { month: string; mine: number; average: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const inMonth = (clients ?? []).filter((c) => c.created_at.slice(0, 7) === key);
      months.push({
        month: d.toLocaleString("en", { month: "short" }),
        mine: inMonth.filter((c) => c.agent_id === me.id).length,
        average: Math.round((inMonth.length / Math.max(1, ids.length)) * 10) / 10,
      });
    }
    let photoUrl: string | null = null;
    if (me.photo_path)
      photoUrl =
        (await db.storage.from(BUCKET).createSignedUrl(me.photo_path, 900)).data?.signedUrl ?? null;
    const tokens = await tokenState(db, me.id);
    return {
      kind: "agent" as const,
      me: {
        ...me,
        photoUrl,
        signatureUrl: me.signature_path
          ? ((await db.storage.from(BUCKET).createSignedUrl(me.signature_path, 900)).data
              ?.signedUrl ?? null)
          : null,
      },
      clients: myClients.map((client) => ({
        ...client,
        tracking: trackingByClient.get(client.id),
      })),
      performance: {
        rank,
        totalAgents: ids.length,
        mine,
        average: Math.round(average * 10) / 10,
        topPercent: Math.max(1, Math.round((rank / ids.length) * 100)),
        months,
      },
      tokens: {
        available: tokens.available,
        earned: tokens.earned,
        canRedeem: tokens.canRedeem,
        approximateValue: approximateReward(tokens.available),
      },
      redemptions: redemptions ?? [],
      notices: notices ?? [],
    };
  });

type TokenRedemptionRpcClient = {
  rpc: (
    name: "request_agent_token_redemption",
    args: { _tokens: number },
  ) => PromiseLike<{ error: { message: string } | null }>;
};

type RedemptionStatusRpcClient = {
  rpc: (
    name: "set_agent_redemption_status",
    args: { _redemption_id: string; _next_status: "approved" | "paid" | "rejected" },
  ) => PromiseLike<{ error: { message: string } | null }>;
};

export const redeemAgentTokens = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ tokens: z.number().int().positive() }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const rewardsDb = context.supabase as unknown as TokenRedemptionRpcClient;
    const { error } = await rewardsDb.rpc("request_agent_token_redemption", {
      _tokens: data.tokens,
    });
    if (error) throw new Error(error.message);
    return { amount: data.tokens * 1000, tokens: data.tokens };
  });

type AgentCommissionPayoutStatsReader = {
  from: (table: "agent_commission_payouts") => {
    select: (columns: "amount,currency,status") => PromiseLike<{
      data: { amount: number; currency: string; status: string }[] | null;
      error: { message: string } | null;
    }>;
  };
};

export const getAgentImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPerm(context.supabase, context.userId, "agents.view");
    const db = context.supabase;
    const [a, c, d, t, r, commissionPayouts, total] = await Promise.all([
      db.from("agents").select("id, agent_code, full_name, status, user_id"),
      db.from("clients").select("id, agent_id, created_at").not("agent_id", "is", null),
      db.from("deals").select("id, client_id, status, stage, value, currency"),
      db.from("transactions").select("client_id, amount, currency, status"),
      db.from("agent_redemptions").select("amount, status, currency"),
      (db as unknown as AgentCommissionPayoutStatsReader)
        .from("agent_commission_payouts")
        .select("amount,currency,status"),
      db.from("clients").select("id", { count: "exact", head: true }),
    ]);
    for (const result of [a, c, d, t, r, commissionPayouts, total])
      if (result.error) throw new Error(result.error.message);
    const referred = c.data ?? [];
    const ids = new Set(referred.map((x) => x.id));
    const linkedDeals = (d.data ?? []).filter((x) => x.client_id && ids.has(x.client_id));
    const amounts: Record<string, number> = {};
    for (const x of t.data ?? [])
      if (
        x.client_id &&
        ids.has(x.client_id) &&
        !["archived", "cancelled", "void"].includes(x.status)
      )
        amounts[x.currency] = (amounts[x.currency] ?? 0) + Number(x.amount);
    const months = Array.from({ length: 6 }, (_, i) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - 5 + i);
      return {
        month: date.toLocaleString("en", { month: "short" }),
        referrals: referred.filter(
          (x) => x.created_at.slice(0, 7) === date.toISOString().slice(0, 7),
        ).length,
      };
    });
    return {
      agents: (a.data ?? [])
        .map((x) => ({
          ...x,
          referrals: referred.filter((y) => y.agent_id === x.id).length,
          deals: linkedDeals.filter((y) =>
            referred.some((z) => z.id === y.client_id && z.agent_id === x.id),
          ).length,
        }))
        .sort((x, y) => y.referrals - x.referrals),
      referrals: referred.length,
      share: total.count ? Math.round((referred.length / total.count) * 100) : 0,
      deals: linkedDeals.length,
      amounts,
      paidRewards: (r.data ?? [])
        .filter((x) => x.status === "paid" && x.currency === "UGX")
        .reduce((s, x) => s + Number(x.amount), 0) +
        (commissionPayouts.data ?? [])
          .filter((x) => x.status === "paid" && x.currency === "UGX")
          .reduce((s, x) => s + Number(x.amount), 0),
      months,
    };
  });

export const prepareAgentIdentityUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        kind: z.enum(["photo", "signature"]),
        name: z.string().min(1).max(150),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPerm(context.supabase, context.userId, "agents.manage");
    const p = `agent-applications/identity/${data.id}/${data.kind}-${crypto.randomUUID()}-${data.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { data: slot, error } = await (
      await admin()
    ).storage
      .from(BUCKET)
      .createSignedUploadUrl(p);
    if (error || !slot) throw new Error("Could not prepare image upload.");
    return { path: p, token: slot.token };
  });

export const prepareAgentIdThemeSignatureUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ contentType: z.enum(["image/jpeg", "image/png", "image/webp"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPerm(context.supabase, context.userId, "agents.manage");
    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[data.contentType];
    const objectPath = `brand-templates/agent-id/signature-${crypto.randomUUID()}.${extension}`;
    const { data: upload, error } = await (await admin())
      .storage.from(BUCKET)
      .createSignedUploadUrl(objectPath);
    if (error || !upload)
      throw new Error(
        `Could not prepare the authorised signature upload: ${error?.message ?? "No upload token returned."}`,
      );
    return { path: objectPath, token: upload.token, bucket: BUCKET };
  });

export const updateAgentIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        full_name: z.string().trim().min(2).max(140),
        phone: z.string().trim().min(7).max(40),
        district: z.string().max(100),
        village: z.string().max(100),
        designation: z.string().trim().min(2).max(80),
        agent_code: z.string().trim().min(4).max(60),
        referral_code: z.string().trim().min(4).max(20),
        issued_at: z.string().datetime(),
        expires_at: z.string().datetime(),
        company_phone: z.string().max(40),
        photo_path: path.nullish(),
        signature_path: path.nullish(),
      })
      .refine(
        (x) => new Date(x.expires_at) > new Date(x.issued_at),
        "Expiry must be after issue date.",
      )
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPerm(context.supabase, context.userId, "agents.manage");
    const { id, ...payload } = data;
    for (const p of [payload.photo_path, payload.signature_path])
      if (
        p?.startsWith("agent-applications/identity/") &&
        !p.startsWith(`agent-applications/identity/${id}/`)
      )
        throw new Error("Image belongs to another identity.");
    const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
    const { data: row, error } = await context.supabase
      .from("agents")
      .update({ ...clean, referral_code: payload.referral_code.toUpperCase() })
      .eq("id", id)
      .select("id, user_id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Agent not found.");
    if (row.user_id)
      await (
        await admin()
      )
        .from("profiles")
        .update({ full_name: payload.full_name, phone: payload.phone })
        .eq("id", row.user_id);
    await audit(
      context.userId,
      (context.claims?.email as string) ?? null,
      "agent.identity_updated",
      id,
      payload,
    );
    return { ok: true };
  });

export const saveAgentIdTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        accentText: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        widthMm: z.number().min(50).max(150).default(85.6),
        heightMm: z.number().min(30).max(100).default(53.98),
        radiusMm: z.number().min(0).max(10).default(2),
        showCorporateSeal: z.boolean().default(true),
        corporateSealText: z.string().trim().min(1).max(40).default("Kalexi Official"),
        ifFoundMessage: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .default("If found, return to Kalexi Brokerage Ltd."),
        authorizationMessage: z
          .string()
          .trim()
          .min(1)
          .max(160)
          .default("Authorised for client referrals only."),
        customFields: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(24),
              value: z.string().trim().min(1).max(48),
            }),
          )
          .max(4)
          .default([]),
        authorizedSignaturePath: z
          .string()
          .regex(/^brand-templates\/agent-id\/signature-[0-9a-f-]{36}\.(jpg|png|webp)$/i)
          .nullable()
          .default(null),
        fontFamily: z.enum([
          "Arial, sans-serif",
          "Georgia, serif",
          "'Trebuchet MS', sans-serif",
          "'Times New Roman', serif",
          "Verdana, sans-serif",
        ]).default("Arial, sans-serif"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPerm(context.supabase, context.userId, "agents.manage");
    const { authorizedSignaturePath, ...theme } = data;
    const { error } = await context.supabase.from("brand_templates").upsert(
      {
        id: AGENT_ID_THEME_ID,
        name: "Shared Agent ID Theme",
        kind: "agent_id_theme",
        heading: "Shared agent identification card colors",
        accent: data.accent,
        signature_path: authorizedSignaturePath,
        body: JSON.stringify(theme),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`Could not save the shared ID theme: ${error.message}`);
    await audit(
      context.userId,
      (context.claims?.email as string) ?? null,
      "agent.id_theme_updated",
      AGENT_ID_THEME_ID,
      data,
    );
    return { ok: true };
  });

export const getAgentIdTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const permissions = await Promise.all(
      ["agents.view", "agents.manage"].map((permission) =>
        context.supabase.rpc("has_permission", {
          _user_id: context.userId,
          _perm: permission,
        }),
      ),
    );
    if (permissions.some(({ error }) => error))
      throw new Error("Could not verify access to the agent ID card design.");
    const isStaff = permissions.some(({ data }) => data);

    const db = await admin();
    if (!isStaff) {
      const { data: agent, error } = await db
        .from("agents")
        .select("id, status, expires_at")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (error)
        throw new Error(`Could not verify access to the ID card design: ${error.message}`);
      if (!agent || !validAgent(agent.status, agent.expires_at))
        throw new Error("An active agent account or agent-management permission is required.");
    }

    const { data: saved, error } = await db
      .from("brand_templates")
      .select("accent, body, signature_path")
      .eq("id", AGENT_ID_THEME_ID)
      .maybeSingle();
    if (error) throw new Error(`Could not load the saved agent ID design: ${error.message}`);

    const theme: AgentIdTheme = {
      ...parseAgentIdTheme(saved?.body, saved?.accent, saved?.signature_path),
    };
    let authorizedSignatureUrl: string | null = null;
    if (theme.authorizedSignaturePath) {
      const { data: signed, error: signingError } = await db.storage
        .from(BUCKET)
        .createSignedUrl(theme.authorizedSignaturePath, 900);
      if (signingError || !signed)
        throw new Error(
          `Could not load the saved authorised signature: ${signingError?.message ?? "No signed URL returned."}`,
        );
      authorizedSignatureUrl = signed.signedUrl;
    }

    return {
      theme,
      authorizedSignatureUrl,
      signaturePath: isStaff ? theme.authorizedSignaturePath : null,
    };
  });

export const setRedemptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["approved", "paid", "rejected"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const rewardsDb = context.supabase as unknown as RedemptionStatusRpcClient;
    const { error } = await rewardsDb.rpc("set_agent_redemption_status", {
      _redemption_id: data.id,
      _next_status: data.status,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const code = z.string().trim().min(4).max(20);

/** Public: confirm a referral code belongs to an active agent. */
export const lookupReferral = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ code }).parse(i))
  .handler(async ({ data }) => {
    const { data: a } = await (
      await admin()
    )
      .from("agents")
      .select("id, full_name, status")
      .eq("referral_code", data.code.toUpperCase())
      .maybeSingle();
    if (!a || a.status !== "active") return null;
    return { agentId: a.id, agentName: a.full_name.split(" ")[0] };
  });

/** Public: a client registers themselves through an agent's referral link. */
export const registerReferredClient = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        code: code.nullish(),
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().min(6).max(30),
        email: z.string().trim().email().max(255).optional().or(z.literal("")),
        clientType: z.string().trim().min(2).max(40),
        sector: z.string().trim().min(2).max(60),
        requirement: z.string().trim().min(5).max(2000),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    let referringAgent: {
      id: string;
      status: string;
    } | null = null;
    if (data.code) {
      const { data: agent, error: agentError } = await db
        .from("agents")
        .select("id, status")
        .eq("referral_code", data.code.toUpperCase())
        .maybeSingle();
      if (agentError) throw new Error("Could not verify the referral code.");
      if (agent?.status === "active") referringAgent = agent;
    }
    const agentId = referringAgent?.id ?? null;
    const { data: dup } = await db
      .from("clients")
      .select("id")
      .eq("phone", data.phone)
      .maybeSingle();
    if (dup)
      throw new Error("This phone number is already registered with Kalexi. We'll be in touch.");
    const { data: row, error } = await db
      .from("clients")
      .insert({
        full_name: data.fullName,
        phone: data.phone,
        email: data.email || null,
        client_type: data.clientType,
        sector: data.sector,
        requirement: data.requirement,
        agent_id: agentId,
        referral_code: agentId ? (data.code?.toUpperCase() ?? null) : null,
      })
      .select("id, client_ref")
      .single();
    if (error) throw new Error("Registration could not be completed. Please try again.");
    if (!referringAgent) {
      await audit(
        null,
        data.email || null,
        "client.self_registered",
        row.id,
        { agent_id: null },
        "clients",
      );
    }
    return { reference: row.client_ref };
  });
