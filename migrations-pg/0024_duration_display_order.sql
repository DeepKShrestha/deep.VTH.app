ALTER TABLE durations ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
UPDATE durations SET display_order = id * 1000 WHERE COALESCE(display_order, 0) = 0;
