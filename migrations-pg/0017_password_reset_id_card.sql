-- Temporary university ID photo for forgot-password verification (deleted on resolve).
ALTER TABLE password_reset_requests ADD COLUMN id_card_filename TEXT;
