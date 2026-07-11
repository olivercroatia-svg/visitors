-- Visitors — master data (Phase 2)
-- Business premises, fiscal devices, services (catalog), guests, and a
-- JLS (municipality) lookup used later for per-bed tax and tourist fees.
-- These feed invoice numbering (premise.code / device.code) and the
-- onboarding gate that blocks invoicing until the profile is complete.

CREATE TABLE municipalities (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  county        VARCHAR(120) NOT NULL,
  -- Rates are JLS-specific and effective-dated in practice; left NULL until
  -- filled from the admin backoffice (Phase 7) / verified per municipality.
  flat_tax_per_bed_eur   DECIMAL(8,2) NULL,
  tourist_tax_high_eur   DECIMAL(6,2) NULL,
  tourist_tax_low_eur    DECIMAL(6,2) NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_muni_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE premises (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(160) NOT NULL,
  -- Oznaka poslovnog prostora (used in the invoice number N/POSL/URE).
  code          VARCHAR(20) NOT NULL,
  address       VARCHAR(191) NULL,
  city          VARCHAR(120) NULL,
  postal_code   VARCHAR(10) NULL,
  municipality_id BIGINT UNSIGNED NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_premise_code (tenant_id, code),
  KEY idx_premise_tenant (tenant_id),
  CONSTRAINT fk_premise_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_premise_muni FOREIGN KEY (municipality_id) REFERENCES municipalities(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE devices (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  premise_id    BIGINT UNSIGNED NOT NULL,
  -- Oznaka naplatnog uređaja (the "URE" part of the invoice number).
  code          VARCHAR(20) NOT NULL,
  label         VARCHAR(120) NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_device_code (tenant_id, premise_id, code),
  KEY idx_device_tenant (tenant_id),
  CONSTRAINT fk_device_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_device_premise FOREIGN KEY (premise_id) REFERENCES premises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE services (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(160) NOT NULL,
  unit          VARCHAR(30) NOT NULL DEFAULT 'noć',
  default_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  -- VAT category key -> tax_rates.category. For non-VAT payers the effective
  -- rate resolves to 0 with the exemption clause at invoice time.
  vat_category  VARCHAR(60) NOT NULL DEFAULT 'smjestaj',
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_service_tenant (tenant_id),
  CONSTRAINT fk_service_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE guests (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  first_name    VARCHAR(120) NOT NULL,
  last_name     VARCHAR(120) NOT NULL,
  country       VARCHAR(60) NULL DEFAULT 'Hrvatska',
  doc_type      ENUM('osobna','putovnica','ostalo') NULL,
  doc_number    VARCHAR(60) NULL,
  email         VARCHAR(191) NULL,
  phone         VARCHAR(40) NULL,
  address       VARCHAR(191) NULL,
  city          VARCHAR(120) NULL,
  note          VARCHAR(500) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_guest_tenant_name (tenant_id, last_name, first_name),
  CONSTRAINT fk_guest_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Starter JLS list (place + county). Rates intentionally NULL — filled later.
INSERT INTO municipalities (name, county) VALUES
  ('Dubrovnik', 'Dubrovačko-neretvanska'),
  ('Split', 'Splitsko-dalmatinska'),
  ('Makarska', 'Splitsko-dalmatinska'),
  ('Hvar', 'Splitsko-dalmatinska'),
  ('Trogir', 'Splitsko-dalmatinska'),
  ('Zadar', 'Zadarska'),
  ('Nin', 'Zadarska'),
  ('Biograd na Moru', 'Zadarska'),
  ('Šibenik', 'Šibensko-kninska'),
  ('Vodice', 'Šibensko-kninska'),
  ('Rovinj', 'Istarska'),
  ('Poreč', 'Istarska'),
  ('Pula', 'Istarska'),
  ('Umag', 'Istarska'),
  ('Medulin', 'Istarska'),
  ('Opatija', 'Primorsko-goranska'),
  ('Crikvenica', 'Primorsko-goranska'),
  ('Mali Lošinj', 'Primorsko-goranska'),
  ('Krk', 'Primorsko-goranska'),
  ('Rab', 'Primorsko-goranska'),
  ('Zagreb', 'Grad Zagreb'),
  ('Ostalo', '—');
