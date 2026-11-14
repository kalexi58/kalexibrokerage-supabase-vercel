# Kalexi Brokerage Database Audit and Upgrade Plan

**Audit date:** 24 October 2026
**Mode:** Read-only code/schema audit. No database operations or schema changes were made.

## 1. Executive summary

The repository's generated Supabase types and checked-in migrations both describe **46 public tables**. A static comparison found their table names match. This is the schema the application expects; it is not proof that production has these objects.

The live maintenance UI reported: `Could not find the table 'public.system_maintenance' in the schema cache`. This confirms the app's PostgREST API could not resolve the table at the time. It does **not** distinguish a physically missing table from a stale PostgREST schema cache. The maintenance migration exists locally, but its production application is unverified.

Live column definitions, actual table row counts, RLS policies, grants, triggers, Realtime publication membership, and applied migration history were not available through a database catalog/SQL connection in this audit. SQL Editor diagnostics to retrieve them are in Section 14. No production rows or personal data were read.

Agent registration expects the objects in `20261024000000_agent_registration_schema.sql`, including the `clients.agent_id` and `clients.referral_code` columns. Maintenance expects `20261022203000_system_maintenance.sql`. File existence does not mean either migration has been applied.

## 2. Scope and limitations

Reviewed the Supabase migration directory, `setup_all.sql`, Supabase config, generated `Database` types, auth/session, roles, agents, clients, deals, forms/signing, maintenance, documents, finance and dashboard data access. Checked live UI behavior for the maintenance table error and the sign-in lookup.

No linked Supabase CLI, `psql`, or direct SQL Editor access was available. Therefore:

- **Expected** means required or declared by local code, types, or migration SQL.
- **Live unknown** means catalog SQL is required.
- The maintenance schema-cache error is a verified API observation, not proof of physical absence.
- No migration was run, and no table or data was modified.

## 3. Database object inventory

### 3.1 Expected public tables (46)

| Domain | Expected table names |
|---|---|
| Auth and permissions | `profiles`, `user_roles`, `roles`, `role_permissions`, `user_role_assignments` |
| Clients and organizations | `clients`, `companies`, `contacts`, `client_requirements` |
| Agents | `agent_campaigns`, `agent_registry`, `agent_applications`, `agents`, `agent_redemptions`, `agent_notices`, `agent_messages` |
| Deals and pipeline | `opportunities`, `opportunity_matches`, `deals`, `deal_parties`, `offers`, `negotiations`, `tasks` |
| Forms | `forms`, `form_submissions` |
| Documents/media | `documents`, `document_versions`, `media` |
| Verification/risk/research | `verifications`, `verification_items`, `risk_cases`, `research_cases` |
| Finance | `transactions`, `receipts`, `invoices`, `commissions` |
| Goals/projects | `projects`, `objectives`, `objective_progress` |
| Operations/oversight | `notifications`, `communications`, `archive_records`, `audit_logs` |
| Maintenance/branding | `system_maintenance`, `company_branding`, `brand_templates` |

Expected public functions: `has_permission`, `has_role`, `is_active_staff`, `login_identity`, `login_email_by_phone`, `maintenance_access_allowed`, `my_permissions`. Expected private Supabase-managed objects include `auth.users` and storage buckets `kalexi-vault`, `kalexi-avatars`, and `company-branding`.

### 3.2 What is known about live state

| Object/state | Finding |
|---|---|
| `public.system_maintenance` | PostgREST schema cache did not resolve it. Physical table existence is unknown until `to_regclass()` is checked. |
| Other tables/columns | Unknown; not catalog-queried. |
| Live row counts/data | Unknown; no database rows were inspected. Section 14 provides count-only SQL. |
| Agent tables/client attribution columns | Unknown live; local migration exists. |
| Applied migration history | Unknown. |
| `company_branding` | Unknown live. Local migration is dated 25 October 2026, after this report date. |

## 4. Expected columns and schema comparison

The following full column-name inventory comes from `src/integrations/supabase/types.ts`. It is **not** a live database result. Use Section 14.2 for authoritative live types, defaults, nullability, and order.

