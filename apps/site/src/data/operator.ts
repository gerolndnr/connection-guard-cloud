// Operator details for the legal notice (§ 5 DDG, § 18 Abs. 2 MStV) and the privacy policy.
// The address is a c/o address of an address service that forwards mail reliably ("ladungsfähige Anschrift").
// Every field must be filled in: `assertOperator()` fails the production build otherwise, so a placeholder can
// never go live.
export const OPERATOR = {
  name: "Gero Lindner",
  careOf: "c/o SourceArt · VM-00003645",
  street: "Fritz-Thiele-Straße 3",
  postalCity: "28279 Bremen-Obervieland",
  countryDe: "Deutschland",
  countryEn: "Germany",
  email: "legal@connectionguard.net",
  privacyEmail: "privacy@connectionguard.net",
};

/** Official list of German data protection authorities (Art. 77 GDPR names no single one for data subjects). */
export const AUTHORITIES_URL = "https://www.bfdi.bund.de/DE/Service/Anschriften/Laender/Laender-node.html";

export const LEGAL_UPDATED = "2026-10-04";

export function assertOperator() {
  const missing = [
    ["name", OPERATOR.name], ["careOf", OPERATOR.careOf], ["street", OPERATOR.street], ["postalCity", OPERATOR.postalCity],
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
