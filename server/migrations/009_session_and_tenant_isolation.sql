-- Visitors — session revocation + tenant isolation of the fiscal retry queue.

-- Until now a session JWT was trusted for its full 30 days: deleting a user or taking away
-- their admin role changed nothing until the token expired, and /logout only cleared the
-- cookie (the token itself stayed valid if it had been captured). Bumping token_version
-- invalidates every token issued for that user — that is what makes logout, a password
-- change, or "this account is compromised" actually mean something.
ALTER TABLE users
  ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0;

-- The idempotency key is "<operation>-<invoiceId>" and its unique index was global, so the
-- ON DUPLICATE KEY UPDATE in fiscalizeInvoice could land on ANOTHER tenant's queue row and
-- reset it to pending. Scoping the key by tenant makes that impossible at the storage layer,
-- independent of the ownership check now done in the service.
-- Existing keys are unique globally, so they stay unique under the composite key.
ALTER TABLE fiscal_requests
  DROP INDEX uq_fiscal_idem,
  ADD UNIQUE KEY uq_fiscal_idem (tenant_id, idempotency_key);

-- Any queue row whose tenant does not match its invoice's tenant could only have been created
-- by the bug above. It can never be legitimately fiscalized, and the worker would keep
-- retrying it until the deadline, so drop it.
DELETE r FROM fiscal_requests r
  JOIN invoices i ON i.id = r.invoice_id
  WHERE r.tenant_id <> i.tenant_id;
