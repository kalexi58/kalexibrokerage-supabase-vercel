import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { createMiddleware } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderMaintenancePage } from "@/lib/maintenance-page";

export type MaintenanceRow = Database["public"]["Tables"]["system_maintenance"]["Row"];

export type MaintenanceState = Pick<
  MaintenanceRow,
  | "maintenance_enabled"
  | "maintenance_message"
  | "maintenance_start_time"
  | "estimated_completion_time"
  | "maintenance_updated_at"
  | "maintenance_updated_by"
>;

const MAINTENANCE_FUNCTIONS = new Set([
  "getMaintenanceAccess",
  "getMaintenanceStatus",
  "getMaintenanceSettings",
  "getMaintenanceHealth",
  "saveMaintenanceSettings",
]);

const MAINTENANCE_AUTH_FUNCTIONS = new Set(["lookupLoginIdentity", "signInWithPhone"]);

const MAINTENANCE_PUBLIC_FORM_FUNCTIONS = new Set(["getPublicForm"]);

const PROTECTED_APPLICATION_PATHS = [
  "/account",
  "/admin",
  "/agent-portal",
  "/agents",
  "/archive",
  "/brand",
  "/clients",
  "/dashboard",
  "/deals",
  "/documents",
  "/finance",
  "/forms",
  "/matches",
  "/media",
  "/objectives",
  "/opportunities",
  "/requirements",
  "/research",
  "/risk",
  "/verification",
];

export function isProtectedApplicationPath(pathname: string): boolean {
  return PROTECTED_APPLICATION_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function readMaintenanceState(
  db: SupabaseClient<Database>,
): Promise<MaintenanceState> {
  // This narrowly scoped SECURITY DEFINER RPC exposes only the global
  // maintenance banner state. It avoids requiring a service-role secret
  // for ordinary public requests and preserves fail-closed behavior.
  const rpcClient = db as unknown as {
    rpc: (name: string) => Promise<{ data: MaintenanceState[] | null; error: { message: string } | null }>;
  };
  const { data, error } = await rpcClient.rpc("get_public_maintenance_state");
  if (error) throw new Error(`Could not read maintenance configuration: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error("Could not read maintenance configuration: no global row returned.");
  return row;
}

export async function isSuperAdminRequest(request: Request): Promise<boolean> {
  const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return false;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return false;

    const { data: role, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    return !roleError && !!role;
  } catch (error) {
    console.error("[maintenance] Could not verify administrator access.", error);
    return false;
  }
}

function maintenanceFailureResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "System temporarily unavailable.",
      maintenance: true,
    }),
    {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

export function isMaintenanceAllowedFunction(meta: { filename: string; name: string } | undefined) {
  const filename = meta?.filename.replaceAll("\\", "/").split("?")[0];
  const sourceFile = filename?.split("/").at(-1);
  const functionName = meta?.name.replace(/_createServerFn_handler$/, "");
  return (
    (sourceFile === "maintenance.functions.ts" && MAINTENANCE_FUNCTIONS.has(functionName ?? "")) ||
    (sourceFile === "auth.functions.ts" && MAINTENANCE_AUTH_FUNCTIONS.has(functionName ?? "")) ||
    (sourceFile === "publicform.functions.ts" &&
      MAINTENANCE_PUBLIC_FORM_FUNCTIONS.has(functionName ?? ""))
  );
}

function getServerFunctionMeta(pathname: string): { filename: string; name: string } | undefined {
  const encodedId = pathname.split("/").at(-1);
  if (!encodedId) return undefined;

  try {
    const metadata: unknown = JSON.parse(Buffer.from(encodedId, "base64url").toString("utf8"));
    if (
      typeof metadata !== "object" ||
      metadata === null ||
      !("file" in metadata) ||
      typeof metadata.file !== "string" ||
      !("export" in metadata) ||
      typeof metadata.export !== "string"
    ) {
      return undefined;
    }
    return { filename: metadata.file, name: metadata.export };
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export function isMaintenanceAllowedServerFnPath(pathname: string): boolean {
  return isMaintenanceAllowedFunction(getServerFunctionMeta(pathname));
}

export const maintenanceRequestMiddleware = createMiddleware({ type: "request" }).server(
  async ({ request, pathname, handlerType, next }) => {
    if (
      pathname === "/" ||
      pathname === "/maintenance" ||
      pathname === "/favicon.png" ||
      pathname === "/robots.txt" ||
      pathname.startsWith("/assets/")
    ) {
      return next();
    }

    let state: MaintenanceState | null = null;
    let configurationAvailable = true;
    try {
      state = await readMaintenanceState(supabase);
    } catch (error) {
      configurationAvailable = false;
      console.error("[maintenance] Configuration could not be loaded.", error);
    }

    if (configurationAvailable && !state?.maintenance_enabled) return next();
    if (await isSuperAdminRequest(request)) return next();

    if (handlerType === "serverFn") {
      if (isMaintenanceAllowedServerFnPath(pathname)) return next();
      return maintenanceFailureResponse();
    }

    // Authenticated routes are client-rendered and run a server-verified role
    // check in their parent beforeLoad. Let only those app shells reach that
    // check; their data functions and direct Supabase access remain gated.
    if (configurationAvailable && isProtectedApplicationPath(pathname)) return next();

    const response = renderMaintenancePage({
      configurationAvailable,
      message: state?.maintenance_message ?? null,
      estimatedCompletionTime: state?.estimated_completion_time ?? null,
    });
    return new Response(response, {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
      },
    });
  },
);
