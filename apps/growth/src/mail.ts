// The report as an RFC 5322 message with a plain-text and an HTML part, base64 so non-ASCII and long lines are safe.
import type { Report } from "./report";

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/.{1,76}/g, "$&\r\n");
};
const header = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s).replace(/\r\n/g, "")}?=`;

export function mime(env: { MAIL_FROM: string; MAIL_TO: string }, r: Report, now = new Date()): string {
  const boundary = `cg-${crypto.randomUUID()}`;
  const domain = env.MAIL_FROM.split("@")[1];
  return [
    `From: ${header("Connection Guard Growth")} <${env.MAIL_FROM}>`,
    `To: <${env.MAIL_TO}>`,
    `Subject: ${header(r.subject)}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(r.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(r.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
