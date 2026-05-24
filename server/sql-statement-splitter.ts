/**
 * Split a `.sql` migration script into individual statements.
 *
 * The naive `.split(/;\s*\n/)` we used previously incorrectly tore SQLite
 * `CREATE TRIGGER ... BEGIN ... END;` blocks apart, because the trigger
 * body contains its own semicolons. This implementation:
 *
 * - Strips `--` line comments and `/* ... *\/` block comments.
 * - Honors single-quoted string literals (`''` for escaped quotes).
 * - Recognizes `BEGIN ... END;` blocks (used by SQLite triggers and
 *   `DO $$ BEGIN ... END $$;` is not supported — we only need SQLite
 *   trigger bodies here).
 *
 * It is deliberately not a full SQL parser; it only needs to be correct
 * for the dialects we actually ship in `migrations/` and `migrations-pg/`.
 */
export function splitSqlStatements(script: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let inLineComment = false;
  let inBlockComment = false;
  let beginDepth = 0;

  const len = script.length;
  const isWordBoundary = (ch: string | undefined) =>
    ch === undefined || /[^A-Za-z0-9_]/.test(ch);

  const matchKeyword = (keyword: string): boolean => {
    const end = i + keyword.length;
    if (end > len) return false;
    if (script.slice(i, end).toUpperCase() !== keyword) return false;
    const before = i === 0 ? " " : script[i - 1];
    const after = script[end];
    return isWordBoundary(before) && isWordBoundary(after);
  };

  while (i < len) {
    const ch = script[i];
    const next = script[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    if (inSingle) {
      buf += ch;
      if (ch === "'" && next === "'") {
        buf += next;
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }

    if (ch === "-" && next === "-") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf += ch;
      i++;
      continue;
    }

    if (beginDepth === 0 && matchKeyword("BEGIN")) {
      buf += script.slice(i, i + 5);
      i += 5;
      beginDepth = 1;
      continue;
    }
    if (beginDepth > 0 && matchKeyword("END")) {
      buf += script.slice(i, i + 3);
      i += 3;
      beginDepth = 0;
      while (i < len && /\s/.test(script[i] ?? "")) {
        buf += script[i++];
      }
      if (script[i] === ";") {
        buf += ";";
        i++;
      }
      out.push(buf.trim());
      buf = "";
      continue;
    }

    if (ch === ";" && beginDepth === 0) {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = "";
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  const trailing = buf.trim();
  if (trailing) out.push(trailing);
  return out;
}
