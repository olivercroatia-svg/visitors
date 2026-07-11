-- Visitors — initial schema (Phase 1 foundation)
-- Multi-tenant core: tenants, users, business profiles, VAT status/rates,
-- platform settings, audit log. Effective-dated VAT support is built in
-- from the start so later phases never have to retrofit it.

CREATE TABLE tenants (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(191) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  email         VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(191) NOT NULL,
  tenant_role   ENUM('owner','member') NOT NULL DEFAULT 'owner',
  platform_role ENUM('user','admin') NOT NULL DEFAULT 'user',
  last_login_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_tenant (tenant_id),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE business_profiles (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  type          ENUM('privatni_iznajmljivac','pausalni_obrt') NOT NULL DEFAULT 'privatni_iznajmljivac',
  legal_name    VARCHAR(191) NULL,
  oib           VARCHAR(11) NULL,
  address       VARCHAR(191) NULL,
  city          VARCHAR(120) NULL,
  postal_code   VARCHAR(10) NULL,
  iban          VARCHAR(34) NULL,
  vat_status    ENUM('nije_obveznik','obveznik') NOT NULL DEFAULT 'nije_obveznik',
  onboarding_completed TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_profile_tenant (tenant_id),
  CONSTRAINT fk_profile_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit trail of VAT-status transitions (nije_obveznik -> obveznik and back).
-- effective_date is the date from which invoices must apply the new status.
CREATE TABLE vat_status_changes (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  from_status   ENUM('nije_obveznik','obveznik') NULL,
  to_status     ENUM('nije_obveznik','obveznik') NOT NULL,
  effective_date DATE NOT NULL,
  reason        VARCHAR(255) NULL,
  created_by    BIGINT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vat_changes_tenant (tenant_id, effective_date),
  CONSTRAINT fk_vat_changes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Platform-wide, effective-dated VAT rates by category. Invoices freeze the
-- rate valid on their issue date, so admin rate changes never touch history.
CREATE TABLE tax_rates (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category      VARCHAR(60) NOT NULL,
  label         VARCHAR(120) NOT NULL,
  rate          DECIMAL(5,2) NOT NULL,
  valid_from    DATE NOT NULL,
  valid_to      DATE NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tax_rates_lookup (category, valid_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Generic platform settings (key/value). Values that need effective dating
-- (e.g. VAT threshold changes) are stored as JSON with valid_from entries.
CREATE TABLE platform_settings (
  setting_key   VARCHAR(120) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL,
  description   VARCHAR(255) NULL,
  updated_by    BIGINT UNSIGNED NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NULL,
  user_id       BIGINT UNSIGNED NULL,
  action        VARCHAR(80) NOT NULL,
  entity        VARCHAR(80) NULL,
  entity_id     VARCHAR(80) NULL,
  meta          JSON NULL,
  ip            VARCHAR(64) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_tenant (tenant_id, created_at),
  KEY idx_audit_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed defaults ---------------------------------------------------------------

INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('pdv_threshold_eur', '60000', 'Prag godišnjeg prometa za ulazak u sustav PDV-a (EUR)'),
  ('pdv_threshold_warn_levels', '[70,85,95]', 'Postoci praga na kojima se korisniku šalje upozorenje'),
  ('fiscal_retry_deadline_hours', '48', 'Rok za naknadnu fiskalizaciju kod tehničke greške (sati)');

INSERT INTO tax_rates (category, label, rate, valid_from) VALUES
  ('smjestaj', 'Smještaj (snižena stopa)', 13.00, '2024-01-01'),
  ('standard', 'Standardna stopa', 25.00, '2024-01-01'),
  ('snizena_5', 'Snižena stopa 5%', 5.00, '2024-01-01'),
  ('oslobodeno', 'Oslobođeno / izvan sustava PDV-a', 0.00, '2024-01-01');