```text
company_branding: id, logo_path, primary_color, accent_color, updated_at, updated_by
system_maintenance: id, maintenance_enabled, maintenance_message, maintenance_start_time, estimated_completion_time, maintenance_updated_at, maintenance_updated_by
agent_applications: id, application_ref, campaign_id, full_name, phone, email, date_of_birth, gender, nationality, address, district, village, occupation, id_type, id_number, photo_path, id_front_path, id_back_path, payment_method, payment_provider, payment_account_name, payment_account_number, declarations, registry_id, user_id, status, review_note, reviewed_by, reviewed_at, created_at, updated_at
agent_campaigns: id, title, token, active, expires_at, created_by, created_at, updated_at
agent_messages: id, owner_user_id, sender_id, body, attachments, created_at
agent_notices: id, title, body, created_by, created_at
agent_redemptions: id, agent_id, tokens_used, amount, currency, status, processed_by, processed_at, created_at
agent_registry: id, reg_id, full_name, phone, village, district, registered_on, received_by, signature_path, linked_application_id, status, created_by, created_at, updated_at
agents: id, agent_code, application_id, registry_id, full_name, phone, email, company_phone, district, village, designation, commission_rate, referral_code, verification_token, photo_path, signature_path, issued_at, expires_at, status, user_id, created_by, created_at, updated_at
archive_records: id, entity_type, entity_id, entity_ref, title, reason, previous_status, state, snapshot, original_created_by, original_created_at, created_by, archived_by, archived_at, restored_by, restored_at, restore_reason, created_at, updated_at
audit_logs: id, actor_id, actor_email, action, entity_type, entity_id, previous_value, new_value, metadata, created_at
brand_templates: id, name, kind, heading, body, doc_date, signatory_name, signatory_title, signature_path, accent, created_by, created_at, updated_at
client_requirements: id, requirement_ref, client_id, title, description, sector, specifications, location, budget_min, budget_max, currency, quantity, deadline, priority, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
clients: id, client_ref, full_name, phone, email, company_name, client_type, sector, requirement, branch, status, verification_ref, registered_by, created_at, updated_at, address, id_type, id_number, legal_name, kyc_status, kyc_details, archived_at, archived_by, archive_reason, agent_id, referral_code
commissions: id, deal_id, transaction_id, rate, amount, currency, beneficiary, narrative, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
communications: id, client_id, deal_id, channel, subject, body, occurred_at, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
companies: id, company_ref, client_id, name, registration_number, country, address, directors, representatives, beneficial_owners, notes, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
contacts: id, client_id, company_id, full_name, role, phone, email, notes, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
deal_parties: id, deal_id, client_id, company_id, name, contact, party_role, notes, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
deals: id, deal_ref, title, sector, client_id, opportunity_id, requirement_id, stage, status, value, currency, commission_rate, expected_close, closed_at, close_outcome, notes, created_by, assigned_to, created_at, updated_at, archived_at, archived_by, archive_reason
document_versions: id, document_id, version, storage_path, note, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
documents: id, document_ref, title, document_type, storage_path, mime_type, size_bytes, parent_type, parent_id, version, verification_status, confidential, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
form_submissions: id, form_id, answers, submitted_by_name, submitted_internally, client_id, review_note, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
forms: id, form_ref, title, purpose, schema, target, client_id, access_token, allow_multiple, expires_at, status, opened_at, submitted_at, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
invoices: id, invoice_ref, client_id, deal_id, amount, currency, due_date, narrative, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
media: id, media_ref, caption, media_type, storage_path, mime_type, parent_type, parent_id, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
negotiations: id, deal_id, entry_type, summary, detail, occurred_at, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
notifications: id, user_id, title, body, link, read_at, created_at
objective_progress: id, objective_id, progress, note, recorded_at, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
objectives: id, objective_ref, title, description, department, sector, responsible_id, project_id, start_date, target_date, completed_at, priority, status, progress, key_results, budget, currency, outcome, notes, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
offers: id, deal_id, amount, currency, offered_by, terms, offered_at, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
opportunities: id, opportunity_ref, title, opportunity_type, sector, sector_details, description, location, price, currency, quantity, availability, owner_name, owner_contact, requirements, source, status, verification_status, assigned_to, created_by, created_at, updated_at, archived_at, archived_by, archive_reason, notes
opportunity_matches: id, requirement_id, opportunity_id, score, reasons, status, reviewed_by, reviewed_at, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
profiles: id, email, full_name, phone, department, job_title, photo_url, status, must_change_password, last_login_at, created_at, updated_at
projects: id, project_ref, title, description, department, lead_id, start_date, target_date, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
receipts: id, receipt_ref, transaction_id, verification_ref, issued_to, amount, currency, narrative, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
research_cases: id, case_ref, client_id, deal_id, subject, related_party, research_question, keywords, sources, findings, notes, researcher_id, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
risk_cases: id, case_ref, case_kind, subject_name, subject_company, subject_phone, subject_email, subject_identifier, allegation, description, source, severity, status, verified_finding, resolution, client_id, deal_id, investigator_id, closed_at, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
role_permissions: role_key, permission, created_at
roles: key, label, description, is_system, created_at
tasks: id, title, detail, client_id, deal_id, assigned_to, due_date, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
transactions: id, transaction_ref, client_id, deal_id, amount, currency, payment_method, payment_reference, purpose, commission_amount, occurred_on, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
user_role_assignments: id, user_id, role_key, created_at
user_roles: id, user_id, role, created_at
verification_items: id, verification_id, label, requirement_note, state, comment, status, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
verifications: id, case_ref, case_kind, subject, summary, findings, sector, status, client_id, opportunity_id, deal_id, officer_id, decided_at, created_by, created_at, updated_at, archived_at, archived_by, archive_reason
```

