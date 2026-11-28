import { writeFileSync, mkdirSync } from "node:fs";
import { installRequest, syncRequest, syncRequestWithErrors, syncRequestWithProbe, syncRequestWithSignals, syncResponse } from "../src/examples.ts";
import { InstallRequest, SyncRequest, SyncResponse } from "../src/index.ts";

const out = new URL("../fixtures/", import.meta.url);
mkdirSync(out, { recursive: true });
const write = (name: string, value: unknown) => writeFileSync(new URL(name, out), JSON.stringify(value, null, 2) + "\n");

write("install-request.json", InstallRequest.parse(installRequest));
write("sync-request.json", SyncRequest.parse(syncRequest));
// A 0.5.2 sync with one aggregated error report (cloud.error-reports): class names and own frames only, no message.
write("sync-request-errors.json", SyncRequest.parse(syncRequestWithErrors));
// A 0.6.2 sync closing a six-hour network-signal window: prefixes and counts only.
write("sync-request-signals.json", SyncRequest.parse(syncRequestWithSignals));
write("sync-request-probe.json", SyncRequest.parse(syncRequestWithProbe));
write("sync-response.json", SyncResponse.parse(syncResponse));
// A response with an unknown command type: the plugin must reject the command, not the whole response.
write("sync-response-unknown-command.json", { ...syncResponse, config: null, commands: [{ id: "cmd_zzzzzzzzzzzz", type: "console.execute", command: "op attacker" }] });
// A desired config that tries to set a console command: the plugin must refuse the whole config.
write("sync-response-forbidden-config.json", { ...syncResponse, commands: [], config: { version: 3, reset: false, keep_secrets: [],
  values: { "operation.mode": "ENFORCE", "behavior.vpn.execute-command.enabled": true, "behavior.vpn.execute-command.command": "op attacker" } } });

// Intel Cloud (Player Intelligence), see src/intel.ts.
import { contributionRequest, contributionResponse, fullReport, lookupRequest, lookupResponse } from "../src/intel-examples.ts";
import { IntelContributionRequest, IntelContributionResponse, IntelLookupRequest, IntelLookupResponse, parseContributions } from "../src/intel.ts";

write("intel-lookup-request.json", IntelLookupRequest.parse(lookupRequest));
write("intel-lookup-response.json", IntelLookupResponse.parse(lookupResponse));
write("intel-lookup-response-full.json", IntelLookupResponse.parse({ players: [fullReport], retry_in: null }));
// Every contribution kind once; each item must parse on its own (parseContributions).
const parsedItems = parseContributions(IntelContributionRequest.parse(contributionRequest).items);
if (parsedItems.rejected > 0) throw new Error("an example contribution does not parse");
write("intel-contribution-request.json", contributionRequest);
write("intel-contribution-response.json", IntelContributionResponse.parse(contributionResponse));

// Punishment reasons to categories (src/reasons.ts): the rules the plugin ships, and the cases both classifiers must pass.
import { REASON_RULES, classifyReason } from "../src/reasons.ts";
import { REASON_CASES } from "../src/reason-examples.ts";

for (const c of REASON_CASES) if (classifyReason(c.reason) !== c.category) throw new Error(`reason case fails: ${JSON.stringify(c)}`);
write("punishment-reasons.json", REASON_RULES);
write("punishment-reason-cases.json", REASON_CASES);
