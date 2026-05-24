import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "./sql-statement-splitter";

describe("splitSqlStatements", () => {
  it("splits simple statements on top-level semicolons", () => {
    const sql = `CREATE TABLE a (id INTEGER);\nCREATE TABLE b (id INTEGER);`;
    expect(splitSqlStatements(sql)).toEqual([
      "CREATE TABLE a (id INTEGER)",
      "CREATE TABLE b (id INTEGER)",
    ]);
  });

  it("ignores -- line comments", () => {
    const sql = `-- header\nCREATE TABLE a (id INTEGER); -- trailing\n-- standalone\nCREATE TABLE b (id INTEGER);`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("CREATE TABLE a");
    expect(statements[1]).toContain("CREATE TABLE b");
  });

  it("ignores /* */ block comments", () => {
    const sql = `/* block ;\nstill comment */ CREATE TABLE a (id INTEGER);`;
    expect(splitSqlStatements(sql)).toEqual(["CREATE TABLE a (id INTEGER)"]);
  });

  it("preserves semicolons inside string literals", () => {
    const sql = `INSERT INTO t (note) VALUES ('hello; world'); SELECT 1;`;
    const statements = splitSqlStatements(sql);
    expect(statements).toEqual([
      "INSERT INTO t (note) VALUES ('hello; world')",
      "SELECT 1",
    ]);
  });

  it("keeps SQLite CREATE TRIGGER ... BEGIN ... END; as a single statement", () => {
    const sql = `
DROP TRIGGER IF EXISTS fk_sessions_user_delete;
CREATE TRIGGER fk_sessions_user_delete
AFTER DELETE ON users
BEGIN
  DELETE FROM sessions WHERE user_id = OLD.id;
END;

DROP TRIGGER IF EXISTS fk_download_requests_user_delete;
CREATE TRIGGER fk_download_requests_user_delete
AFTER DELETE ON users
BEGIN
  DELETE FROM download_requests WHERE user_id = OLD.id;
END;
`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(4);
    expect(statements[0]).toMatch(/DROP TRIGGER IF EXISTS fk_sessions_user_delete/);
    expect(statements[1]).toMatch(/CREATE TRIGGER fk_sessions_user_delete/);
    expect(statements[1]).toMatch(/DELETE FROM sessions WHERE user_id = OLD\.id;/);
    expect(statements[1]).toMatch(/END;$/);
    expect(statements[2]).toMatch(/DROP TRIGGER IF EXISTS fk_download_requests_user_delete/);
    expect(statements[3]).toMatch(/CREATE TRIGGER fk_download_requests_user_delete/);
    expect(statements[3]).toMatch(/END;$/);
  });

  it("returns the final statement when the script has no trailing semicolon", () => {
    expect(splitSqlStatements("SELECT 1")).toEqual(["SELECT 1"]);
  });
});
