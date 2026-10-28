import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { makeAccess, type AccessState, type AppRole } from "@/lib/rbac";

export interface StaffProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  department: string | null;
  job_title: string | null;
  photo_url: string | null;
  status: "active" | "disabled" | "pending";
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface SessionState {
  userId: string;
  email: string | null;
  profile: StaffProfile | null;
  roles: AppRole[];
  access: AccessState;
}

export async function fetchSession(): Promise<SessionState | null> {
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const user = userData.user;
  if (!user) return null;

  const [profileResult, rolesResult, permissionsResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.rpc("my_permissions"),
  ]);
  const requestError = profileResult.error ?? rolesResult.error ?? permissionsResult.error;
  if (requestError) throw requestError;

  const roleList = (rolesResult.data ?? []).map((role) => role.role as AppRole);
  const permissionList = ((permissionsResult.data ?? []) as { permission: string }[]).map(
    (permission) => permission.permission,
  );
  return {
    userId: user.id,
    email: user.email ?? null,
    profile: (profileResult.data as StaffProfile) ?? null,
    roles: roleList,
    access: makeAccess(roleList, permissionList),
  };
}

export function useSession() {
  const query = useQuery<SessionState | null>({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 30_000,
  });

  return query;
}

export function useAccess() {
  const { data } = useSession();
  return data?.access;
}

export function useRefreshSession() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["session"] });
}

export async function logAudit(input: {
  actorId: string;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  newValue?: unknown;
}) {
  await supabase.from("audit_logs").insert({
    actor_id: input.actorId,
    actor_email: input.actorEmail ?? null,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    new_value: (input.newValue ?? null) as never,
  });
}
