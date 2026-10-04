// Small helpers shared by plugin and dashboard routes.

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
// Crockford base32 without I, L, O, U: unambiguous when read from a console.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomString(alphabet: string, length: number): string {
  // Rejection sampling keeps the distribution uniform.
  const out: string[] = [];
  const limit = 256 - (256 % alphabet.length);
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && out.length < length) out.push(alphabet[b % alphabet.length]!);
    }
  }
  return out.join("");
}

export const newId = (prefix: string, length = 24) => `${prefix}_${randomString(ALNUM, length)}`;
export const newSecret = () => `cgs_${randomString(ALNUM, 48)}`;
export const newLinkCode = () => { const raw = randomString(CROCKFORD, 8); return `${raw.slice(0, 4)}-${raw.slice(4)}`; };
export const newNetworkToken = () => `cgn_${randomString(ALNUM, 40)}`;

export function normalizeLinkCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function collect(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

/** Reads a request body, transparently un-gzipping it, refusing anything over maxBytes (after decompression). */
export async function readBody(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return "";
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  let stream: ReadableStream<Uint8Array> = req.body;
  if ((req.headers.get("content-encoding") ?? "").toLowerCase() === "gzip") {
    stream = stream.pipeThrough(new DecompressionStream("gzip"));
  }
  const bytes = await collect(stream, maxBytes);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

export async function gzipJson(value: unknown): Promise<Uint8Array> {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  return (await collect(stream, Number.MAX_SAFE_INTEGER))!;
}

/** Accepts BLOB columns however D1 returns them (ArrayBuffer, Uint8Array or number[]). */
export async function gunzipJson<T>(bytes: ArrayBuffer | Uint8Array | number[]): Promise<T> {
  const data = Array.isArray(bytes) ? new Uint8Array(bytes) : bytes;
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(new TextDecoder().decode((await collect(stream, 64 * 1024 * 1024))!)) as T;
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const hourStart = (ms: number) => Math.floor(ms / HOUR) * HOUR;

export function mergeCounts(target: Record<string, number>, add: Record<string, number>): Record<string, number> {
  for (const [k, v] of Object.entries(add)) target[k] = (target[k] ?? 0) + v;
  return target;
}
