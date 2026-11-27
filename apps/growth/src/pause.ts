/** True before the UTC day `until` ("YYYY-MM-DD"); a missing or unreadable date never pauses. */
export function paused(until: string | undefined, now: number): boolean {
  if (!until) return false;
  const end = Date.parse(`${until}T00:00:00Z`);
  return Number.isFinite(end) && now < end;
}
