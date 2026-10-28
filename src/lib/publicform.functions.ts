import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BUCKET = "kalexi-vault";

export interface PublicFormField {
  key: string;
  label: string;
  type: "text" | "email" | "textarea" | "number" | "date" | "select" | "checkbox" | "signature";
  options?: string[];
  required?: boolean;
}

export interface PublicFormView {
  id: string;
  formRef: string;
  title: string;
  purpose: string | null;
  target: string;
  schema: PublicFormField[];
  allowMultiple: boolean;
  expired: boolean;
  closed: boolean;
}

const tokenSchema = z.string().trim().min(10).max(200);

async function loadForm(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("forms")
    .select(
      "id, form_ref, title, purpose, target, schema, status, expires_at, allow_multiple, client_id, submitted_at",
    )
    .eq("access_token", token)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error("This form link is not available.");
  if (!data) return null;
  return data;
}

/** Public read of a shared form via its secret link token. */
export const getPublicForm = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }): Promise<PublicFormView | null> => {
    const form = await loadForm(data.token);
    if (!form) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("forms")
      .update({
        opened_at: new Date().toISOString(),
        status: form.status === "created" ? "opened" : form.status,
      })
      .eq("id", form.id);

    const expired = form.expires_at ? new Date(form.expires_at) < new Date() : false;
    return {
      id: form.id,
      formRef: form.form_ref,
      title: form.title,
      purpose: form.purpose,
      target: form.target,
      schema: (form.schema as unknown as PublicFormField[]) ?? [],
      allowMultiple: form.allow_multiple,
      expired,
      closed:
        form.target === "broker"
          ? !!form.submitted_at
          : !form.allow_multiple && !!form.submitted_at,
    };
  });

/** Issues a one-time signed upload slot so a client can attach files to a form. */
export const createPublicFormUpload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tokenSchema,
        fileName: z.string().trim().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const form = await loadForm(data.token);
    if (!form) throw new Error("This form link is not available.");
    if (form.expires_at && new Date(form.expires_at) < new Date()) {
      throw new Error("This form link has expired.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safe = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const path = `form-uploads/${form.id}/${crypto.randomUUID()}-${safe}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Could not prepare the upload. Please try again.");
    return { path, signedUrl: signed.signedUrl, uploadToken: signed.token, bucket: BUCKET };
  });

/** Records a public submission, its answers and any attached documents, photos or videos. */
export const submitPublicForm = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tokenSchema,
        submittedByName: z.string().trim().max(140).nullish(),
        answers: z.record(z.string(), z.string().max(200_000)),
        attachments: z
          .array(
            z.object({
              path: z.string().trim().min(3).max(400),
              name: z.string().trim().min(1).max(200),
              mimeType: z.string().trim().max(160).nullish(),
              sizeBytes: z.number().int().nonnegative().max(1_073_741_824).nullish(),
              kind: z.enum(["image", "video", "file"]),
            }),
          )
          .max(20)
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const form = await loadForm(data.token);
    if (!form) throw new Error("This form link is not available.");
    if (form.expires_at && new Date(form.expires_at) < new Date()) {
      throw new Error("This form link has expired.");
    }
    if (!form.allow_multiple && form.submitted_at) {
      throw new Error("This form has already been submitted.");
    }

    const fields = (form.schema as unknown as PublicFormField[]) ?? [];
    const fieldKeys = new Set(fields.map((field) => field.key));
    if (Object.keys(data.answers).some((key) => !fieldKeys.has(key))) {
      throw new Error("The submitted answers do not match this form.");
    }
    for (const field of fields) {
      const answer = data.answers[field.key] ?? "";
      if (field.required && !answer.trim()) throw new Error(`${field.label} is required.`);
      if (field.type === "checkbox" && answer && answer !== "true") {
        throw new Error(`Invalid response for ${field.label}.`);
      }
      if (field.type === "email" && answer && !z.string().email().safeParse(answer).success) {
        throw new Error(`Enter a valid email address for ${field.label}.`);
      }
      if (field.type === "signature" && answer) {
        if (
          answer.length > 200_000 ||
          !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(answer)
        ) {
          throw new Error(`Invalid signature for ${field.label}.`);
        }
      } else if (field.type === "select" && answer && !field.options?.includes(answer)) {
        throw new Error(`Invalid selection for ${field.label}.`);
      } else if (field.type !== "signature" && answer.length > 5000) {
        throw new Error(`${field.label} is too long.`);
      }
    }

    if (
      form.target === "broker" &&
      (!form.purpose?.trim() ||
        !fields.some((field) => field.key === "full_name" && field.required) ||
        !fields.some(
          (field) => field.key === "email" && field.type === "email" && field.required,
        ) ||
        !fields.some((field) => field.type === "signature" && field.required) ||
        !fields.some((field) => field.type === "checkbox" && field.required))
    ) {
      throw new Error(
        "This broker agreement is missing its agreement text, required signature, or acceptance field.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signedAt = new Date().toISOString();
    if (form.target === "broker") {
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from("forms")
        .update({ submitted_at: signedAt, status: "submitted" })
        .eq("id", form.id)
        .is("submitted_at", null)
        .select("id")
        .maybeSingle();
      if (claimError)
        throw new Error("The agreement could not be locked for signing. Please try again.");
      if (!claimed) throw new Error("This broker agreement has already been signed.");
    }
    const { data: submission, error } = await supabaseAdmin
      .from("form_submissions")
      .insert({
        form_id: form.id,
        answers: data.answers as never,
        submitted_by_name: data.submittedByName ?? null,
        submitted_internally: false,
        client_id: form.client_id,
      })
      .select("id")
      .maybeSingle();
    if (error || !submission) {
      if (form.target === "broker") {
        const { error: rollbackError } = await supabaseAdmin
          .from("forms")
          .update({ submitted_at: null, status: form.status })
          .eq("id", form.id)
          .eq("submitted_at", signedAt);
        if (rollbackError) {
          console.error(
            "[public form] Could not release a broker agreement after a failed signature save.",
            rollbackError,
          );
        }
      }
      throw new Error("Your response could not be recorded. Please try again.");
    }

    for (const file of data.attachments) {
      if (file.kind === "file") {
        await supabaseAdmin.from("documents").insert({
          title: file.name,
          document_type: "client_submission",
          storage_path: file.path,
          mime_type: file.mimeType ?? null,
          size_bytes: file.sizeBytes ?? null,
          parent_type: "form_submission",
          parent_id: submission!.id,
        });
      } else {
        await supabaseAdmin.from("media").insert({
          caption: file.name,
          media_type: file.kind,
          storage_path: file.path,
          mime_type: file.mimeType ?? null,
          parent_type: "form_submission",
          parent_id: submission!.id,
        });
      }
    }

    await supabaseAdmin
      .from("forms")
      .update({ submitted_at: signedAt, status: "submitted" })
      .eq("id", form.id);

    await supabaseAdmin.from("audit_logs").insert({
      action: "form.submitted",
      entity_type: "form",
      entity_id: form.id,
      actor_email: null,
      new_value: {
        form_ref: form.form_ref,
        submitted_by: data.submittedByName ?? null,
        attachments: data.attachments.length,
      } as never,
    });

    return { formRef: form.form_ref };
  });
