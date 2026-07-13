-- Visitors — eVisitor integration (Phase 5)
-- Check-in / check-out of tourists against the HTZ eVisitor system.
--
-- An eVisitor accommodation object (Facility) is NOT the fiscal `premises`
-- (poslovni prostor, which feeds the invoice number). One tenant may run several
-- eVisitor objects under a single fiscal premise, so they are separate tables and
-- `premise_id` below is a cross-reference only — it never drives eVisitor.

-- Per-tenant eVisitor credentials. Each obveznik opens their own eVisitor account
-- and an API sub-user with their tourist board, so credentials can never be global.
-- Secrets are AES-256-GCM encrypted (server/src/utils/crypto.ts); the plaintext is
-- never stored, never logged, and never returned by any route.
CREATE TABLE evisitor_credentials (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  username      VARCHAR(120) NOT NULL,
  password_ct   VARBINARY(512) NOT NULL,
  password_iv   VARBINARY(12)  NOT NULL,
  password_tag  VARBINARY(16)  NOT NULL,
  -- eVisitor currently requires an apikey only on the test platform.
  apikey_ct     VARBINARY(512) NULL,
  apikey_iv     VARBINARY(12)  NULL,
  apikey_tag    VARBINARY(16)  NULL,
  -- Lets the key be rotated later without a schema change.
  key_version   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  environment   ENUM('test','prod') NOT NULL DEFAULT 'test',
  -- NULL -> derive the URL from `environment` + the EVISITOR_*_URL env defaults.
  base_url      VARCHAR(191) NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  last_verified_at DATETIME NULL,
  last_error    VARCHAR(500) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_evis_cred_tenant (tenant_id),
  CONSTRAINT fk_evis_cred_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- eVisitor accommodation objects. `facility_code` is the eVisitor object code sent
-- as the `Facility` XML attribute (e.g. "0000022") and can be pulled from
-- FacilityBrowse rather than typed by hand.
CREATE TABLE accommodation_objects (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(160) NOT NULL,
  facility_code VARCHAR(20) NOT NULL,
  premise_id    BIGINT UNSIGNED NULL,
  municipality_id BIGINT UNSIGNED NULL,
  address       VARCHAR(191) NULL,
  city          VARCHAR(120) NULL,
  -- Ch. 4.3: the allowed BP categories depend on the object, so a per-object
  -- default is the sane starting point for the check-in form.
  default_tt_category VARCHAR(10) NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_obj_facility (tenant_id, facility_code),
  KEY idx_obj_tenant (tenant_id, active),
  CONSTRAINT fk_obj_tenant   FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_obj_premise  FOREIGN KEY (premise_id) REFERENCES premises(id) ON DELETE SET NULL,
  CONSTRAINT fk_obj_muni     FOREIGN KEY (municipality_id) REFERENCES municipalities(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One stay = one guest = one eVisitor prijava = one GUID. A family of four is four
-- stays sharing a `group_ref`, because eVisitor registers each tourist separately.
--
-- Two status columns on purpose, mirroring invoices.status / invoices.fiscal_status:
--   status          = the business fact (has the guest actually arrived/left?)
--   evisitor_status = the transport fact (did the call to eVisitor get through?)
-- Collapsed into one they could not express "the guest really left, but the
-- check-out call is still pending".
CREATE TABLE stays (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  object_id     BIGINT UNSIGNED NOT NULL,
  guest_id      BIGINT UNSIGNED NOT NULL,
  guest_name_cache VARCHAR(240) NULL,

  -- We generate this (crypto.randomUUID(), uppercased) and eVisitor has required it
  -- since 2017-06-01. It is the join key back into eVisitor ("Broj prijave") and our
  -- idempotency key across retries, so it is assigned once and never reused.
  evisitor_id   CHAR(36) NULL,

  -- Ch. 4.4.3: this must be the REAL arrival/departure moment, never the time we
  -- happened to transfer the data and never the invoice date.
  check_in_at   DATETIME NOT NULL,
  foreseen_check_out_at DATETIME NOT NULL,
  check_out_at  DATETIME NULL,

  tt_category   VARCHAR(10) NOT NULL,
  arrival_org   VARCHAR(10) NOT NULL DEFAULT 'I',
  service_type  VARCHAR(40) NOT NULL DEFAULT 'noćenje',

  status          ENUM('draft','checked_in','checked_out','cancelled') NOT NULL DEFAULT 'draft',
  evisitor_status ENUM('none','pending','confirmed','failed') NOT NULL DEFAULT 'none',
  registered_at   DATETIME NULL,
  checked_out_at  DATETIME NULL,
  cancelled_at    DATETIME NULL,
  cancelled_reason VARCHAR(255) NULL,
  last_error    VARCHAR(500) NULL,

  -- Groups a family/booking so the UI can check them in and out together.
  group_ref     VARCHAR(40) NULL,
  -- Convenience link so a check-out can offer "izdaj račun". Never feeds dates.
  invoice_id    BIGINT UNSIGNED NULL,
  note          VARCHAR(500) NULL,

  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_stay_evisitor_id (evisitor_id),
  KEY idx_stay_tenant_status (tenant_id, status, check_in_at),
  KEY idx_stay_object (tenant_id, object_id, check_in_at),
  KEY idx_stay_guest (tenant_id, guest_id),
  KEY idx_stay_group (tenant_id, group_ref),
  CONSTRAINT fk_stay_tenant  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_stay_object  FOREIGN KEY (object_id) REFERENCES accommodation_objects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stay_guest   FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stay_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Retry queue, modelled on fiscal_requests. `status='failed'` means eVisitor
-- rejected the data on business grounds (dupla prijava, wrong category, …) — there
-- is no point retrying that, the user has to fix the data. Transient failures stay
-- 'pending' and are re-sent by the drain worker after next_attempt_at.
CREATE TABLE evisitor_requests (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  stay_id       BIGINT UNSIGNED NOT NULL,
  operation     ENUM('checkin','edit','checkout','cancel') NOT NULL,
  status        ENUM('pending','confirmed','failed') NOT NULL DEFAULT 'pending',
  attempts      INT NOT NULL DEFAULT 0,
  -- "<operation>-<stayId>-<revision>": an edit or check-out of the same stay must be
  -- able to recur, so the key carries a bumped revision rather than just the op+id.
  idempotency_key VARCHAR(80) NOT NULL,
  -- Ch. 4.4.3: check-in/check-out must reach eVisitor within 24h of the real event.
  deadline_at   DATETIME NULL,
  next_attempt_at DATETIME NULL,
  last_error    VARCHAR(500) NULL,
  -- Frozen snapshot of what we actually sent, for support and audit.
  payload       JSON NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_evis_idem (idempotency_key),
  KEY idx_evis_pending (status, next_attempt_at),
  KEY idx_evis_stay (stay_id),
  CONSTRAINT fk_evis_req_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_evis_req_stay   FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ch. 4.4.6 obliges the integrator to DISPLAY every eVisitor system message and let
-- the user MANAGE it. A single last_error column cannot do that (it loses history and
-- cannot be acknowledged), so messages are append-only rows kept verbatim.
CREATE TABLE evisitor_messages (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  stay_id       BIGINT UNSIGNED NULL,
  operation     VARCHAR(20) NULL,
  severity      ENUM('info','warning','error') NOT NULL DEFAULT 'error',
  -- The Croatian text exactly as eVisitor sent it — never translated or shortened.
  message       VARCHAR(1000) NOT NULL,
  raw           TEXT NULL,
  acknowledged_at DATETIME NULL,
  acknowledged_by BIGINT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_evis_msg_tenant (tenant_id, acknowledged_at, created_at),
  KEY idx_evis_msg_stay (stay_id),
  CONSTRAINT fk_evis_msg_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_evis_msg_stay   FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Codebook (šifrarnik) cache. eVisitor exposes 8 lookup resources and we send their
-- codes verbatim, so we sync them instead of hardcoding: pushing a guessed code into
-- a state register is worse than refusing to send. Platform-wide, because the lists
-- are identical for every tenant even though one tenant's credentials fetch them.
CREATE TABLE evisitor_codebooks (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind          VARCHAR(40) NOT NULL,
  code          VARCHAR(30) NOT NULL,
  label         VARCHAR(191) NOT NULL,
  -- Settlement -> its city/county; used for the HR "Grad – Naselje" form.
  parent_code   VARCHAR(30) NULL,
  -- e.g. tt_category: {"letter":"A","min_age":0,"max_age":11}
  meta          JSON NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  synced_at     DATETIME NULL,
  UNIQUE KEY uq_evis_cb (kind, code),
  KEY idx_evis_cb_kind (kind, active, label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Guests gain the eVisitor-mandatory fields. Strictly additive and all NULLable:
--   * `country` (free text) and `doc_type` (3-value ENUM) are LEFT ALONE — the invoice
--     screens and the invoice PDF read them. The eVisitor codebook values live in new,
--     parallel columns, so the billing view and the wire view can differ without either
--     breaking the other.
--   * The existing first_name/last_name (120) and doc_number (60) columns are NOT
--     shrunk to the MUP maxima (64/64/16); that would truncate existing rows. Those
--     limits are enforced in validation.ts, on the eVisitor path only.
--   * doc_type_code is deliberately left NULL rather than guessed from doc_type — the
--     real codes come from DocumentTtypeLookup.
ALTER TABLE guests
  ADD COLUMN middle_name            VARCHAR(64) NULL AFTER first_name,
  ADD COLUMN date_of_birth          DATE NULL,
  ADD COLUMN gender                 ENUM('muski','zenski') NULL,
  ADD COLUMN citizenship_code       CHAR(3) NULL,
  ADD COLUMN birth_country_code     CHAR(3) NULL,
  ADD COLUMN birth_city             VARCHAR(64) NULL,
  ADD COLUMN residence_country_code CHAR(3) NULL,
  ADD COLUMN residence_city         VARCHAR(64) NULL,
  ADD COLUMN residence_city_code    VARCHAR(30) NULL,
  ADD COLUMN residence_address      VARCHAR(191) NULL,
  ADD COLUMN doc_type_code          VARCHAR(10) NULL,
  ADD COLUMN visa_type              VARCHAR(60) NULL,
  ADD COLUMN visa_number            VARCHAR(40) NULL,
  ADD COLUMN visa_validity_date     DATE NULL;

-- Only the unambiguous case is backfilled; everything else is left for the user.
UPDATE guests SET residence_country_code = 'HRV'
  WHERE residence_country_code IS NULL AND country IN ('Hrvatska', 'HR', 'HRV', 'Croatia');
UPDATE guests SET citizenship_code = 'HRV'
  WHERE citizenship_code IS NULL AND country IN ('Hrvatska', 'HR', 'HRV', 'Croatia');
