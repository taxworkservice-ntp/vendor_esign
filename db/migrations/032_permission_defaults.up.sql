-- 032 backfill permission flags by role (UP)
--
-- Manager/officer rows predate enforcement and all carry '{}', which under the
-- flag-driven model means "nothing allowed". Backfill from the role defaults
-- in src/lib/permissions.ts (manager: everything except permanent deletion;
-- officer: daily entry work) so existing staff keep working on the day
-- enforcement lands. Rows an operator already customized (non-empty) are left
-- alone; legacy client_admin/client_user map to manager/officer. Owners store
-- nothing — full access is implicit and cannot drift.

UPDATE client_members SET permissions =
  '{"canManageVendors": true, "canManageTransactions": true, "canManageCatalog": true, "canManageWht": true, "canManageSettings": true, "canVoidDocuments": true}'::jsonb
WHERE role IN ('manager', 'client_admin') AND permissions = '{}'::jsonb;

UPDATE client_members SET permissions =
  '{"canManageVendors": true, "canManageTransactions": true, "canManageCatalog": true}'::jsonb
WHERE role IN ('officer', 'client_user') AND permissions = '{}'::jsonb;
