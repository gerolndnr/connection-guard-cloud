# Legal texts needed before public launch

These are not written here on purpose. They need review by someone qualified (EU/GDPR; German or Portuguese law depending on the owner's residence).

1. **Privacy policy** for app.connectionguard.net and connectionguard.net. It covers:
   - the data in the table in the plugin's `docs/CLOUD.md`
   - Discord login data (ID, name, avatar)
   - Cloudflare as sub-processor (EU jurisdiction for D1; Analytics Engine without personal data)
   - retention (30 days, 13 months, 30 days for unlinked installs)
   - data subject rights and contact (`privacy@connectionguard.net`)
2. **Data processing agreement (DPA / AVV)** accepted when linking. Its version string is `DPA_VERSION` in `apps/api/wrangler.jsonc`. Changing it asks the next linker to accept again.
3. **Legal notice (Impressum)**, if required for the owner's residence.
4. **Terms of service** for the free dashboard: no warranty, fair use, account deletion.

Until these exist, the dashboard must not be announced publicly.
