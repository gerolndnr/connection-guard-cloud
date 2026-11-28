import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PunishmentCategory } from "../src/intel.ts";
import { REASON_CASES } from "../src/reason-examples.ts";
import { REASON_RULES, classifyReason, normalizeReason } from "../src/reasons.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

describe("punishment reasons", () => {
  it.each(REASON_CASES)("$reason → $category", ({ reason, category }) => {
    expect(classifyReason(reason)).toBe(category);
  });

  it("writes rules and cases into the fixtures the plugin ships", () => {
    expect(fixture("punishment-reasons.json")).toEqual(REASON_RULES);
    expect(fixture("punishment-reason-cases.json")).toEqual(REASON_CASES);
  });

  it("keeps every term in normalized form, so the Java classifier needs no normalization of its own rules", () => {
    for (const rule of REASON_RULES.rules) {
      expect(PunishmentCategory.options).toContain(rule.category);
      for (const term of rule.terms) {
        expect(term, term).toMatch(/^\S+( \S+)*$/);
        for (const word of term.split(" ")) {
          const plain = word.replace(/^\*|\*$/g, "");
          // A wildcard on one or two letters would match almost anything.
          expect(plain.length, term).toBeGreaterThanOrEqual(word === plain ? 1 : 3);
          expect(normalizeReason(plain), term).toEqual([plain]);
        }
      }
    }
    for (const stock of REASON_RULES.unknown) expect(normalizeReason(stock).join(" "), stock).toBe(stock);
  });

  it("reads colour codes, accents and special letters the same way everywhere", () => {
    expect(normalizeReason("&4&lBan-Umgehung §r(30d) &#ff00aaÄußerung")).toEqual(["ban", "umgehung", "30d", "ausserung"]);
    expect(normalizeReason("Kradzież ŁUPÓW ırkçılık ØÆŒ")).toEqual(["kradziez", "lupow", "irkcilik", "oaeoe"]);
    expect(normalizeReason("x".repeat(600))).toEqual(["x".repeat(512)]);
  });

  it("puts a hacked account before cheating and evasion before the offence it evades", () => {
    expect(classifyReason("hacked account, was cheating?")).toBe("other");
    expect(classifyReason("alt account used for xray")).toBe("evasion");
    expect(classifyReason("Anticheat bypass")).toBe("cheating");
  });
});
