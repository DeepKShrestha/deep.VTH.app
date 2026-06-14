# What a Site Backup Contains

This document is a complete inventory of what the VTH application's site backup
includes and what it deliberately leaves out. It describes the backups produced
by "Backup now" in Admin -> Backup and by the scheduled automatic backups. Use
it to understand exactly what data lives inside a `site-*.zip` file.

Source of truth in code:
- `server/services/backup-service.ts` (what is written into the zip)
- `server/services/restore-service.ts` (what is read back on restore)
- `server/services/backup-paths.ts` (the upload directories that are included)

> Important: backups are currently stored as a plain (unencrypted) `.zip`.
> Treat every backup file as highly sensitive. See the "Sensitivity notes"
> section at the end.

---

## 1. File and folder layout inside the zip

A backup is a single `site-YYYYMMDD-HHMMSS.zip` containing:

```
site-20260614-093000.zip
  meta.json
  backup-summary.txt
  README.txt
  env-keys.txt
  db/dump.sql          (Postgres deployments)
  db/sqlite.db         (SQLite deployments)
  files/               (case attachments, present only if any exist)
  profile-photos/      (user profile and ID photos, present only if any exist)
```

- On a **Postgres** deployment the database is captured as `db/dump.sql`
  (a full `pg_dump` in plain SQL format, using `--clean --if-exists --no-owner`).
- On a **SQLite** deployment the database is captured as `db/sqlite.db`
  (a consistent copy of the entire live database file).
- `files/` and `profile-photos/` are only added when at least one file is
  present in those directories.

---

## 2. The database (the most important part)

The database dump contains the **entire database** -- every table and every row,
not just the ones summarized in `backup-summary.txt`. The list below is the
complete set of tables captured.

### 2.1 Accounts, authentication, and sessions

- **`users`** -- every user account. Includes full name, address, phone, email,
  designation, student batch, username, role, approval state, account creation
  time, failed-login counter, lock-until timestamp, profile photo filename, and
  the following sensitive security fields:
  - `password_hash` -- bcrypt hash of the password (not the plaintext password).
  - `totp_secret` -- the Base32 two-factor (TOTP) secret, stored as-is.
  - `totp_enabled`, `totp_enforced` -- two-factor status flags.
- **`sessions`** -- active login session tokens (token, user id, created/expiry/
  last-seen timestamps). On restore these are cleared, but the backup file
  itself contains them.
- **`pending_two_factor_login`** -- transient state for in-progress two-factor
  logins.
- **`password_reset_requests`** -- forgot-password requests: requesting role,
  the proposed new `password_hash`, reason, status, resolver, resolver note, and
  the `id_card_filename` reference. (The referenced ID card image files are NOT
  in the backup -- see Exclusions.)
- **`user_preferences`** -- per-user settings (for example inactivity timeout,
  confirm-before-logout, module toggle defaults).

### 2.2 Cases and clinical data

- **`cases`** -- the core record for both AST and Hospital cases. Includes:
  - Case numbering: case number, bill number, daily/monthly/yearly numbers.
  - Dates in both Bikram Sambat and AD.
  - Owner information: owner name, address, phone.
  - Animal information: species, breed, animal name, age, sex.
  - Sample information: sample type, sample dates, culture result.
  - `ast_results` -- AST measurements/results as JSON.
  - `custom_fields` -- all dynamic hospital registration data as JSON
    (history, clinical signs, vitals, vaccination history and dates,
    tests suggested, and any admin-defined custom fields).
  - `treatment_details` -- medications and treatment plan as JSON.
  - Attending veterinarian snapshot: id, name, NVC number, department.
  - Audit fields: who registered it, who last updated it, and when.
- **`case_attachments`** -- metadata rows for each uploaded file (case id,
  section, category, file name, MIME type, size, storage path, uploader, time).
  The actual file bytes live under `files/` (see section 3).
- **`case_counters`** -- atomic sequence counters used to allocate unique case
  numbers per scope and period.

### 2.3 Reference and master data

- **`breakpoints`** -- antibiotic interpretation breakpoints (antibiotic,
  symbol, content/disc, sensitive/intermediate/resistant thresholds, primary
  targets, preset flag).
- **`species_options`** -- selectable species values.
- **`breed_options`** -- selectable breed values.
- **`medications`** -- medication catalog (name, description, class).
- **`routes_of_administration`** -- route catalog (name, abbreviation).
- **`frequencies`** -- dosing frequency catalog (name, short code).
- **`dose_units`** -- dose unit catalog.
- **`durations`** -- duration/day-option catalog (name, numeric value).
- **`veterinarians`** -- attending veterinarian catalog (full name, NVC
  registration number, department, display order).

### 2.4 Dynamic form configuration

