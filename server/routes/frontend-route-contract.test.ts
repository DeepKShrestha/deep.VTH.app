import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readAppSource() {
  const appPath = path.resolve(import.meta.dirname, "../../client/src/App.tsx");
  return fs.readFileSync(appPath, "utf8");
}

describe("frontend strict route namespacing contract", () => {
  it("keeps namespaced AST and hospital detail/print routes", () => {
    const source = readAppSource();
    expect(source).toContain('path="/ast-report/cases/:id"');
    expect(source).toContain('path="/new-case/cases/:id"');
    expect(source).toContain('path="/ast-report/print/:id"');
    expect(source).toContain('path="/new-case/print/:id"');
  });

  it("keeps legacy shared routes as redirects (not active pages)", () => {
    const source = readAppSource();
    expect(source).toContain('path="/cases/:id"');
    expect(source).toContain('path="/print/:id"');
    expect(source).toContain('<Redirect to="/ast-report/cases" />');
  });

  it("uses explicit scope for module case lists", () => {
    const source = readAppSource();
    expect(source).toContain('<CaseList backHref="/new-case" scope="hospital" />');
    expect(source).toContain('<CaseList backHref="/ast-report" scope="ast" />');
  });
});

