// Categories, not named products: each cell describes a common setup reviewed in October 2026.
export type Cell = { text: string; tone: "yes" | "no" | "varies" };
export const COLUMNS = ["Connection Guard", "Typical paid plugin", "Typical hosted service"] as const;
// `proof` points at the section of the page that shows the Connection Guard answer.
export const ROWS: { label: string; cells: [Cell, Cell, Cell]; soon?: boolean; proof?: string }[] = [
  { label: "Price", cells: [{ text: "Free", tone: "yes" }, { text: "One-time purchase", tone: "varies" }, { text: "Subscription or limited free tier", tone: "varies" }] },
  { label: "Source code", proof: "#open-source", cells: [{ text: "Open source, MIT", tone: "yes" }, { text: "Usually closed", tone: "no" }, { text: "Closed", tone: "no" }] },
  { label: "Account required", proof: "#setup", cells: [{ text: "No", tone: "yes" }, { text: "No", tone: "yes" }, { text: "Yes", tone: "no" }] },
  { label: "Detection services", cells: [{ text: "Your choice: ProxyCheck, IP-API, IPHub, VPNAPI or your own", tone: "yes" }, { text: "Several built in", tone: "varies" }, { text: "The service's own", tone: "varies" }] },
  { label: "Country rules", cells: [{ text: "Block list or allow list", tone: "yes" }, { text: "Often", tone: "varies" }, { text: "Often", tone: "varies" }] },
  { label: "Runs on", proof: "#platforms", cells: [{ text: "One JAR for Paper, Spigot, BungeeCord and Velocity", tone: "yes" }, { text: "Varies by plugin", tone: "varies" }, { text: "Via its own plugin", tone: "varies" }] },
  { label: "Explains each decision", proof: "#dashboard", cells: [{ text: "Every provider vote and rule, in plain English", tone: "yes" }, { text: "Varies", tone: "varies" }, { text: "Varies", tone: "varies" }], soon: true },
  { label: "Web dashboard", proof: "#dashboard", cells: [{ text: "Optional and free", tone: "yes" }, { text: "Usually commands only", tone: "no" }, { text: "Yes", tone: "yes" }], soon: true },
  { label: "If the cloud is down", cells: [{ text: "Logins never wait on it", tone: "yes" }, { text: "No cloud involved", tone: "yes" }, { text: "Depends on the service", tone: "varies" }] },
];
