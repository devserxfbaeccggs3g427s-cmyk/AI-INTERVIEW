import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";

/** Only use this transport for custom endpoints; fetch/SDK transports do not pin DNS. */
const BLOCKED_V4: readonly [number, number][] = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10],
  [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12],
  [0xc0000000, 24], [0xc0000200, 24], [0xc0586300, 24],
  [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24],
  [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
];

function inV4Range(value: number, network: number, prefix: number): boolean {
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
}

function publicV4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const octets = address.split(".").map(Number);
  const value = ((octets[0] << 24) | (octets[1] << 16) |
    (octets[2] << 8) | octets[3]) >>> 0;
  return !BLOCKED_V4.some(([network, prefix]) =>
    inV4Range(value, network, prefix));
}

function ipv6Words(address: string): number[] | null {
  if (isIP(address) !== 6) return null;
  const parts = address.toLowerCase().split("::");
  if (parts.length > 2) return null;
  function words(part: string): number[] {
    if (!part) return [];
    return part.split(":").flatMap((piece) => {
      if (!piece.includes(".")) return [parseInt(piece, 16)];
      const bytes = piece.split(".").map(Number);
      return [(bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]];
    });
  }
  const left = words(parts[0]);
  const right = parts.length === 2 ? words(parts[1]) : [];
  const zeros = 8 - left.length - right.length;
  if (zeros < (parts.length === 2 ? 1 : 0)) return null;
  const result = [...left, ...Array(zeros).fill(0), ...right] as number[];
  return result.length === 8 ? result : null;
}

/** Conservative global-unicast filter; special-purpose allocations may change. */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return publicV4(address);
  const words = ipv6Words(address);
  if (!words) return false;
  // IPv4-mapped addresses are checked using their embedded IPv4 classification.
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return publicV4(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
  }
  // Only 2000::/3 is potentially public. Exclude IETF special assignments,
  // documentation, and 6to4 (whose embedded destination may be private).
  if ((words[0] & 0xe000) !== 0x2000) return false;
  if (words[0] === 0x2001 && (words[1] <= 0x01ff || words[1] === 0x0db8)) return false;
  if (words[0] === 0x2002 || words[0] === 0x3fff) return false;
  return true;
}

function checkedUrl(input: string): URL {
  if (typeof input !== "string" || input.length > 2048) {
    throw new Error("Invalid custom HTTPS URL");
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid custom HTTPS URL");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
      url.hash || url.search) {
    throw new Error("Custom endpoint requires an HTTPS URL without credentials, query, or fragment");
  }
  if (/\s/.test(input) || /\\/.test(input) || /%(?:2f|5c|3f|23|40|0[ad])/i.test(input)) {
    throw new Error("Custom endpoint URL contains forbidden characters");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!isIP(host) && (!host.includes(".") || !/^[a-z0-9.-]+$/.test(host) ||
      host.split(".").some((label) => !label || label.startsWith("-") || label.endsWith("-")))) {
    throw new Error("Custom endpoint requires a public hostname");
  }
  if (host === "localhost" || host.endsWith(".localhost") ||
      host === "internal" || host.endsWith(".internal") ||
      host === "local" || host.endsWith(".local") || host.includes("%")) {
    throw new Error("Custom endpoint host is not permitted");
  }
  if (isIP(host) && !isPublicAddress(host)) {
    throw new Error("Custom endpoint address is not public");
  }
  return url;
}

/** Validate *all* DNS answers, then supply only a validated answer to TLS. */
async function pinAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const family = isIP(host);
  if (family) {
    if (!isPublicAddress(host)) throw new Error("Custom endpoint address is not public");
    return { address: host, family: family as 4 | 6 };
  }
  let records: { address: string; family: number }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("Custom endpoint DNS lookup failed");
  }
  if (!records.length || records.some((record) =>
    (record.family !== 4 && record.family !== 6) || !isPublicAddress(record.address))) {
    throw new Error("Custom endpoint DNS contains an unsafe address");
  }
  return records[0] as { address: string; family: 4 | 6 };
}

export interface GuardedResponse {
  response: IncomingMessage;
  /** Caller must consume/destroy the response, including on error. */
}

/**
 * Only this function may send custom-provider traffic. `https.request` has no
 * environment-proxy support; agent:false prevents a shared/overridden agent.
 * DNS lookup on the socket returns the prevalidated IP, while TLS SNI and
 * certificate hostname verification still use the original hostname.
 */
export async function guardedCustomRequest(
  baseUrl: string,
  endpoint: "chat/completions" | "models",
  options: { method: "GET" | "POST"; apiKey: string; body?: string; signal?: AbortSignal },
): Promise<GuardedResponse> {
  const base = checkedUrl(baseUrl);
  if ((options.method === "GET") !== (endpoint === "models") ||
      (options.method === "POST" && options.body === undefined) ||
      (options.method === "GET" && options.body !== undefined)) {
    throw new Error("Invalid custom endpoint request");
  }
  if (typeof options.apiKey !== "string" || !options.apiKey || /[\r\n]/.test(options.apiKey)) {
    throw new Error("Custom provider API key is required");
  }
  if (options.apiKey.length > 8192) throw new Error("Custom provider API key is too long");
  const url = new URL(base.href);
  url.pathname = `${base.pathname.replace(/\/+$/, "")}/${endpoint}`;
  const pinned = await pinAddress(url.hostname);
  if (options.signal?.aborted) throw new Error("Custom request cancelled");

  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method,
      agent: false,
      // Never delegate lookup or connection to an environment-configured proxy.
      lookup(_hostname, _opts, callback) {
        callback(null, pinned.address, pinned.family);
      },
      servername: isIP(url.hostname.replace(/^\[|\]$/g, ""))
        ? "" : url.hostname,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: "application/json, text/event-stream",
        "Accept-Encoding": "identity",
        ...(options.body !== undefined ? {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(options.body),
        } : {}),
      },
      timeout: 30_000,
      signal: options.signal,
    }, (response) => {
      if ((response.statusCode ?? 0) >= 300 && (response.statusCode ?? 0) < 400) {
        response.destroy();
        reject(new Error("Custom endpoint redirects are not permitted"));
        return;
      }
      if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
        response.destroy();
        reject(new Error("Custom endpoint compressed response is not supported"));
        return;
      }
      resolve({ response });
    });
    request.on("error", () => reject(new Error("Custom endpoint connection failed")));
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.end(options.body);
  });
}
