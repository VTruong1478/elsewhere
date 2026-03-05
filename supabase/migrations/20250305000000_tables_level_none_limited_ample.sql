-- Tables level: support none, ample on tables_label.
-- First transaction: only add enum values (Postgres cannot use new enum values in the same transaction).
ALTER TYPE tables_label ADD VALUE IF NOT EXISTS 'none';
ALTER TYPE tables_label ADD VALUE IF NOT EXISTS 'ample';
