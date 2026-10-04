// Operator details for the legal notice (§ 5 DDG, § 18 Abs. 2 MStV) and the privacy policy.
// The address is a c/o address of an address service that forwards mail reliably ("ladungsfähige Anschrift").
// Every field must be filled in: `assertOperator()` fails the production build otherwise, so a placeholder can
// never go live.
export const OPERATOR = {
  name: "",
  careOf: "", // e.g. "c/o Example Impressum Service"
  street: "",
  postalCity: "", // e.g. "10115 Berlin"
  countryDe: "Deutschland",
  countryEn: "Germany",
  email: "legal@connectionguard.net",
  privacyEmail: "privacy@connectionguard.net",
  /** Data protection authority of the operator's federal state (Art. 77 GDPR). */
  authority: { name: "", url: "" },
};

export const LEGAL_UPDATED = "2026-10-04";

export function assertOperator() {
  const missing = [
    ["name", OPERATOR.name], ["careOf", OPERATOR.careOf], ["street", OPERATOR.street], ["postalCity", OPERATOR.postalCity],
    ["authority.name", OPERATOR.authority.name], ["authority.url", OPERATOR.authority.url],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length && import.meta.env.PROD) {
    throw new Error(`Legal pages need operator details in src/data/operator.ts: ${missing.join(", ")}`);
  }
  return missing;
}

export function addressLines(lang: "de" | "en") {
  return [OPERATOR.name, OPERATOR.careOf, OPERATOR.street, OPERATOR.postalCity, lang === "de" ? OPERATOR.countryDe : OPERATOR.countryEn]
    .map((l) => l || "[missing]");
}
