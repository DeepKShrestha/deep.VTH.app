const Database = require("better-sqlite3");
const db = new Database("D:/Projects/VTH-app/data.db");
const rows = db
  .prepare(
    "SELECT id, case_number, custom_fields FROM cases WHERE case_number LIKE 'CASE-%' ORDER BY id DESC LIMIT 5",
  )
  .all();
for (const r of rows) {
  console.log("---", r.case_number, "id", r.id);
  try {
    const j = JSON.parse(r.custom_fields || "{}");
    console.log("keys:", Object.keys(j));
    if (j.testsSuggested != null) console.log("testsSuggested:", j.testsSuggested);
  } catch (e) {
    console.log("parse err", e.message, String(r.custom_fields).slice(0, 120));
  }
}
