CREATE TABLE IF NOT EXISTS veterinarians (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  nvc_registration_number TEXT NOT NULL,
  department TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS veterinarians_display_order_idx ON veterinarians(display_order);

ALTER TABLE cases ADD COLUMN IF NOT EXISTS veterinarian_id INTEGER;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS veterinarian_name TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS veterinarian_nvc TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS veterinarian_department TEXT;
