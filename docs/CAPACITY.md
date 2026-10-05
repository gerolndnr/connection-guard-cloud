# Free-plan capacity

## Limits (Workers Free, per day, UTC)

| Resource | Limit |
| --- | --- |
| Worker requests | 100,000 |
| D1 rows written | 100,000 |
| D1 rows read | 5,000,000 |
| KV writes | 1,000 |
| Analytics Engine data points | 100,000 |

Since 2026-09-01, D1 queries fail when the daily limit is exceeded.

Queues are deliberately not used: the free plan allows only 10,000 operations a day.

## How we stay inside

- **Server-chosen sync interval.** Every response carries `next_sync_in`. The plugin never picks its own interval.
- **Governor** (`apps/api/src/governor.ts`). Every 5 minutes a cron counts active installs and sets `floor = max(60 s, installs × 86,400 / 40,000)`. Even if every install synced at the floor all day, plugin syncs would stay under 40,000 requests. The value lives in one KV key, which costs about 288 writes a day.
- **Idle unlinked installs** (no checks, nothing buffered) sync at `max(300 s, 3 × floor)`. Linked installs always sync at the floor, so a dashboard change reaches them within one floor interval even when nobody is online. The floor already assumes every active install syncs at it, so this stays inside the budget.
- **Fast, bounded windows** sync every 15 s:
  - a new, still unlinked install during its first 30 minutes (about 120 requests once per install)
  - a server with a pending settings change
  - a network that an owner or admin has open in the dashboard, on any page (10 minutes, extended at most once a minute while it is open), so a saved change applies within seconds
- **Few D1 writes per sync:**
  - the hourly rollup, only if there were checks
  - one event batch row, only for linked installs with events
  - the install row, only when its status changed or every 4 minutes
- **Event batches** are one gzip'd row per sync, not one row per login.
- **Analytics Engine** gets one data point per sync, with no personal data.

## Rough numbers

| Active installs | Floor | Worst-case syncs/day |
| --- | --- | --- |
| 50 | 60 s | 72,000 at the floor; realistically less than 25,000, because idle unlinked installs use 300 s |
| 300 | 65 s | 40,000 |
| 1,000 | 216 s | 40,000 |

When the network grows beyond what one interval per few minutes can serve, the dashboard gets slower updates. It never costs money and never affects logins. Going beyond that needs an explicit decision by the owner.

**Open item:** a 24-hour load test with 300 simulated installs is still to be run and recorded in `delivery/` of the operations workspace.
