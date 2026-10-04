// Platform landing pages. Facts follow the released plugin's quickstarts (docs/quickstarts in gerolndnr/connection-guard).
export type Faq = { q: string; a: string };
export type Platform = {
  slug: "velocity" | "bungeecord" | "paper";
  path: string;
  name: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
  facts: [string, string][];
  whereTitle: string;
  where: string[];
  console: string;
  faq: Faq[];
};

const shared: Faq[] = [
  { q: "Is Connection Guard free?", a: "Yes. The plugin is free and open source under the MIT license, and no Connection Guard account is needed. The detection services you choose have their own free plans and limits." },
  { q: "Will it slow down logins?", a: "A new IP address is checked once during login with the services you enabled. With caching enabled, unexpired answers can be reused for the same address (VPN results for 24 hours and country results for 72 hours by default), reducing repeat lookups." },
  { q: "Can I warn staff instead of kicking players?", a: "Yes. Set kick-player to false and notify-staff to true for VPN or country rules. Staff with connectionguard.notify.vpn or connectionguard.notify.geo then see an alert, and you can also post to a Discord webhook." },
  { q: "Can I let specific players through?", a: "Yes. Add their UUID or IP address under behavior.vpn.exemptions and behavior.geo.exemptions. Permission-based exemptions use LuckPerms and need the matching use-permission-exemption switch." },
];

export const PLATFORMS: Platform[] = [
  {
    slug: "velocity",
    path: "/velocity-anti-vpn",
    name: "Velocity",
    title: "Velocity Anti-VPN Plugin: Free and Open Source | Connection Guard",
    description: "Block VPN and proxy connections on your Velocity proxy. Connection Guard is a free, open-source anti-VPN plugin for Velocity with country rules and caching.",
    h1: "Anti-VPN for Velocity",
    lede: "Install Connection Guard once on your Velocity proxy and every player is checked before they reach a backend server. Free, open source, and you choose the detection services.",
    facts: [["Install on", "The Velocity proxy"], ["Java", "17 or newer"], ["Velocity API", "3.3"], ["Checked", "At login, before any backend"]],
    whereTitle: "Why check at the proxy",
    where: [
      "Players connect to Velocity first, so the proxy sees their real address. Checking there covers the whole network with one installation instead of one per backend.",
      "A refused player never reaches a backend server, and every backend shares the same cache, rules and quota.",
      "Backends behind the proxy don't need Connection Guard. They should only accept connections forwarded by Velocity, which Connection Guard doesn't replace.",
    ],
    console: "cg info 203.0.113.7",
    faq: [
      { q: "Do I need to install it on my backend servers too?", a: "No. Install Connection Guard on the Velocity proxy that receives player connections. Configure your backends to accept only forwarded connections from the proxy, as Velocity documents; Connection Guard doesn't replace that setup." },
      { q: "Which Java version does the Velocity version need?", a: "Java 17 or newer. The Velocity adapter targets the Velocity 3.3 API. Follow Velocity's own Java requirements, which may be newer." },
      ...shared,
    ],
  },
  {
    slug: "bungeecord",
    path: "/bungeecord-anti-vpn",
    name: "BungeeCord",
    title: "BungeeCord & Waterfall Anti-VPN Plugin | Connection Guard",
    description: "Block VPNs, proxies and countries on your BungeeCord or Waterfall network. Free, open-source anti-VPN plugin, installed once on the proxy.",
    h1: "Anti-VPN for BungeeCord and Waterfall",
    lede: "One installation on your BungeeCord proxy checks every player before they reach a backend. Free, open source, with country rules and the detection services you choose.",
    facts: [["Install on", "The BungeeCord proxy"], ["Java", "8 or newer"], ["Works with", "BungeeCord, Waterfall"], ["Checked", "At login, before any backend"]],
    whereTitle: "Why check at the proxy",
    where: [
      "The proxy receives every player connection with the real client address. One installation covers every server in the network.",
      "Checking once at the proxy avoids duplicate lookups on each backend, so your detection quota lasts longer.",
      "Backend servers don't need a copy. Make sure they only accept connections from your proxy; Connection Guard doesn't replace that.",
    ],
    console: "cg info 203.0.113.7",
    faq: [
      { q: "Does it work on Waterfall?", a: "Connection Guard ships one JAR for BungeeCord-based proxies, and the release lists Waterfall as a supported loader. Test on your own proxy version before going live." },
      { q: "Do I need to install it on my backend servers too?", a: "No. Install it on the proxy that receives player connections. Backends behind the proxy only need to be locked to the proxy, which you configure in BungeeCord and your server software." },
      ...shared,
    ],
  },
  {
    slug: "paper",
    path: "/paper-anti-vpn",
    name: "Paper and Spigot",
    title: "Paper & Spigot Anti-VPN Plugin | Connection Guard",
    description: "Block VPN, proxy and country connections on your Paper or Spigot server. Free, open-source anti-VPN plugin with caching, staff alerts and Discord webhooks.",
    h1: "Anti-VPN for Paper and Spigot",
    lede: "Drop one JAR into your server's plugins folder and new players are checked for VPNs, proxies and country rules at login. Free, open source, no account.",
    facts: [["Install on", "Your Paper or Spigot server"], ["Java", "8 or newer"], ["Built against", "Spigot API 1.8.8"], ["Checked", "At login"]],
    whereTitle: "Single server or network?",
    where: [
      "On a single Paper or Spigot server, install Connection Guard in that server's plugins folder.",
      "Running a network behind BungeeCord or Velocity? Install it on the proxy instead. The proxy sees the real player address and one installation covers every backend.",
      "The plugin builds against the Spigot 1.8.8 API. 0.5.0 has native login/rule fixtures on Paper and Folia 1.21.11, plus startup, help, reload and shutdown checks on Paper 26.3 build 151 and Folia 26.2 build 7 with Java 25. Build targets do not prove every intermediate version was tested.",
    ],
    console: "/cg info 203.0.113.7",
    faq: [
      { q: "Which Minecraft versions are supported?", a: "The 0.5.0 listings reach Minecraft 26.3. Native login/rule fixtures cover Paper/Folia 1.21.11 with Java 21; additional startup, help, reload and shutdown checks cover Paper 26.3 and Folia 26.2 with Java 25. This does not prove every intermediate version or authenticated-account scenario." },
      { q: "Does it work on Folia?", a: "0.5.0 passed native login/rule fixtures on Folia 1.21.11 and startup, help, reload and shutdown checks on Folia 26.2 build 7 with Java 25. These checks do not prove every server version or authenticated-account scenario." },
      ...shared,
    ],
  },
];
