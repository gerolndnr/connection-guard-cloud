// Versions of the data processing agreement (DPA/AVV) and what they allow.
import type { Env } from "./env.ts";

/**
 * Player names in decisions need this DPA version or newer: it added "the name the player reported at login" to the
 * data categories. Networks that accepted only an older version get their decisions stored without names.
 */
export const NAMES_SINCE_DPA = "2026-11-28";

/** Versions are ISO dates, so a string comparison orders them. */
export async function acceptedSince(env: Env, networkId: string, version: string): Promise<boolean> {
  return Boolean(await env.DB.prepare("SELECT 1 FROM dpa_acceptances WHERE network_id = ? AND version >= ? LIMIT 1")
    .bind(networkId, version).first());
}
