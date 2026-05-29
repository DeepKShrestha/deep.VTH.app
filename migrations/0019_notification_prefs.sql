-- Cross-device notification preferences (toast/sound/style/volume).
ALTER TABLE user_preferences ADD COLUMN notification_prefs_json TEXT;
