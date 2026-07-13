-- Visitors — real fiscalization (F1, Tehnička specifikacija v2.7)
-- Everything the CIS message needs that the app did not previously store.

-- Per-tenant signing certificate. Every obveznik fiscalizes with THEIR own advanced
-- certificate (FINA or any eIDAS trust provider on the EU trusted list), so this can
-- never be a single global key in .env.
--
-- Both the .p12 and its password are AES-256-GCM encrypted at rest (utils/crypto.ts).
-- The certificate is used ONLY to sign the XML message — the TLS channel to the tax
-- authority is 1-way, so it is never presented as a client certificate.
CREATE TABLE fiscal_certificates (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  filename      VARCHAR(191) NULL,
  p12_ct        VARBINARY(16384) NOT NULL,
  p12_iv        VARBINARY(12) NOT NULL,
  p12_tag       VARBINARY(16) NOT NULL,
  password_ct   VARBINARY(512) NOT NULL,
  password_iv   VARBINARY(12) NOT NULL,
  password_tag  VARBINARY(16) NOT NULL,
  key_version   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  environment   ENUM('test','prod') NOT NULL DEFAULT 'test',
  -- Read out of the certificate's organizationIdentifier (VATHR-<oib>) when it is
  -- uploaded. The authority rejects the message (s005) if it differs from the invoice
  -- OIB, so we compare up front instead of discovering it on a rejection.
  subject_oib   CHAR(11) NULL,
  valid_from    DATETIME NULL,
  valid_to      DATETIME NULL,
  last_verified_at DATETIME NULL,
  last_error    VARCHAR(500) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fiscal_cert_tenant (tenant_id),
  CONSTRAINT fk_fiscal_cert_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OibOper is mandatory in the message and we only had a free-text operator_label.
-- For a private landlord the operator is the landlord, so the OIB falls back to the
-- business OIB; a tenant with staff can set a per-user OIB.
ALTER TABLE users
  ADD COLUMN oib CHAR(11) NULL;

-- Frozen onto the invoice at issue, like every other fiscal fact on an issued invoice:
-- changing a user's OIB later must not rewrite history.
ALTER TABLE invoices
  ADD COLUMN operator_oib CHAR(11) NULL;

-- OznSlijed: 'N' = invoice numbers run per device, 'P' = per premise. Our sequence is
-- keyed by (tenant, premise, device, year), which is per device -> 'N'. Stored rather
-- than assumed, because the taxpayer declares this to the tax authority and it must match.
ALTER TABLE business_profiles
  ADD COLUMN sequence_mark ENUM('P','N') NOT NULL DEFAULT 'N';
