CREATE TABLE IF NOT EXISTS account (
  alias TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('reporter','reviewer')),
  tenant TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS session (
  token_hash TEXT PRIMARY KEY,
  alias TEXT NOT NULL REFERENCES account(alias),
  csrf TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS result_version (
  tenant TEXT NOT NULL,
  report_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  digest TEXT NOT NULL,
  reporter TEXT NOT NULL REFERENCES account(alias),
  received_at TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  PRIMARY KEY(tenant, report_id, version)
);
CREATE TABLE IF NOT EXISTS review_action (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL,
  report_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  reviewer TEXT NOT NULL REFERENCES account(alias),
  decision TEXT NOT NULL CHECK(decision IN ('reviewed','approved','needs_correction')),
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant,report_id,version) REFERENCES result_version(tenant,report_id,version)
);
CREATE TABLE IF NOT EXISTS export_package (
  export_id TEXT PRIMARY KEY,
  tenant TEXT NOT NULL,
  report_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  body_json TEXT NOT NULL,
  digest TEXT NOT NULL,
  signature TEXT NOT NULL,
  approver TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS result_reporter_idx ON result_version(reporter,report_id);
CREATE INDEX IF NOT EXISTS review_report_idx ON review_action(tenant,report_id,version,id);
CREATE INDEX IF NOT EXISTS session_expiry_idx ON session(expires);
