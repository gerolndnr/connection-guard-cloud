// Structured data (schema.org JSON-LD) shared by all pages. Only facts we can back up: no ratings, no review counts.
import stats from "../data/stats.json";

export const SITE = "https://connectionguard.net";
export const NAME = "Connection Guard";

export const PROFILES = {
  github: "https://github.com/gerolndnr/connection-guard",
  modrinth: "https://modrinth.com/plugin/connectionguard",
  spigot: "https://www.spigotmc.org/resources/121509/",
  hangar: "https://hangar.papermc.io/gerolndnr/connection-guard",
  discord: "https://discord.gg/GekQVPqsfS",
};

const org = {
  "@type": "Organization",
  "@id": `${SITE}/#org`,
  name: NAME,
  url: SITE,
  logo: `${SITE}/icon-512.png`,
  sameAs: Object.values(PROFILES),
};

export function website() {
  return { "@type": "WebSite", "@id": `${SITE}/#website`, name: NAME, url: SITE, inLanguage: "en", publisher: { "@id": `${SITE}/#org` } };
}

export function software() {
  return {
    "@type": "SoftwareApplication",
    "@id": `${SITE}/#software`,
    name: NAME,
    alternateName: ["Connection Guard anti-VPN", "LNDNR's Anti-VPN & Geo-Blocking"],
    description: "Free, open-source anti-VPN, anti-proxy and country-blocking plugin for Minecraft servers on Paper, Spigot, BungeeCord and Velocity.",
    url: SITE,
    applicationCategory: "SecurityApplication",
    applicationSubCategory: "Minecraft server plugin",
    operatingSystem: "Java 8 or newer (Velocity: Java 17 or newer)",
    softwareRequirements: "Paper, Spigot, BungeeCord, Waterfall or Velocity",
    ...(stats.latest ? { softwareVersion: stats.latest.version, datePublished: stats.latest.published?.slice(0, 10) } : {}),
    downloadUrl: `${SITE}/download`,
    license: "https://opensource.org/licenses/MIT",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    codeRepository: PROFILES.github,
    publisher: { "@id": `${SITE}/#org` },
    image: `${SITE}/og/home.png`,
  };
}

export function breadcrumbs(items: [string, string][]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [["Home", "/"], ...items].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: new URL(path, SITE).toString() })),
  };
}

export function faq(items: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}

export function article(o: { title: string; description: string; path: string; published: string; modified: string; image: string }) {
  return {
    "@type": "TechArticle",
    headline: o.title,
    description: o.description,
    url: new URL(o.path, SITE).toString(),
    mainEntityOfPage: new URL(o.path, SITE).toString(),
    datePublished: o.published,
    dateModified: o.modified,
    inLanguage: "en",
    image: new URL(o.image, SITE).toString(),
    author: { "@id": `${SITE}/#org` },
    publisher: { "@id": `${SITE}/#org` },
    about: { "@id": `${SITE}/#software` },
  };
}

export function graph(...nodes: object[]) {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": [org, ...nodes] }).replace(/</g, "\\u003c");
}
