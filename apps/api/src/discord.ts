// Discord webhooks for network alerts. Only official Discord webhook URLs are accepted.
const WEBHOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,100}$/;

export const isDiscordWebhook = (url: string) => WEBHOOK.test(url);

/** "…/api/webhooks/1234/abcd…wxyz" → "…wxyz", enough to recognize it without exposing it. */
export const webhookHint = (url: string) => `…${url.slice(-4)}`;

export interface Embed {
  title: string;
  description: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  url?: string;
}

export const COLOR = { red: 0xe5484d, amber: 0xf5a524, green: 0x10b981, gray: 0x8f8f8f };

export async function postWebhook(url: string, embeds: Embed[]): Promise<{ ok: boolean; status: number }> {
  if (!isDiscordWebhook(url)) return { ok: false, status: 0 };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Connection Guard", embeds: embeds.slice(0, 10), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
