import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function target(context: any, owner?: string, write = false) {
  const uid = owner ?? context.userId;
  if (uid !== context.userId) {
    const { data } = await context.supabase.rpc("has_permission", { _user_id: context.userId, _perm: write ? "agents.manage" : "agents.view" });
    if (!data) throw new Error("Agent messaging access required.");
  }
  const [a, b] = await Promise.all([context.supabase.from("agents").select("id").eq("user_id", uid).maybeSingle(), context.supabase.from("agent_applications").select("id").eq("user_id", uid).maybeSingle()]);
  if (!a.data && !b.data) throw new Error("Agent account not found.");
  return uid;
}
export const listAgentMessages = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ owner: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const uid = await target(context, data.owner);
    const { data: rows, error } = await context.supabase.from("agent_messages").select("*").eq("owner_user_id", uid).order("created_at").limit(200);
    if (error) throw error;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return Promise.all((rows ?? []).map(async r => ({ ...r, attachments: await Promise.all((r.attachments as { path: string; name: string; type: string }[]).map(async a => ({ ...a, url: (await supabaseAdmin.storage.from("kalexi-vault").createSignedUrl(a.path, 600)).data?.signedUrl ?? "" }))) })));
  });
export const createMessageUpload = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ owner: z.string().uuid().optional(), name: z.string().min(1).max(150) }).parse(i))
  .handler(async ({ data, context }) => {
    const uid = await target(context, data.owner, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `agent-messages/${uid}/${context.userId}/${crypto.randomUUID()}-${data.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { data: slot, error } = await supabaseAdmin.storage.from("kalexi-vault").createSignedUploadUrl(path);
    if (error || !slot) throw new Error("Could not prepare attachment.");
    return { path, token: slot.token };
  });
export const sendAgentMessage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ owner: z.string().uuid().optional(), body: z.string().trim().max(4000), attachments: z.array(z.object({ path: z.string().max(400), name: z.string().max(150), type: z.string().max(100) })).max(5) }).refine(x => !!x.body || x.attachments.length > 0, "Add a message or attachment.").parse(i))
  .handler(async ({ data, context }) => {
    const uid = await target(context, data.owner, true);
    if (data.attachments.some(a => !a.path.startsWith(`agent-messages/${uid}/${context.userId}/`) || a.path.includes(".."))) throw new Error("Invalid attachment.");
    const { error } = await context.supabase.from("agent_messages").insert({ owner_user_id: uid, sender_id: context.userId, body: data.body, attachments: data.attachments });
    if (error) throw new Error("Message could not be sent.");
    return { ok: true };
  });