-- Visitors — invoices, items, numbering sequences, fiscalization queue (Phase 3)
-- Invoices are append-only once issued: amounts, VAT status/rates, clause and
-- fiscal results are frozen at issue time. Corrections happen via a linked
-- storno document, never by mutating the original.

CREATE TABLE invoices (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  doc_type      ENUM('invoice','storno') NOT NULL DEFAULT 'invoice',

  premise_id    BIGINT UNSIGNED NULL,
  device_id     BIGINT UNSIGNED NULL,
  guest_id      BIGINT UNSIGNED NULL,
  guest_name_cache VARCHAR(240) NULL,

  year          SMALLINT UNSIGNED NULL,
  seq           INT UNSIGNED NULL,
  number_full   VARCHAR(40) NULL,

  status        ENUM('draft','issued','cancelled') NOT NULL DEFAULT 'draft',
  issue_date    DATE NULL,
  issue_datetime DATETIME NULL,
  due_date      DATE NULL,
  payment_method ENUM('gotovina','kartica','transakcijski','ostalo') NOT NULL DEFAULT 'gotovina',
  currency      CHAR(3) NOT NULL DEFAULT 'EUR',

  -- Frozen tax context at issue time
  vat_applicable TINYINT(1) NOT NULL DEFAULT 0,
  vat_clause    VARCHAR(255) NULL,
  subtotal      DECIMAL(12,2) NOT NULL DEFAULT 0,
  vat_total     DECIMAL(12,2) NOT NULL DEFAULT 0,
  total         DECIMAL(12,2) NOT NULL DEFAULT 0,

  operator_label VARCHAR(120) NULL,
  note          VARCHAR(500) NULL,

  -- Fiscalization results
  jir           VARCHAR(64) NULL,
  zki           VARCHAR(64) NULL,
  fiscal_status ENUM('none','pending','confirmed','failed','not_required') NOT NULL DEFAULT 'none',
  fiscalized_at DATETIME NULL,

  -- Storno linkage
  cancels_invoice_id      BIGINT UNSIGNED NULL,
  cancelled_by_invoice_id BIGINT UNSIGNED NULL,
  cancelled_at  DATETIME NULL,
  cancelled_reason VARCHAR(255) NULL,

  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Sequential numbering uniqueness (drafts have NULL seq -> allowed to repeat)
  UNIQUE KEY uq_invoice_number (tenant_id, premise_id, device_id, year, seq),
  KEY idx_inv_tenant_status (tenant_id, status, issue_date),
  KEY idx_inv_guest (tenant_id, guest_id),
  CONSTRAINT fk_inv_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_premise FOREIGN KEY (premise_id) REFERENCES premises(id) ON DELETE RESTRICT,
  CONSTRAINT fk_inv_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE RESTRICT,
  CONSTRAINT fk_inv_guest FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoice_items (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invoice_id    BIGINT UNSIGNED NOT NULL,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  description   VARCHAR(255) NOT NULL,
  quantity      DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit          VARCHAR(30) NOT NULL DEFAULT 'kom',
  unit_price    DECIMAL(12,2) NOT NULL DEFAULT 0,
  vat_category  VARCHAR(60) NOT NULL DEFAULT 'smjestaj',
  vat_rate      DECIMAL(5,2) NOT NULL DEFAULT 0,
  line_base     DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_vat      DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total    DECIMAL(12,2) NOT NULL DEFAULT 0,
  sort_order    INT NOT NULL DEFAULT 0,
  KEY idx_item_invoice (invoice_id),
  CONSTRAINT fk_item_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Atomic per-(tenant, premise, device, year) counter for gap-free numbering.
CREATE TABLE invoice_sequences (
  tenant_id     BIGINT UNSIGNED NOT NULL,
  premise_id    BIGINT UNSIGNED NOT NULL,
  device_id     BIGINT UNSIGNED NOT NULL,
  year          SMALLINT UNSIGNED NOT NULL,
  last_number   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, premise_id, device_id, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fiscalization attempts / retry queue (naknadna fiskalizacija).
CREATE TABLE fiscal_requests (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  invoice_id    BIGINT UNSIGNED NOT NULL,
  operation     ENUM('fiscalize','cancel') NOT NULL DEFAULT 'fiscalize',
  status        ENUM('pending','confirmed','failed') NOT NULL DEFAULT 'pending',
  attempts      INT NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(80) NOT NULL,
  deadline_at   DATETIME NULL,
  next_attempt_at DATETIME NULL,
  last_error    VARCHAR(500) NULL,
  jir           VARCHAR(64) NULL,
  zki           VARCHAR(64) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fiscal_idem (idempotency_key),
  KEY idx_fiscal_pending (status, next_attempt_at),
  KEY idx_fiscal_invoice (invoice_id),
  CONSTRAINT fk_fiscal_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
