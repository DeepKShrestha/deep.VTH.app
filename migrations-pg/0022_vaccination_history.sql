-- Vaccination history section for Canine / Feline hospital cases
INSERT INTO form_sections (key, title, display_order, form_scope)
SELECT 'vaccination_history', 'Vaccination History', 2550, 'hospital'
WHERE NOT EXISTS (
  SELECT 1 FROM form_sections WHERE key = 'vaccination_history'
);

INSERT INTO form_questions
  (key, section_key, label, input_type, options_json, enabled, required, hide_label, display_order, is_builtin, created_at, form_scope)
SELECT
  'canineRabies',
  'vaccination_history',
  'Rabies',
  'singleSelect',
  '["Yes","No","Unknown"]',
  1,
  0,
  0,
  1000,
  1,
  CURRENT_TIMESTAMP,
  'hospital'
WHERE NOT EXISTS (SELECT 1 FROM form_questions WHERE key = 'canineRabies');

INSERT INTO form_questions
  (key, section_key, label, input_type, options_json, enabled, required, hide_label, display_order, is_builtin, created_at, form_scope)
SELECT
  'canineDhppil',
  'vaccination_history',
  'DHPPiL',
  'singleSelect',
  '["Yes","No","Unknown"]',
  1,
  0,
  0,
  2000,
  1,
  CURRENT_TIMESTAMP,
  'hospital'
WHERE NOT EXISTS (SELECT 1 FROM form_questions WHERE key = 'canineDhppil');

INSERT INTO form_questions
  (key, section_key, label, input_type, options_json, enabled, required, hide_label, display_order, is_builtin, created_at, form_scope)
SELECT
  'felineRabies',
  'vaccination_history',
  'Rabies',
  'singleSelect',
  '["Yes","No","Unknown"]',
  1,
  0,
  0,
  3000,
  1,
  CURRENT_TIMESTAMP,
  'hospital'
WHERE NOT EXISTS (SELECT 1 FROM form_questions WHERE key = 'felineRabies');

INSERT INTO form_questions
  (key, section_key, label, input_type, options_json, enabled, required, hide_label, display_order, is_builtin, created_at, form_scope)
SELECT
  'felineTricat',
  'vaccination_history',
  'TriCat',
  'singleSelect',
  '["Yes","No","Unknown"]',
  1,
  0,
  0,
  4000,
  1,
  CURRENT_TIMESTAMP,
  'hospital'
WHERE NOT EXISTS (SELECT 1 FROM form_questions WHERE key = 'felineTricat');