- **`form_field_configs`** -- per-field configuration entries.
- **`form_sections`** -- admin-defined form sections.
- **`form_questions`** -- admin-defined form questions/fields used to build the
  registration forms and the `cases.custom_fields` JSON.

### 2.5 Access control and batches

- **`role_feature_visibility`** -- admin per-role toggles (for example export
  and print visibility, register visibility) for AST and Hospital modules.
- **`student_batch_feature_visibility`** -- per-student-batch overrides for the
  same feature toggles.
- **`student_batches`** -- the list of student batches.

### 2.6 Audit, notifications, and operations

- **`admin_action_logs`** -- audit log of sensitive admin actions (who did what,
  when, and on which target).
- **`form_edit_audit_logs`** -- audit log of changes to form sections/questions.
- **`case_change_logs`** -- audit log of case creation and deletion, including
  actor id, role, name, and username.
- **`notification_states`** -- per-user notification read/seen state.
- **`backup_history`** -- record of past backups (time, kind, status, filename,
  size, error message, remote key, db provider). On restore this is cleared.
- **`backup_settings`** -- the backup schedule, retention count, and remote
  upload flag. On restore the live server's current settings are preserved
  rather than overwritten.

---

## 3. Uploaded files (outside the database)

- **`files/`** -- the actual uploaded case attachment files (treatment photos,
  diagnostic images, X-rays, PDFs). Source directory:
  `CASE_ATTACHMENTS_DIR` or `uploads/case-attachments` by default.
- **`profile-photos/`** -- user profile photos and any stored ID photos.
  Source directory: `PROFILE_PHOTO_DIR` or `uploads/profile-photos` by default.

Each is included only when at least one file is present.

---

## 4. Metadata and helper files in the zip

- **`meta.json`** -- backup format version, app name, creation timestamp,
  database provider (`postgres` or `sqlite`), and `NODE_ENV`. Used on restore to
  validate the format and to require a matching database provider.
- **`backup-summary.txt`** -- a human-readable sanity check: row counts for a
  representative subset of tables, plus the number and total size of case
  attachments and profile photos. Note: this is a summary only; the database
  dump still contains every table regardless of what is listed here.
- **`README.txt`** -- step-by-step restore instructions.
- **`env-keys.txt`** -- the **names only** of environment variables that were
  set when the backup ran. It never contains any values. It exists as a
  checklist of which variables to set on a fresh deployment. (Routine noise
  variables such as `PWD`, `OLDPWD`, `SHLVL`, and `_` are filtered out.)

---

## 5. What is NOT in the backup (intentional exclusions)

- **Secret values from `.env`** -- only the variable names are recorded (in
  `env-keys.txt`). No actual secrets are stored: not the database password, not
  the session/signing secrets, not any API keys.
- **Forgot-password ID card uploads** -- the image files under
  `PASSWORD_RESET_ID_CARD_DIR` (default `uploads/password-reset-id-cards`) are
  treated as ephemeral personal data and are excluded. (The matching
  `password_reset_requests` rows are still in the database dump, including the
  `id_card_filename` reference, but the image bytes are not.)
- **Application code, `node_modules`, and `dist`** -- not part of a data backup.
- **Operating system and service logs / journals** -- not included.
- **Live sessions as usable logins after restore** -- the `sessions` table is
  present in the dump, but a restore clears it, so everyone must log in again.

---

## 6. Restore behavior worth knowing

- A restore requires a superadmin and the exact confirmation phrase
  `RESTORE_SITE_DATA`.
- The backup's database provider must match the server's provider (a Postgres
  backup restores only onto Postgres, and SQLite onto SQLite).
- On restore, the current database and uploaded files are replaced by the
  backup's contents.
- After restore, `sessions` and `backup_history` are cleared, and the live
  server's `backup_settings` (schedule and retention) are preserved so they are
  not lost.

---

## 7. Sensitivity notes

A backup is effectively a complete clone of the system's data. Anyone who
obtains a backup file gains access to:

- All patient/case records and owner personal information.
- All uploaded attachments and profile/ID photos.
- The full `users` table, including bcrypt password hashes and **plaintext TOTP
  two-factor secrets**.
- Session tokens that were active at backup time.

Passwords are bcrypt-hashed (so they are not immediately readable), but the
two-factor secrets and all personal data are not. Because backups are currently
unencrypted, store and transfer them carefully:

- Keep backup files on the server and limit who can download them.
- Treat any copy that leaves the server (cloud storage, a laptop, email, a USB
  drive, an old disk snapshot) as sensitive and protect it accordingly.
- Delete copies you no longer need.

For the current security posture and deployment guidance, see
[`SECURITY_NOTES.md`](../SECURITY_NOTES.md) and
[`OPERATIONS.md`](OPERATIONS.md).