### Key fields and relationships

| Object | Expected key fields and relationships |
|---|---|
| `clients` | `id uuid` PK; unique `client_ref`; required full name, phone, client type, sector, requirement; optional email/company/branch; `registered_by → auth.users`; `agent_id → agents`; `referral_code`; KYC/address/ID details. The referral columns are added by the agent migration. |
| `agent_campaigns` | UUID PK, unique token, title, active/expiry, creator. Public path: `/join/{token}`. |
| `agent_registry` | UUID PK, unique `reg_id`, identity/contact/location/signature fields, optional linked application. |
| `agent_applications` | UUID PK, unique generated application reference; campaign, registry, auth user, reviewer relations; identity documents, declarations, payment fields, status. Unique case-insensitive ID index for pending/approved applications. |
| `agents` | UUID PK; unique agent code/referral/verification token and unique application link; user/registry links; commission rate, status, issue/expiry, signature/photo. |
| `deals` | UUID PK, generated deal reference, required title/sector, optional client/opportunity/requirement FKs, stage/status/value/currency/commission and assignee fields. |
| `forms` / `form_submissions` | Form UUID/token/JSON schema and target; submissions link to form/client and store JSON answers. Broker agreement signature data is represented in a signature answer, not a dedicated column. |

Static comparison: 46 migration-declared table names and 46 generated type table names match. This does not verify column parity or live production.

## 5. Agent registration investigation

1. Authorized staff creates an `agent_campaigns` row and shares `/join/{token}`.
2. Public applicant checks campaign; optionally matches `agent_registry` by registration ID or normalized phone.
3. Server issues signed uploads for photo/ID files; client uploads to private `kalexi-vault`.
4. Server creates Auth user, updates `profiles`, inserts `agent_applications`, optionally links registry row, and logs audit.
5. Staff permission-gated review updates application; approval inserts `agents` row. Separate functions issue agent login and support referral/verification links.

**Evidence/findings**

- `src/lib/agents.functions.ts` supplies all these operations; `src/routes/join.$token.tsx` and `src/routes/_authenticated/agents.index.tsx` are the public/staff pages.
- The latest agent migration defines the app's expected agent tables, sequences, index and `clients` referral columns. Live availability remains unknown.
- RLS in that migration limits direct table use to authenticated staff with `agents.view`/`agents.manage` and owner reads; public registration executes through server handlers using the privileged server client. Do not expose its secret key.
- Required identity, signature, ID files, and payment-account data are sensitive. Verify bucket privacy and restrict signed URL generation to authorized staff.
- Confirmed partial-write risks: profile update and registry-link update results are ignored; the audit helper does not check insert failure; review status update is not checked before creating an agent. Auth user creation and application insert are separate transactions. Uploads can be orphaned after failed submission.
- Agent duplicate check is backed by a case-insensitive database index for `pending`/`approved`; actual live index status remains unknown.

## 6. Client registration investigation

- Internal registration in `src/routes/_authenticated/clients.new.tsx` validates full name, phone, client type, sector, requirement; optionally resolves referral code; inserts a client with `registered_by`; logs audit; then opens acknowledgement.
- Public referral registration in `src/routes/r.$code.tsx` calls `lookupReferral` and `registerReferredClient` from `agents.functions.ts`. Public server handler resolves active agent, checks exact phone duplicate, inserts `clients`, logs audit and returns reference.
- Base client migration requires full_name, phone, client_type, sector, requirement and defines a unique generated `client_ref`. It links `registered_by` to Auth and applies active-staff insert RLS.
- Referral insert adds `agent_id` and `referral_code`; these are required by current code and supplied by the later agent migration.
- No unique phone constraint is present in the reviewed base SQL; public duplicate check uses exact phone, so formatting variants/concurrent requests may duplicate. Internal duplicate search is advisory, not a constraint.
- Public referral uses service-role client, bypassing RLS; server validation, abuse/rate limits and write auditing must be maintained.
- Insert errors stop success navigation, but the shared audit helper ignores returned errors. The exact live cause of prior client insert failure is unknown without live schema/RLS query.

