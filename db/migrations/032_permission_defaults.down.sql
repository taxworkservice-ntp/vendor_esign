-- Reverses exactly what the UP migration wrote (rows still matching a
-- backfilled set). Operator-customized rows are untouched either way.
UPDATE client_members SET permissions = '{}'::jsonb WHERE permissions IN (
  '{"canManageVendors": true, "canManageTransactions": true, "canManageCatalog": true, "canManageWht": true, "canManageSettings": true, "canVoidDocuments": true}'::jsonb,
  '{"canManageVendors": true, "canManageTransactions": true, "canManageCatalog": true}'::jsonb
);
