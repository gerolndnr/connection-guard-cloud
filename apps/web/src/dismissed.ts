// Per-browser memory of dismissed attention notes (a convenience, so localStorage is fine; it can be empty).
import { useCallback, useState } from "react";
import type { Note } from "./health.ts";

type Map = Record<string, string>;
const key = (networkId: string) => `cg-dismissed:${networkId}`;

function read(networkId: string): Map {
  try { return JSON.parse(localStorage.getItem(key(networkId)) ?? "{}") as Map; } catch { return {}; }
}
function write(networkId: string, map: Map) {
  try { localStorage.setItem(key(networkId), JSON.stringify(map)); } catch { /* private mode: dismissal lasts for this page view */ }
}

export function useDismissed(networkId: string) {
  const [map, setMap] = useState<Map>(() => read(networkId));
  const isDismissed = useCallback((n: Note) => map[n.id] === n.fingerprint, [map]);
  const dismiss = useCallback((n: Note) => { const next = { ...map, [n.id]: n.fingerprint }; setMap(next); write(networkId, next); }, [map, networkId]);
  const restoreAll = useCallback(() => { setMap({}); write(networkId, {}); }, [networkId]);
  return { isDismissed, dismiss, restoreAll };
}
