-- 006_companies.sql
-- Buyer companies — an informational block on the invoice.
--
-- Guests are often business travellers who want their employer's details printed on
-- the invoice. The buyer stays the GUEST: numbering, fiscalization and VAT are
-- untouched. The company is printed alongside the guest, nothing more.
--
-- Companies are tenant-scoped master data, reusable across guests and invoices, but
-- every invoice keeps its OWN COPY of the company data (`company_*_cache`, mirroring
-- the existing `guest_name_cache`). That copy is why editing or archiving a company
-- can never change an already-issued invoice's PDF.

CREATE TABLE companies (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(191) NOT NULL,
  oib           VARCHAR(11) NULL,
  vat_id        VARCHAR(20) NULL,
  address       VARCHAR(191) NULL,
  postal_code   VARCHAR(10) NULL,
  city          VARCHAR(120) NULL,
  country       VARCHAR(60) NULL DEFAULT 'Hrvatska',
  email         VARCHAR(191) NULL,
  phone         VARCHAR(40) NULL,
  note          VARCHAR(500) NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- MySQL does not compare NULLs in a unique index, so this blocks duplicate OIBs
  -- without forcing an OIB on foreign companies (they carry a VAT ID instead).
  UNIQUE KEY uq_company_oib (tenant_id, oib),
  KEY idx_company_tenant_name (tenant_id, active, name),
  CONSTRAINT fk_company_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE invoices
  ADD COLUMN company_id                BIGINT UNSIGNED NULL AFTER guest_name_cache,
  ADD COLUMN company_name_cache        VARCHAR(191) NULL AFTER company_id,
  ADD COLUMN company_oib_cache         VARCHAR(11)  NULL AFTER company_name_cache,
  ADD COLUMN company_vat_id_cache      VARCHAR(20)  NULL AFTER company_oib_cache,
  ADD COLUMN company_address_cache     VARCHAR(191) NULL AFTER company_vat_id_cache,
  ADD COLUMN company_postal_code_cache VARCHAR(10)  NULL AFTER company_address_cache,
  ADD COLUMN company_city_cache        VARCHAR(120) NULL AFTER company_postal_code_cache,
  ADD COLUMN company_country_cache     VARCHAR(60)  NULL AFTER company_city_cache,
  ADD KEY idx_invoice_company (tenant_id, company_id),
  ADD CONSTRAINT fk_invoice_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
