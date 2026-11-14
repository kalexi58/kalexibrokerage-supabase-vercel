create table if not exists public.intelligence_activity (
  id uuid primary key default gen_random_uuid(),
  task_type text not null default 'search',
  status text not null default 'completed'
    check (status in ('queued','running','completed','failed','needs_review')),
  title text not null,
  details text,
  source_name text,
  source_url text,
  items_found integer not null default 0,
  items_saved integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists intelligence_activity_created_at_idx
  on public.intelligence_activity(created_at desc);
create index if not exists intelligence_activity_status_idx
  on public.intelligence_activity(status);

alter table public.intelligence_activity enable row level security;

drop policy if exists "intelligence_activity_read" on public.intelligence_activity;
create policy "intelligence_activity_read"
on public.intelligence_activity for select to authenticated
using (
  public.has_permission(auth.uid(),'research.view')
  or public.has_permission(auth.uid(),'risk.view')
);

drop policy if exists "intelligence_activity_insert" on public.intelligence_activity;
create policy "intelligence_activity_insert"
on public.intelligence_activity for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    public.has_permission(auth.uid(),'research.create')
    or public.has_permission(auth.uid(),'research.edit')
    or public.has_permission(auth.uid(),'risk.view')
  )
);

drop policy if exists "intelligence_activity_update" on public.intelligence_activity;
create policy "intelligence_activity_update"
on public.intelligence_activity for update to authenticated
using (
  public.has_permission(auth.uid(),'research.edit')
  or public.has_permission(auth.uid(),'risk.view')
)
with check (
  public.has_permission(auth.uid(),'research.edit')
  or public.has_permission(auth.uid(),'risk.view')
);

grant select, insert, update on public.intelligence_activity to authenticated;
revoke all on public.intelligence_activity from anon;
