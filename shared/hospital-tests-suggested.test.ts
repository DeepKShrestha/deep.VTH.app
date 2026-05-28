import { describe, expect, it } from "vitest";
import {
  parseTestsSuggestedOptions,
  panelSubQuestionKeyFromLabel,
  resolvePanelDefinitions,
  serializeTestsSuggestedOptions,
} from "./hospital-tests-suggested";

describe("hospital-tests-suggested", () => {
  it("parses string and panel options", () => {
    const parsed = parseTestsSuggestedOptions([
      "CBC",
      { type: "panel", label: "Hormone Panel Test", panelKey: "hormonePanelTests" },
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]).toMatchObject({ type: "panel", panelKey: "hormonePanelTests" });
  });

  it("builds panel key from label", () => {
    expect(panelSubQuestionKeyFromLabel("Hormone Panel Test")).toBe("hormonePanelTest");
  });

  it("resolves legacy enzyme panel from string option", () => {
    const defs = resolvePanelDefinitions(
      ["Enzyme Panel Test"],
      [{ key: "enzymePanelTests", label: "Enzyme Panel Tests", inputType: "multiSelect" }],
    );
    expect(defs.some((d) => d.panelKey === "enzymePanelTests")).toBe(true);
  });

  it("round-trips serialized options", () => {
    const raw = serializeTestsSuggestedOptions([
      "CBC",
      { type: "panel", label: "Hormone Panel", panelKey: "hormonePanelTests" },
    ]);
    const parsed = parseTestsSuggestedOptions(raw);
    expect(parsed).toHaveLength(2);
  });
});
