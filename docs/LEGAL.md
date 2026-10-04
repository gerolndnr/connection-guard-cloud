# Legal texts

Status 2026-10-04: the operator lives in Germany. Drafts are written and in the site; a review by a qualified person is still recommended.

| Text | Where | Status |
| --- | --- | --- |
| Impressum (§ 5 DDG, § 18 Abs. 2 MStV) | `apps/site/src/pages/impressum.astro`, English `legal-notice.astro` | Live; operator details in `apps/site/src/data/operator.ts` (the production build fails if they are missing) |
| Datenschutzerklärung | `apps/site/src/pages/datenschutz.astro` (binding), English `privacy.astro` | Live |
| Data processing agreement (AVV, Art. 28) | `apps/site/src/pages/avv.astro` (binding), English `dpa.astro` | Written, version 2026-10-04; accepted with the terms when linking a server |
| Terms of service | `apps/site/src/pages/nutzungsbedingungen.astro` (binding), English `terms.astro` | Written, version 2026-10-04; accepted when linking, referenced at sign-in |

All legal pages are linked from every website page and from the dashboard footer. Keep `LEGAL_UPDATED` in `operator.ts` current when changing them. Terms and AVV share one version: `LEGAL_VERSION` in `operator.ts` must equal `DPA_VERSION` in `apps/api/wrangler.jsonc` (the site build fails otherwise). Raising it makes the next person who links a server accept again; announce sub-processor changes 30 days ahead (AVV section 6). Update the privacy policy when adding a processor, cookie or tracking (for example Turnstile, which is not active yet).

## Original checklist

1. **Privacy policy** for app.connectionguard.net and connectionguard.net. It covers:
   - the data in the table in the plugin's `docs/CLOUD.md`
   - Discord login data (ID, name, avatar)
   - Cloudflare as sub-processor (EU jurisdiction for D1; Analytics Engine without personal data)
   - PostHog (EU cloud) as sub-processor for product analytics: website cookieless (daily hash, no profile), dashboard usage linked to the random account ID with masked session replay and opt-out, server lifecycle events without player data; legal basis to be reviewed (legitimate interest), DPA with PostHog to be signed; see `docs/ANALYTICS.md`
   - retention (30 days, 13 months, 30 days for unlinked installs)
   - data subject rights and contact (`privacy@connectionguard.net`)
2. **Data processing agreement (DPA / AVV)** accepted when linking. Its version string is `DPA_VERSION` in `apps/api/wrangler.jsonc`. Changing it asks the next linker to accept again.
3. **Legal notice (Impressum)**, if required for the owner's residence.
4. **Terms of service** for the free dashboard: no warranty, fair use, account deletion.

Until these exist, the dashboard must not be announced publicly.
