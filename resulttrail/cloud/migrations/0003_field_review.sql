CREATE TABLE IF NOT EXISTS field_review_action (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant TEXT NOT NULL,
  report_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  field_key TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('not_compared','matches','possible_mismatch','cannot_read')),
  note TEXT NOT NULL,
  reviewer TEXT NOT NULL REFERENCES account(alias),
  created_at TEXT NOT NULL,
  previous_event_id INTEGER,
  FOREIGN KEY(tenant,report_id,version) REFERENCES result_version(tenant,report_id,version),
  FOREIGN KEY(previous_event_id) REFERENCES field_review_action(id)
);
CREATE INDEX IF NOT EXISTS field_review_version_idx ON field_review_action(tenant,report_id,version,id);
