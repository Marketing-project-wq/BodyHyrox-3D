import { STAGE_MEDIA } from "@/lib/config";
import { proxiedVideoUpstream } from "@/lib/stage-media";

/**
 * Stage frame videos from hosts that don't send the CORS header
 * (STAGE_MEDIA.proxyHosts, e.g. media.20fit.id): served from our own origin,
 * so the 3D stage can draw them as a texture and the admin's browser can take
 * a poster. GET /api/stage-video?u=<https link to the .mp4 / .webm>.
 * - Only .mp4 / .webm files on those hosts (lib/stage-media.ts
 *   proxiedVideoUpstream); redirects are followed only to such files.
 * - Only for our own pages: a request another site's page makes is refused
 *   (Sec-Fetch-Site), and the answer may not be embedded elsewhere
 *   (Cross-Origin-Resource-Policy: same-origin).
 * - Range requests pass through (iPhone / Safari need them); the body is
 *   streamed, never held in memory; the upstream request stops when the
 *   visitor's does.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_HEADERS = ["range", "if-range", "if-none-match", "if-modified-since"];
const RESPONSE_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

const plain = (status: number, text: string) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

async function proxy(req: Request, method: "GET" | "HEAD"): Promise<Response> {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return plain(403, "Only for avatar.20fit.id pages.");
  let target = proxiedVideoUpstream(new URL(req.url).searchParams.get("u") ?? "");
  if (!target) return plain(400, "Not a video file on an allowed host.");

  const headers: Record<string, string> = { "user-agent": "20FIT-avatar-stage-video/1.0" };
  for (const h of REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  // Stop the upstream request when the visitor's stops; give up on a host that doesn't answer.
  const ctl = new AbortController();
  req.signal.addEventListener("abort", () => ctl.abort(), { once: true });
  const timer = setTimeout(() => ctl.abort(), STAGE_MEDIA.fetchTimeoutMs);
  let res: Response | null = null;
  try {
    for (let hop = 0; hop <= STAGE_MEDIA.maxRedirects && !res; hop++) {
      const r = await fetch(target, { method, headers, redirect: "manual", signal: ctl.signal, cache: "no-store" });
      const loc = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
      if (!loc) {
        res = r;
        break;
      }
      await r.body?.cancel().catch(() => {});
      const next = proxiedVideoUpstream(new URL(loc, target).toString());
      if (!next) return plain(502, "The video host redirected somewhere else.");
      target = next;
    }
  } catch {
    return plain(502, "The video host didn't answer.");
  } finally {
    clearTimeout(timer); // the headers are in; the body may take as long as it takes
  }
  if (!res) return plain(502, "Too many redirects.");

  const out = new Headers();
  for (const h of RESPONSE_HEADERS) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("cache-control", `public, max-age=${STAGE_MEDIA.proxyCacheSec}`);
  out.set("cross-origin-resource-policy", "same-origin");
  out.set("x-content-type-options", "nosniff");
  if (res.status === 304) return new Response(null, { status: 304, headers: out });
  if (res.status === 416) return new Response(null, { status: 416, headers: out });
  if (res.status !== 200 && res.status !== 206) {
    await res.body?.cancel().catch(() => {});
    return plain(res.status === 404 ? 404 : 502, `The video host answered ${res.status}.`);
  }
  if (!/^video\//i.test(res.headers.get("content-type") ?? "")) {
    await res.body?.cancel().catch(() => {});
    return plain(415, "That file is not a video.");
  }
  return new Response(method === "HEAD" ? null : res.body, { status: res.status, headers: out });
}

export function GET(req: Request) {
  return proxy(req, "GET");
}

export function HEAD(req: Request) {
  return proxy(req, "HEAD");
}
