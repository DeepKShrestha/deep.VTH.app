ALTER TABLE routes_of_administration ADD COLUMN abbreviation TEXT NOT NULL DEFAULT '';

UPDATE routes_of_administration
SET abbreviation = name
WHERE COALESCE(abbreviation, '') = '';

UPDATE frequencies
SET short_code = name
WHERE COALESCE(short_code, '') = '';
