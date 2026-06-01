-- Allow reordering duration/day options in Treatment Master Data (matches medications/routes).
ALTER TABLE durations ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;
UPDATE durations SET display_order = id * 1000 WHERE COALESCE(display_order, 0) = 0;
