# Intel Cloud (Player Intelligence)

Connection Guard Intel has two parts:
- **Intel Local:** the signed IP lists the plugin evaluates on the server (connection-guard-intel).
- **Intel Cloud:** a separate, private service. Its first product is Player Intelligence: one report per Minecraft account with five parts:
  1. punishments
  2. account history
  3. gameplay
  4. alts
  5. server history

  It also takes crowd contributions from linked servers.

Reports inform staff. They never decide: there is no score, and Connection Guard never denies a login because of one. That keeps privacy §8 ("no automated decisions about players") true.

## What lives where

| Part | Where |
|---|---|
| Protocol (zod) and fixtures for the plugin | `packages/protocol/src/intel.ts`, `intel-examples.ts`, `fixtures/intel-*.json` (public, here) |
| Plugin routes `POST /v1/intel/lookup`, `POST /v1/intel/contributions` | `apps/api/src/intel.ts`: install auth, linked check, rate limit, then the `INTEL` Service Binding |
| Dashboard routes | `apps/api/src/intel.ts`:<br>• `GET/PUT /api/networks/:id/intel` (settings, keys, offer)<br>• `POST/DELETE /api/networks/:id/intel/keys`<br>• `GET /api/networks/:id/players/:uuid/intel` |
| Dashboard page | `/n/:id/players` (`apps/web/src/routes/PlayersPage.tsx`): lookup by name or UUID, the report, the sharing switch, API keys and sources. The Players tab appears once Intel Cloud offers Player Intelligence; decisions link to the report of verified players. |
| Network keys and the opt-out | cg tables `network_api_keys` and `network_intel` (migration 0010) |
| The service itself | private repository `connection-guard-intel-cloud`:<br>• Worker with entrypoint `IntelRpc`<br>• D1 `cg-intel` (EU)<br>• queues, Durable Objects, R2<br>• public API on `intel-cloud.connectionguard.net` |

Intel Cloud reads cg through a read-only binding (links, agreement acceptances, keys, opt-outs). It never writes it.

## Who can use it

- Only servers linked to a network. Unlinked servers get `403 not_linked` and never send a UUID.
- Only networks where an owner or admin accepted the agreement version that covers Player Intelligence: `INTEL_SINCE_DPA` in Intel Cloud, which equals `DPA_VERSION` here once the texts are published. Until then everyone gets `403 agreement_required`.
- Self-hosted Connection Guard Cloud has no `INTEL` binding. The plugin routes then answer `503 intel_unavailable`, and the plugin shows Player Intelligence as not available.

## Contributions

Contributing is on by default for linked networks once they accept the agreement version above. Owners and admins can turn it off in the dashboard (`PUT /api/networks/:id/intel`). The plugin has its own switch as well.

Intel Cloud checks the link, the agreement and the opt-out again before it writes anything.

Unlinking a server or deleting a network tells Intel Cloud right away. Its daily purge catches anything missed.

## Rollout order (docs/OPERATIONS.md of the operations workspace)

1. Deploy Intel Cloud (done 28 Nov 2026; nobody can use it yet).
2. Merge and deploy this Worker with migration 0010.
3. Publish the legal texts (privacy policy, AVV, terms, and the DPIA on file). Set `DPA_VERSION` here and `INTEL_SINCE_DPA` in Intel Cloud to that version, and rewrite the agreement banner (`apps/web/src/components/DpaUpdate.tsx`) for it.
4. Release the plugin with Player Intelligence.

## Running both locally

`wrangler dev` can run this Worker and Intel Cloud in one process, so the Service Binding connects. Use a copy of `apps/api/wrangler.jsonc` with the `services` entry from `env.production`, and a copy of Intel Cloud's config whose `CG` database has this config's local `database_id`, so both read the same local D1:

```bash
wrangler dev -c api.local.jsonc -c intel.local.jsonc --local --persist-to <dir>
```

Apply both sets of migrations to `<dir>` first, then `node scripts/seed-demo.mjs <url>` for a synthetic network.
