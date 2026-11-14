# Supabase migration reconciliation

## Current state (2026-11-02)

- `supabase migration list --linked` reports 22 local migration versions and an empty remote version for every one.
- The remote `supabase_migrations.schema_migrations` relation is absent.
- Historical implementation records confirm that `20261102000000_client_profile_photos.sql` and `20261102010000_property_asset_management.sql` were applied directly and their resulting schema, policies, and storage objects were verified.
- `20261102020000_user_interface_preferences.sql` was applied directly in the prior implementation session; its self-only RLS policies were verified.
- Older local migrations may already be represented by the pre-existing production schema, but their exact remote application state has not been established.
- A live schema and storage inventory could not be completed during this reconciliation attempt: the linked CLI temporary-role connection failed password authentication. No remote schema changes were made as part of this reconciliation.

## Safety rules

1. Do not run `supabase db push`, reset the database, or drop/replace production objects while the remote ledger is empty.
2. Do not mark an older migration applied based only on a matching table name. Compare every migration's columns, constraints, indexes, functions, triggers, RLS policies, grants, and storage objects against a fresh remote inventory.
3. Keep the remote database password in the approved local environment or secret manager. Do not put credentials in command history, source files, or this document.
4. Take and retain a restricted, verified schema/data backup before making reconciliation changes.

## Reconciliation procedure

1. Obtain the database password through the approved secret-management process and verify linked project `alxpwbqthlrexrbycqjp`.
2. Capture and review a fresh database backup and schema-only dump. Include `public`, `storage`, and relevant auth-owned objects in the inventory; do not restore the dump.
3. Query the actual production catalog for each local migration's objects and compare definitions, not just names. Record each migration as **already applied**, **not applied**, **partially applied**, or **not safely comparable**.
4. Resolve partial migrations with a reviewed, additive, data-preserving migration. Back up affected records and test the change against a restored copy before applying it.
5. Reconcile only versions proven fully applied using Supabase's migration-repair workflow. Never use repair to hide a partially applied or unknown migration. Review the CLI's proposed version list before confirming.
6. Apply only migrations proven absent, in timestamp order, after reviewing their SQL and verifying that they do not replay existing objects or modify existing records unexpectedly.
7. Run `supabase migration list --linked` again and compare the remote schema, policies, grants, and storage configuration to the expected final state. Save the before/after inventories with the deployment record.

## Known direct applications

| Version        | Local migration                                 | Evidence                                                                                                                                                      |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20261102000000 | `20261102000000_client_profile_photos.sql`      | Direct application and resulting column, private bucket, and four storage policies were verified in the prior implementation session.                         |
| 20261102010000 | `20261102010000_property_asset_management.sql`  | Direct application and resulting tables, RLS policies, private bucket, workflow functions, and permissions were verified in the prior implementation session. |
| 20261102020000 | `20261102020000_user_interface_preferences.sql` | Direct application and self-only select/insert/update policies were verified in the prior implementation session.                                             |

These versions remain unrecorded in the remote migration ledger. This document does not mark them applied. The remaining historical migration versions must be compared to production before any repair or push.
