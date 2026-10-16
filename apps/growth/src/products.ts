/**
 * The products in mc-antivpn-bench (products/*.json) and their public bStats projects, one per platform.
 * Checked against bStats' plugin list and each project's owner and software on 16 Oct 2026.
 * VPNGuard is in the benchmark but has no bStats project.
 */
export type Platform = "bukkit" | "bungeecord" | "velocity";
export type Project = { id: number; name: string; platform: Platform };
export type Product = { key: string; name: string; own?: boolean; legacy?: boolean; projects: Project[] };

export const PRODUCTS: Product[] = [
  { key: "connection-guard", name: "Connection Guard", own: true, projects: [
    { id: 22911, name: "Connection Guard", platform: "bukkit" },
    { id: 22912, name: "Connection Guard", platform: "bungeecord" },
    { id: 22913, name: "Connection Guard", platform: "velocity" },
  ] },
  // The predecessor: its Spigot page points to Connection Guard. Shown on its own to see the migration.
  { key: "lndnr-anti-vpn", name: "LNDNR Anti-VPN (predecessor)", own: true, legacy: true, projects: [
    { id: 21881, name: "lndnr-anti-vpn", platform: "bukkit" },
  ] },
  { key: "foxgate", name: "FoxGate", projects: [
    { id: 22142, name: "FoxAntiVPN", platform: "bukkit" },
    { id: 22460, name: "FoxGate-Bungeecord", platform: "bungeecord" },
    { id: 22969, name: "FoxGate-Velocity", platform: "velocity" },
  ] },
  { key: "advancedantivpn", name: "AdvancedAntiVPN", projects: [
    { id: 14734, name: "AdvancedAntiVPN", platform: "bukkit" },
    { id: 15548, name: "AdvancedAntiVPN", platform: "bungeecord" },
    { id: 15876, name: "AdvancedAntiVPN", platform: "velocity" },
  ] },
  { key: "kaurivpn", name: "KauriVPN", projects: [
    { id: 12615, name: "KauriVPN", platform: "bukkit" },
    { id: 12616, name: "KauriVPN", platform: "bungeecord" },
    { id: 12791, name: "KauriVPN", platform: "velocity" },
  ] },
  { key: "jarvis", name: "Jarvis AntiVPN", projects: [
    { id: 31883, name: "Jarvis AntiVPN", platform: "bukkit" },
    { id: 31796, name: "Jarvis AntiVPN", platform: "bungeecord" },
    { id: 31671, name: "Jarvis AntiVPN", platform: "velocity" },
  ] },
  { key: "proxyshield", name: "ProxyShield", projects: [
    { id: 33736, name: "ProxyShield", platform: "bukkit" },
  ] },
];

/** In the benchmark, but not on bStats. */
export const NOT_ON_BSTATS = ["VPNGuard"];

export const bstatsPage = (p: Project) => `https://bstats.org/plugin/${p.platform}/${encodeURIComponent(p.name)}/${p.id}`;
