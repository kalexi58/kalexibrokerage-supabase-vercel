-- Read-only public maintenance status for request middleware.
-- The function exposes only the single global maintenance row and no user data.
create or replace function public.get_public_maintenance_state()
returns table (
  maintenance_enabled boolean,
  maintenance_message text,
  maintenance_start_time timestamptz,
  estimated_completion_time timestamptz,
  maintenance_updated_at timestamptz,
  maintenance_updated_by uuid
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    m.maintenance_enabled,
    m.maintenance_message,
    m.maintenance_start_time,
    m.estimated_completion_time,
    m.maintenance_updated_at,
    m.maintenance_updated_by
  from public.system_maintenance m
  where m.id = 'global'
  limit 1;
$function$;

revoke all on function public.get_public_maintenance_state() from public;
grant execute on function public.get_public_maintenance_state() to anon, authenticated;
