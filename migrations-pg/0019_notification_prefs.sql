-- Cross-device notification preferences (toast/sound/style/volume).
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS notification_prefs_json TEXT;
