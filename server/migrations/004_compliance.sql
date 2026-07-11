-- Visitors — financial protection (Phase 4)
-- Adds compliance flags/inputs to the business profile and an in-app
-- notification store for deadline / threshold / reverse-charge alerts.

ALTER TABLE business_profiles
  ADD COLUMN uses_foreign_platforms TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN has_vat_id TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN beds_count INT NULL,
  ADD COLUMN flat_tax_per_bed_eur DECIMAL(8,2) NULL;

CREATE TABLE notifications (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  severity      ENUM('info','warning','danger') NOT NULL DEFAULT 'info',
  category      VARCHAR(40) NOT NULL DEFAULT 'general',
  title         VARCHAR(160) NOT NULL,
  body          VARCHAR(500) NULL,
  link          VARCHAR(120) NULL,
  -- Prevents duplicate reminders for the same obligation/period.
  dedupe_key    VARCHAR(120) NOT NULL,
  is_read       TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notif_dedupe (tenant_id, dedupe_key),
  KEY idx_notif_tenant (tenant_id, is_read, created_at),
  CONSTRAINT fk_notif_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