## 7. Maintenance investigation

- `maintenance.ts` reads the global row and expects: `id`, `maintenance_enabled`, `maintenance_message`, `maintenance_start_time`, `estimated_completion_time`, `maintenance_updated_at`, `maintenance_updated_by`.
- `maintenance.functions.ts` reads status/settings/health, updates the row, and writes audit. Migration `20261022203000_system_maintenance.sql` defines a checked `global` row, default row, RLS, service-role grant, `maintenance_access_allowed()` and broad restrictive policies on RLS tables/storage.
- Live UI reported PostgREST schema-cache “table not found.” Run `to_regclass` and information_schema queries before deciding to create/recreate anything.
- The maintenance migration's broad restrictive policies require a careful review for app access and admin recovery. Do not disable RLS as a workaround.
- Encoded TanStack login server-function requests are decoded by middleware allowlist logic; the UI was observed to recognize the requested account and advance to password prompt.

## 8. Security and data integrity

| Finding | Status | Required check/action |
|---|---|---|
| Public registration/form handlers use server-side service-role client | Confirmed from code | Keep key server-only; rate-limit/validate public operations and avoid broad public table grants. |
| Agent application contains identity docs and payment details | Confirmed expected schema | Verify RLS/storage policies and staff-only signed URLs. |
| Agent/profile/audit writes can partially fail without detection | Confirmed code behavior | Check every write, add transaction/reconciliation, and test failure rollback. |
| Client phone duplicate handling is exact-match pre-check | Confirmed | Inspect current duplicates; decide normalized rule before adding constraint. |
| Dashboard subscribes to clients/deals/transactions/agents/audit_logs | Confirmed | Migration files contain no publication-membership changes; live publication state unknown. Query before adding membership. |
| Form access tokens are bearer links | Confirmed | Keep tokens high entropy, enforce expiry/revocation, prevent log/analytics leakage; restrict submissions review. |
| Service-role key is absent from reviewed browser Supabase client | Confirmed in source, not deployment bundle | Verify deployment environment and bundle; never expose secret key. |
| Live grants, RLS, policies, and role assignments | Unknown | Run Section 14 before release. |

## 9. Change register (proposals only)

| ID | Object/category | Proposed change and reason | Data/security/dependencies | Priority / confidence |
|---|---|---|---|---|
| DB-01 | Maintenance table/cache/policies | First determine physical table vs stale PostgREST cache; reconcile existing maintenance migration only if absent. Needed by maintenance feature. | Policy migration is broad; inspect all current policies and ensure Super Admin recovery. No row deletion. | Critical / API failure confirmed, physical cause unknown |
| DB-02 | Agent schema | Compare live schema to `20261024000000_agent_registration_schema.sql`; apply only missing compatible objects after reviewing migration history. | Adds agent tables, sequences, indexes, client columns, policies; preserve existing rows. | High / requirement confirmed, live state unknown |
| DB-03 | Client attribution | Verify `clients.agent_id` FK and `referral_code`; add only if absent. | Nullable attribution fields should not alter current rows; ensure FK and client RLS. | High / code requirement confirmed |
| DB-04 | Client duplicate policy | Query normalized-phone duplicates; decide dedupe/unique-index strategy only after data review. | Existing rows may conflict; do not auto-delete/merge. | Medium / risk confirmed, duplicates unknown |
| DB-05 | Agent partial writes | Check/transactionalize profile, application, registry, approval, audit writes. | App code changes may be preferable to DDL; ensure Auth and data consistency. | High / confirmed code risk |
| DB-06 | Public registration protection | Review service-role public handlers, rate limits, validation, duplicate strategy and audit. | Keep RLS; do not grant public direct writes. | High / confirmed pathway |
| DB-07 | Identity document storage | Verify private bucket, allowed MIME/size, signed upload/read policies and orphan cleanup. | Sensitive existing objects; never switch bucket public. | Critical / sensitivity confirmed, live policy unknown |
| DB-08 | Realtime | Verify publication membership for dashboard tables and add only required tables if absent. | No row change; adds change-stream exposure/load; RLS still applies. | Medium / usage confirmed, membership unknown |
| DB-09 | Types | Regenerate generated Supabase types after live schema is reconciled. | Type-only; follows DB changes. | Medium / required after verification |
| DB-10 | Company branding | Confirm migration status and intended date before applying. | Includes branding table/logo bucket policy; logo read is public in migration. | Low / live state unknown |
| DB-11 | Broker agreement signing | Existing `forms.target` and JSON schema/answers support broker link/signature; no extra database column indicated. Ensure single-use submit and review access. | No DDL expected; limit signature payload and protect submissions. | Medium / design supported by app |
| DB-12 | Migration history | Read `supabase_migrations.schema_migrations` and reconcile before any deployment. | Prerequisite, no data change. | Critical / live history unknown |

