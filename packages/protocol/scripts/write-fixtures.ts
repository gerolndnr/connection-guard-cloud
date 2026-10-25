import { writeFileSync, mkdirSync } from "node:fs";
import { installRequest, syncRequest, syncRequestWithErrors, syncResponse } from "../src/examples.ts";
import { InstallRequest, SyncRequest, SyncResponse } from "../src/index.ts";

const out = new URL("../fixtures/", import.meta.url);
mkdirSync(out, { recursive: true });
const write = (name: string, value: unknown) => writeFileSync(new URL(name, out), JSON.stringify(value, null, 2) + "\n");

write("install-request.json", InstallRequest.parse(installRequest));
write("sync-request.json", SyncRequest.parse(syncRequest));
// A 0.5.2 sync with one aggregated error report (cloud.error-reports): class names and own frames only, no message.
write("sync-request-errors.json", SyncRequest.parse(syncRequestWithErrors));
write("sync-response.json", SyncResponse.parse(syncResponse));
// A response with an unknown command type: the plugin must reject the command, not the whole response.
write("sync-response-unknown-command.json", { ...syncResponse, config: null, commands: [{ id: "cmd_zzzzzzzzzzzz", type: "console.execute", command: "op attacker" }] });
// A desired config that tries to set a console command: the plugin must refuse the whole config.
write("sync-response-forbidden-config.json", { ...syncResponse, commands: [], config: { version: 3, reset: false, keep_secrets: [],
  values: { "operation.mode": "ENFORCE", "behavior.vpn.execute-command.enabled": true, "behavior.vpn.execute-command.command": "op attacker" } } });
