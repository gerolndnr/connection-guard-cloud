// Flip to true on the day plugin 0.5 is published (with the cloud link), then build and deploy the site.
// Until then, every dashboard mention carries a "0.5" chip and future tense; afterwards the chips go,
// the copy turns present tense and the navigation links to the dashboard.
export const DASHBOARD_RELEASED = true;
/** Plugin version the guides were last checked against; update it when a guide is re-verified. */
export const GUIDES_VERIFIED_FOR = "0.5.0";
export const DASHBOARD_URL = "https://app.connectionguard.net";

/**
 * Download funnel test. "test": each page load shows one of two flows at random (no storage, so a visitor may see
 * both): "page" sends the download button to /download, "direct" downloads the JAR from Modrinth's CDN right away and
 * offers "Other download options". Events carry download_flow; see docs/ANALYTICS.md. Set "page" or "direct" to end it.
 */
export const DOWNLOAD_FLOW: "test" | "page" | "direct" = "test";
