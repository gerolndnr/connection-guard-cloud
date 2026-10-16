# Growth worker

Every morning at 05:00 UTC a mail to the owner with the bStats numbers of Connection Guard and the other products in
mc-antivpn-bench: servers (24-hour average) and their change over 1, 7 and 30 days, share, players and a 30-day
sparkline. The products and their bStats project IDs are in `src/products.ts`; VPNGuard has no bStats project.

- **Stateless:** bStats keeps more than 30 days of half-hourly points, so nothing is stored.
- **Mail:** Cloudflare Email Routing (`send_email` binding) from `growth@connectionguard.net`. It only delivers to
  verified destination addresses of the account; to change `MAIL_TO`, verify the address in Cloudflare first and update
  both `vars.MAIL_TO` and `send_email[0].destination_address` in `wrangler.jsonc`.
- **Send now / preview:** with the `RUN_TOKEN` secret, `POST /run` sends the mail and `GET /preview` shows it
  (`Authorization: Bearer <token>`). Without the token every request is a 404.

```bash
pnpm --filter @cg/growth test
pnpm --filter @cg/growth deploy
```