## 10. Proposed migration order

1. Run all Section 14 read-only catalog, row-count, policy and migration-history diagnostics.
2. Compare live definitions to the local migrations; resolve maintenance table/cache first.
3. Back up database and inspect existing duplicate/orphan records before constraints.
4. Apply only missing base objects; do not replay `setup_all.sql` over production.
5. Reconcile maintenance migration after reviewing its restrictive RLS policies and recovery access.
6. Reconcile agent tables/client columns after confirming referenced Auth/client/permission objects.
7. Review grants, RLS, storage rules and helper functions after tables exist.
8. Check Realtime membership and add only needed publication entries.
9. Regenerate types and run staging acceptance tests.

Maintenance and agent schema changes should remain independently reviewable: maintenance affects RLS broadly; agent schema creates protected tables and depends on existing permission functions. Do not apply future-dated branding change without release confirmation.

## 11. Acceptance tests and rollback

Required future tests:

- Agent signup persists Auth/profile/application; file uploads are private; duplicates fail; authorized review and approval are consistent.
- Client internal/public referral registrations persist; duplicate phone policy is tested; invalid inputs show errors.
- Deal creation links only valid client/opportunity/requirement records.
- Broker agreement link displays text, requires acceptance and signature, records once, and is staff-only to review.
- Unauthorized users cannot read or modify protected data; super admins can reach maintenance controls during maintenance.
- Dashboard Realtime fires for intended tables only.
- Existing records remain intact and related modules continue to work.

Before production changes, take/verify backup and save catalog/count/migration outputs. Prefer forward fixes over destructive rollback. Do not drop data or resolve duplicates automatically. Preserve old policies and prove administrator recovery before deployment.

## 12. Outstanding questions

1. Does `public.system_maintenance` exist physically, or is only PostgREST cache stale?
2. Which migrations are recorded as applied in the live project?
3. What are live definitions and row counts for all 46 tables?
4. Are agent tables and client referral columns present, with the expected types/FKs/indexes?
5. Are `kalexi-vault` and its policies configured privately for agent/application uploads?
6. Are dashboard tables members of `supabase_realtime`?
7. Do client duplicate IDs/phones or orphaned FKs exist?
8. Should the future-dated company branding migration be part of this deployment?
9. What roles may inspect agent IDs/payment data and broker agreement submissions?

## 13. Recommended next steps

Run Section 14 in the Supabase SQL Editor and save the outputs. First review object existence, columns, constraints, policies, grants, row counts, and migration history; then approve specific change-register entries. Do not run a migration until the live results establish what is missing.

## 14. Read-only diagnostic SQL

Run individually. These queries inspect catalog or count rows only; they do not modify schema or records. Exact table counts can take time.

### Tables/views and approximate rows

```sql
SELECT n.nspname AS schema_name, c.relname AS object_name,
       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned table'
         WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' END AS object_type,
       c.reltuples::bigint AS estimated_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
ORDER BY object_type, object_name;
```

### Actual column names, types, nullability and defaults

```sql
SELECT table_schema, table_name, ordinal_position, column_name, data_type,
       udt_schema, udt_name, is_nullable, column_default,
       character_maximum_length, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

### Maintenance table existence/name

```sql
SELECT to_regclass('public.system_maintenance') AS public_table,
       to_regclass('system_maintenance') AS search_path_resolution;

SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_name ILIKE '%maintenance%'
ORDER BY table_schema, table_name;
```

### Constraints and foreign keys

```sql
SELECT ns.nspname AS schema_name, rel.relname AS table_name, con.conname,
       CASE con.contype WHEN 'p' THEN 'primary key' WHEN 'f' THEN 'foreign key'
         WHEN 'u' THEN 'unique' WHEN 'c' THEN 'check' WHEN 'x' THEN 'exclusion' END AS kind,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public'
