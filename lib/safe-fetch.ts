import "server-only";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { STAGE_MEDIA } from "@/lib/config";

/**
 * Server-side fetch of an admin-pasted link, guarded against SSRF: https only,
 * no IP literals or local names, every resolved address must be public, each
 * redirect is re-checked (at most STAGE_MEDIA.maxRedirects), with a timeout
 * and a byte limit on the body.
 */

export class FetchRefused extends Error {
  constructor(public reason: "invalid" | "private" | "redirects" | "too_big" | "network") {
    super(reason);
  }
}

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

async function checkHost(u: URL): Promise<void> {
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) throw new FetchRefused("invalid");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || host === "localhost" || /\.(localhost|local|internal)$/i.test(host)) throw new FetchRefused("private");
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new FetchRefused("network");
  }
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new FetchRefused("private");
}

export type SafeResponse = { url: string; status: number; headers: Headers; body: Buffer | null };

/**
 * GET/HEAD `url`. `maxBytes` caps the body (null = don't read it). Throws
 * FetchRefused for refused links; HTTP errors come back as a status.
 */
export async function safeFetch(
  url: string,
  opts: { method?: "GET" | "HEAD"; headers?: Record<string, string>; maxBytes?: number | null } = {},
): Promise<SafeResponse> {
  let current = new URL(url);
  for (let hop = 0; hop <= STAGE_MEDIA.maxRedirects; hop++) {
    await checkHost(current);
    let res: Response;
    try {
      res = await fetch(current, {
        method: opts.method ?? "GET",
        headers: { "user-agent": "20FIT-avatar-link-check/1.0", ...(opts.headers ?? {}) },
        redirect: "manual",
        signal: AbortSignal.timeout(STAGE_MEDIA.fetchTimeoutMs),
        cache: "no-store",
      });
    } catch {
      throw new FetchRefused("network");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current);
      await res.body?.cancel().catch(() => {});
      continue;
    }
    let body: Buffer | null = null;
    if (opts.maxBytes != null && opts.method !== "HEAD" && res.body) {
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > opts.maxBytes) {
        await res.body.cancel().catch(() => {});
        throw new FetchRefused("too_big");
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > opts.maxBytes) {
          await reader.cancel().catch(() => {});
          throw new FetchRefused("too_big");
        }
        chunks.push(value);
      }
      body = Buffer.concat(chunks);
    } else {
      await res.body?.cancel().catch(() => {});
    }
    return { url: current.toString(), status: res.status, headers: res.headers, body };
  }
  throw new FetchRefused("redirects");
}
