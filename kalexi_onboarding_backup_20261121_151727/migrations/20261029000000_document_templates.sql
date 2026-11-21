create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null unique,
  departments text[] not null default '{}',
  file_type text not null check (file_type in ('docx', 'pdf')),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.document_templates enable row level security;

drop policy if exists "template_select_assigned" on public.document_templates;
create policy "template_select_assigned"
on public.document_templates for select to authenticated
using (
  uploaded_by = auth.uid()
  or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super_admin')
  or coalesce(
    (auth.jwt() -> 'app_metadata' -> 'departments') ?| departments,
    false
  )
);

drop policy if exists "template_insert_owner" on public.document_templates;
create policy "template_insert_owner"
on public.document_templates for insert to authenticated
with check (uploaded_by = auth.uid());

drop policy if exists "template_update_owner" on public.document_templates;
create policy "template_update_owner"
on public.document_templates for update to authenticated
using (
  uploaded_by = auth.uid()
  or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super_admin')
)
with check (
  uploaded_by = auth.uid()
  or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super_admin')
);

drop policy if exists "template_delete_owner" on public.document_templates;
create policy "template_delete_owner"
on public.document_templates for delete to authenticated
using (
  uploaded_by = auth.uid()
  or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super_admin')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'document-templates',
  'document-templates',
  false,
  15728640,
  array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf'
  ]
)
on conflict (id) do update
set public = false, file_size_limit = 15728640;

drop policy if exists "template_storage_read_assigned" on storage.objects;
create policy "template_storage_read_assigned"
on storage.objects for select to authenticated
using (
  bucket_id = 'document-templates'
  and exists (
    select 1 from public.document_templates t
    where t.storage_path = storage.objects.name
      and (
        t.uploaded_by = auth.uid()
        or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super_admin')
        or coalesce(
          (auth.jwt() -> 'app_metadata' -> 'departments') ?| t.departments,
          false
        )
      )
  )
);

drop policy if exists "template_storage_upload_owner" on storage.objects;
create policy "template_storage_upload_owner"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'document-templates'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "template_storage_update_owner" on storage.objects;
create policy "template_storage_update_owner"
on storage.objects for update to authenticated
using (
  bucket_id = 'document-templates'
  and owner_id = auth.uid()::text
)
with check (
  bucket_id = 'document-templates'
  and owner_id = auth.uid()::text
);

drop policy if exists "template_storage_delete_owner" on storage.objects;
create policy "template_storage_delete_owner"
on storage.objects for delete to authenticated
using (
  bucket_id = 'document-templates'
  and (
    owner_id = auth.uid()::text
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super_admin')
  )
);