ORDER BY rel.relname, con.contype, con.conname;
```

### Indexes

```sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### RLS state and policies

```sql
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
ORDER BY c.relname;
```

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd,
       qual AS using_expression, with_check
FROM pg_policies WHERE schemaname IN ('public','storage')
ORDER BY schemaname, tablename, policyname;
```

### Grants, functions and triggers

```sql
SELECT table_schema, table_name, grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema IN ('public','storage')
ORDER BY table_schema, table_name, grantee, privilege_type;
```

```sql
SELECT n.nspname AS schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS result_type,
       p.prosecdef AS security_definer, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' ORDER BY p.proname, arguments;
```

```sql
SELECT event_object_schema, event_object_table, trigger_name,
       event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_schema IN ('public','storage')
ORDER BY event_object_schema, event_object_table, trigger_name;
```

### Realtime membership

```sql
SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY schemaname, tablename;
```

Dashboard subscriptions use `clients`, `deals`, `transactions`, `agents`, and `audit_logs`.

### Migration history

```sql
SELECT table_schema, table_name FROM information_schema.tables
WHERE table_schema = 'supabase_migrations' ORDER BY table_name;
```

If present:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

### Exact row counts for every public table

This runs a count per table and may be slow on large tables; it returns counts only, not row contents.

```sql
SELECT c.relname AS table_name,
       (xpath('/table/row/row_count/text()',
         query_to_xml(format('SELECT count(*) AS row_count FROM %I.%I',
                             n.nspname, c.relname), false, true, '')
       ))[1]::text::bigint AS exact_rows
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
ORDER BY c.relname;
```

Status-only counts (run only after confirming the tables exist):

```sql
SELECT 'clients' AS table_name, status, count(*) AS rows FROM public.clients GROUP BY status
UNION ALL SELECT 'agents', status, count(*) FROM public.agents GROUP BY status
UNION ALL SELECT 'agent_applications', status, count(*) FROM public.agent_applications GROUP BY status
UNION ALL SELECT 'deals', status, count(*) FROM public.deals GROUP BY status
UNION ALL SELECT 'forms', status, count(*) FROM public.forms GROUP BY status
ORDER BY table_name, status;
```

## 15. Evidence references

- `src/integrations/supabase/types.ts`: 46 table columns, function signatures, relationships, enums.
- `supabase/migrations/20260810183553_0adf00fa-e8a8-42a4-856b-276772fac36f.sql`: base profiles, roles, clients, audit, client RLS and auth bootstrap.
- `supabase/migrations/20260811070002_342b9224-48fc-4f99-85d6-5813b0f1b401.sql`: core brokerage tables, forms, finance, RLS, triggers and indexes.
- `supabase/migrations/20261022190000_agent_phone_signin.sql`: phone sign-in lookup functions.
- `supabase/migrations/20261022203000_system_maintenance.sql`: maintenance table, default row, function and restrictive policies.
- `supabase/migrations/20261024000000_agent_registration_schema.sql`: agent tables/sequences/indexes, client attribution columns, policies and storage insert policy.
- `supabase/migrations/20261025000000_company_branding.sql`: branding table/bucket policy; dated after this audit.
- `supabase/setup_all.sql`: combined fresh-install SQL; not a production replay plan.
- `src/lib/agents.functions.ts`, `src/routes/join.$token.tsx`, `src/routes/_authenticated/agents.index.tsx`: agent registration and staff review.
- `src/routes/_authenticated/clients.new.tsx`, `src/routes/r.$code.tsx`: staff/public client registration.
- `src/routes/_authenticated/deals.new.tsx`: deal write fields and relations.
- `src/lib/publicform.functions.ts`, `src/routes/f.$token.tsx`, `src/routes/_authenticated/forms.index.tsx`: public submissions and broker signing.
- `src/lib/maintenance.ts`, `src/lib/maintenance.functions.ts`, `src/start.ts`: maintenance reads/writes and middleware.
- `src/routes/_authenticated/dashboard.tsx`: dashboard queries and Realtime subscriptions.
- `src/integrations/supabase/client.ts`, `client.server.ts`: publishable browser client vs server-side privileged client.
- Live maintenance UI, 24 Oct 2026: schema-cache failure resolving `public.system_maintenance`; catalog state remains unverified.

**This report is an audit and plan only. Do not apply DDL until the SQL Editor results have been reviewed and the exact changes approved.**