// Operator details for the legal notice (§ 5 DDG, § 18 Abs. 2 MStV) and the privacy policy.
// The address is a c/o address of an address service that forwards mail reliably ("ladungsfähige Anschrift").
// Every field must be filled in: `assertOperator()` fails the production build otherwise, so a placeholder can
// never go live.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

export const LEGAL_UPDATED = "2026-10-06";
/** Version of the terms of service and the data processing agreement. Must equal DPA_VERSION in apps/api/wrangler.jsonc. */
export const LEGAL_VERSION = "2026-10-04";

export function assertOperator() {
  const missing = [
    ["name", OPERATOR.name], ["careOf", OPERATOR.careOf], ["street", OPERATOR.street], ["postalCity", OPERATOR.postalCity],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length && import.meta.env.PROD) {
    throw new Error(`Legal pages need operator details in src/data/operator.ts: ${missing.join(", ")}`);
  }
  // The dashboard asks operators to accept DPA_VERSION; the published texts must carry the same version.
  const versions = [...readFileSync(resolve(process.cwd(), "../api/wrangler.jsonc"), "utf8").matchAll(/"DPA_VERSION":\s*"([^"]+)"/g)].map((m) => m[1]);
  if (versions.some((v) => v !== LEGAL_VERSION)) {
    throw new Error(`LEGAL_VERSION ${LEGAL_VERSION} differs from DPA_VERSION in apps/api/wrangler.jsonc (${versions.join(", ")})`);
  }
  return missing;
}

export function addressLines(lang: "de" | "en") {
  return [OPERATOR.name, OPERATOR.careOf, OPERATOR.street, OPERATOR.postalCity, lang === "de" ? OPERATOR.countryDe : OPERATOR.countryEn]
    .map((l) => l || "[missing]");
}
