-- Runtime-selectable monitoring profile for the System Status page.
-- This changes EagleEye's monitoring basis only; it does not change the
-- actual Cloudflare billing/plan.
CREATE TABLE IF NOT EXISTS runtime_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
