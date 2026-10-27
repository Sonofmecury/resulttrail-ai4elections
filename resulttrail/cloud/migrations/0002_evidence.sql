CREATE TABLE IF NOT EXISTS evidence_photo (
  tenant TEXT NOT NULL,
  report_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  digest TEXT NOT NULL,
  body_b64 TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  signature TEXT NOT NULL,
  PRIMARY KEY (tenant, report_id, version)
);
