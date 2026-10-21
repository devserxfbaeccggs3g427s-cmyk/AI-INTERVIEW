/**
 * Outbound URL + address policy for user-supplied ("custom provider") endpoints.
 *
 * A custom base URL is an arbitrary URL typed by a browser user that OUR server
 * then dials. Without this policy it is a direct path into the machine's
 * internal network, cloud metadata services, and loopback daemons.
 *
 * This module is deliberately split in two, because the two halves have very
 * different trust properties:
 *
 *   1. `normalizeBaseUrl` / `classifyTarget` — pure, synchronous, NO DNS. They
 *      can only inspect the literal URL. Useful at config-validation time (route
 *      handler, settings save) and as the first of the two gates in the
 *      transport. They CANNOT prove that a hostname resolves somewhere public.
 *
 *   2. `assertAddressAllowed` — the connect-time gate. It runs on every literal
 *      IP, including every answer DNS returned, so it is what actually makes a
 *      hostname safe. A name like `evil.example` that resolves to 127.0.0.1
 *      passes (1) and is stopped by (2).
 *
 * Fail-closed rules that hold REGARDLESS of the `allowPrivate` opt-in:
 *   - link-local, including 169.254.169.254 (cloud metadata) and fe80::/10
 *   - "this network" 0.0.0.0/8, which resolves to loopback on Linux
 *   - CGNAT 100.64.0.0/10, multicast, reserved/broadcast 240.0.0.0/4
 *   - documentation/benchmark ranges and IETF special assignments
 *   - IPv4-mapped / IPv4-compatible / NAT64 / 6to4 / Teredo IPv6 forms, which are
 *     classified by the IPv4 address they embed, so `::ffff:127.0.0.1` cannot
 *     smuggle a loopback request past an IPv6-only filter
 *
 * `allowPrivate` is a DEVELOPMENT-ONLY opt-in that unlocks loopback + RFC1918 +
 * ULA and plain `http:`. It never unlocks the fail-closed list above. It must
 * never be enabled on a public deployment (NFR-8).
 *
 * No dependencies. Node >= 22.5.
 */

/** Only these two protocols are ever considered; everything else is rejected. */
export type HttpProtocol = "http:" | "https:";

/**
 * How dangerous an address is.
 * - `"deny"`: never reachable, not even with the opt-in.
 * - `"private"`: loopback / RFC1918 / CGNAT-adjacent — reachable only when
 *   `allowPrivate` is true.
 * - `"public"`: globally routable.
 */
export type AddressTier = "deny" | "private" | "public";

export interface UrlPolicyOptions {
  /**
   * Development-only opt-in for self-hosted endpoints on `http://localhost` and
   * friends. Defaults to `false`. Use `readAllowPrivateFromEnv()` to derive it
   * from the environment.
   */
  allowPrivate?: boolean;
}

export type UrlPolicyErrorCode =
  | "not_a_string"
  | "too_long"
  | "invalid_url"
  | "unsupported_protocol"
  | "credentials_in_url"
  | "query_or_fragment"
  | "forbidden_characters"
  | "invalid_host"
  | "blocked_hostname"
  | "unsafe_address";

/** Every rejection in this module throws this, so callers can branch on `code`. */
export class UrlPolicyError extends Error {
  readonly code: UrlPolicyErrorCode;

  constructor(code: UrlPolicyErrorCode, message: string) {
    super(message);
    this.name = "UrlPolicyError";
    this.code = code;
  }
}

/** Long enough for any real OpenAI-compatible base URL, short enough to bound work. */
export const MAX_BASE_URL_LENGTH = 2048;

/* -------------------------------------------------------------------------- */
/* IPv4                                                                        */
/* -------------------------------------------------------------------------- */

type Cidr = readonly [network: number, prefix: number];

/** Never allowed, even with `allowPrivate`. */
const DENY_V4: readonly Cidr[] = [
  [0x00000000, 8], // "this network" — binds to loopback on Linux/macOS
  [0xa9fe0000, 16], // link-local — 169.254.169.254 cloud metadata lives here
  [0x64400000, 10], // CGNAT / shared address space (100.64.0.0/10)
  [0xc0000000, 24], // IETF protocol assignments (192.0.0.0/24)
  [0xc0000200, 24], // TEST-NET-1
  [0xc5886300, 24], // 6to4 relay anycast, deprecated (192.88.99.0/24)
  [0xc6120000, 15], // benchmarking (198.18.0.0/15)
  [0xc6336400, 24], // TEST-NET-2
  [0xcb007100, 24], // TEST-NET-3
  [0xe0000000, 4], // multicast
  [0xf0000000, 4], // reserved + broadcast (255.255.255.255)
];

/** Unlocked only by `allowPrivate`. */
const PRIVATE_V4: readonly Cidr[] = [
  [0x0a000000, 8], // 10.0.0.0/8
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0a80000, 16], // 192.168.0.0/16
  [0x7f000000, 8], // 127.0.0.0/8 loopback
];

function parseV4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value * 256 + octet) >>> 0;
  }
  return value;
}

function inCidr(value: number, network: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
}

function classifyV4(value: number): AddressTier {
  if (DENY_V4.some(([network, prefix]) => inCidr(value, network, prefix))) return "deny";
  if (PRIVATE_V4.some(([network, prefix]) => inCidr(value, network, prefix))) return "private";
  return "public";
}

/* -------------------------------------------------------------------------- */
/* IPv6                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Expands any textual IPv6 form into exactly eight 16-bit words, or null if it
 * is not a well-formed IPv6 literal. Callers must have already checked
 * `isIP()`; the `null` paths here are belt-and-braces so a malformed string
 * can never be silently classified as public.
 */
function parseV6(address: string): number[] | null {
  let text = address;
  // Rewrite a trailing dotted-quad ("::ffff:127.0.0.1") into two hex words so
  // the generic expansion below can handle it.
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const embedded = parseV4(tail);
    if (embedded === null) return null;
    text = `${text.slice(0, lastColon + 1)}${(embedded >>> 16).toString(16)}:${(embedded & 0xffff).toString(16)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toWords = (part: string): number[] =>
    part === "" ? [] : part.split(":").map((piece) => parseInt(piece, 16));

  const head = toWords(halves[0]);
  const rest = halves.length === 2 ? toWords(halves[1]) : [];
  const fill = 8 - head.length - rest.length;
  // "::" must stand for at least one zero group; a bare address must be full.
  if (fill < (halves.length === 2 ? 1 : 0)) return null;

  const words = [...head, ...new Array(Math.max(fill, 0)).fill(0), ...rest];
  if (words.length !== 8) return null;
  if (!words.every((w) => Number.isInteger(w) && w >= 0 && w <= 0xffff)) return null;
  return words;
}

/** The IPv4 address embedded in the low 32 bits of an IPv6 address. */
function embeddedV4(words: number[]): number | null {
  if (words.length !== 8) return null;
  return (((words[6] << 16) | words[7]) >>> 0);
}

/**
 * Metadata endpoints that fall INSIDE an otherwise opt-in-unlockable range, so
 * the tier rules alone would let `allowPrivate` reach them.
 *
 * The IPv4 metadata addresses need no special case — 169.254.169.254 is
 * link-local and 100.100.100.200 (Alibaba Cloud) is inside CGNAT, both already
 * in the always-denied list. AWS IMDS over IPv6 is the odd one out: fd00:ec2::254
 * is a unique-local address, and ULA is exactly what the dev opt-in exists to
 * unlock, so it is pinned here instead.
 *
 * Refusing ULA wholesale would be stricter, but it would also break IPv6
 * self-hosted endpoints, which is a real use of the opt-in. Denying the metadata
 * address closes the hole without that cost.
 */
const ALWAYS_DENY_LITERAL = new Set([
  "fd00:ec2::254", // AWS IMDS, IPv6
]);

const ZERO_PREFIX_3 = [0, 0, 0];
const ZERO_PREFIX_4 = [0, 0, 0, 0];
const ZERO_PREFIX_5 = [0, 0, 0, 0, 0];
const ZERO_PREFIX_6 = [0, 0, 0, 0, 0, 0];
const ZERO_PREFIX_7 = [0, 0, 0, 0, 0, 0, 0];
const ZERO_PREFIX_8 = [0, 0, 0, 0, 0, 0, 0, 0];

function wordsAre(words: number[], prefix: readonly number[], offset = 0): boolean {
  return prefix.every((value, index) => words[offset + index] === value);
}

function classifyV6(words: number[]): AddressTier {
  // :: — unspecified. Also 0.0.0.0 in IPv4-compatible position.
  if (wordsAre(words, ZERO_PREFIX_8)) return "deny";

  // ::1 — IPv6 loopback. Unlocked only by `allowPrivate`, mirroring 127.0.0.1.
  if (wordsAre(words, ZERO_PREFIX_7) && words[7] === 1) return "private";

  // ::ffff:a.b.c.d — IPv4-mapped. Classify by the embedded IPv4 address so a
  // mapped loopback/metadata address is stopped by the IPv4 rules above.
  if (wordsAre(words, ZERO_PREFIX_5) && words[5] === 0xffff) {
    const embedded = embeddedV4(words);
    return embedded === null ? "deny" : classifyV4(embedded);
  }

  // ::a.b.c.d — deprecated IPv4-compatible form (RFC 4291 §2.5.5.1).
  if (wordsAre(words, ZERO_PREFIX_6)) {
    const embedded = embeddedV4(words);
    return embedded === null ? "deny" : classifyV4(embedded);
  }

  // 64:ff9b::/96 NAT64 well-known prefix — embed an IPv4 address, classify it.
  // 64:ff9b:1::/48 (local-use) and anything else under 64:ff9b:: is refused.
  if (words[0] === 0x0064 && words[1] === 0xff9b) {
    if (wordsAre(words, ZERO_PREFIX_4, 2)) {
      const embedded = embeddedV4(words);
      return embedded === null ? "deny" : classifyV4(embedded);
    }
    return "deny";
  }

  if ((words[0] & 0xffc0) === 0xfe80) return "deny"; // fe80::/10 link-local
  if ((words[0] & 0xff00) === 0xff00) return "deny"; // ff00::/8 multicast
  if ((words[0] & 0xfe00) === 0xfc00) return "private"; // fc00::/7 unique-local
  // 2001:0000::/23 covers Teredo (2001::/32), the benchmarking range
  // (2001:2::/48) and ORCHID (2001:10::/28, 2001:20::/28). The documentation
  // range 2001:db8::/32 sits outside that /23, so it needs its own test.
  if (words[0] === 0x2001 && (words[1] <= 0x01ff || words[1] === 0x0db8)) return "deny";
  if (words[0] === 0x2002) return "deny"; // 2002::/16 6to4
  if (words[0] === 0x3fff && words[1] <= 0x0fff) return "deny"; // 3fff::/20 documentation
  if (words[0] === 0x0100 && wordsAre(words, ZERO_PREFIX_3, 1)) return "deny"; // 100::/64 discard

  // Only 2000::/3 is currently allocated to global unicast. Everything else
  // (4000::/3 and up, and unallocated space) is refused rather than guessed at.
  if ((words[0] & 0xe000) !== 0x2000) return "deny";
  return "public";
}

/* -------------------------------------------------------------------------- */
/* Public surface                                                              */
/* -------------------------------------------------------------------------- */

/** Strips the brackets WHATWG `URL.hostname` puts around IPv6 literals. */
export function stripIpv6Brackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/**
 * Classifies a bare IP literal. Returns `"deny"` for anything that is not a
 * valid IPv4/IPv6 address — an unparseable address is never treated as public.
 */
export function classifyAddress(address: string): AddressTier {
  if (typeof address !== "string") return "deny";
  const trimmed = stripIpv6Brackets(address.trim()).toLowerCase();
  // A zone index ("fe80::1%eth0") is never a routable destination for us.
  if (trimmed === "" || trimmed.includes("%")) return "deny";
  if (ALWAYS_DENY_LITERAL.has(trimmed)) return "deny";

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) {
    const value = parseV4(trimmed);
    return value === null ? "deny" : classifyV4(value);
  }
  const words = parseV6(trimmed);
  return words === null ? "deny" : classifyV6(words);
}

/**
 * The connect-time gate. Call this for the literal host and for EVERY address
 * DNS returns, immediately before a socket is opened.
 *
 * Throws `UrlPolicyError` on any rejection. `protocol` matters: plain `http:`
 * is only ever allowed under the explicit opt-in. The opt-in covers loopback,
 * RFC1918, ULA, AND any public IP the operator has explicitly chosen to reach
 * over cleartext (for example a legacy VPS without TLS termination).
 */
export function assertAddressAllowed(
  address: string,
  protocol: HttpProtocol,
  allowPrivate: boolean,
): void {
  if (protocol !== "http:" && protocol !== "https:") {
    throw new UrlPolicyError("unsupported_protocol", `Unsupported protocol: ${protocol}`);
  }

  const tier = classifyAddress(address);
  const shown = stripIpv6Brackets(String(address)).slice(0, 64);

  if (tier === "deny") {
    throw new UrlPolicyError(
      "unsafe_address",
      `Address ${shown} is in a reserved range and is never permitted.`,
    );
  }
  if (protocol === "http:" && !allowPrivate) {
    throw new UrlPolicyError(
      "unsupported_protocol",
      "Plain http:// requires the local opt-in.",
    );
  }
  if (tier === "public") {
    return;
  }
  // tier === "private"
  if (!allowPrivate) {
    throw new UrlPolicyError(
      "unsafe_address",
      `Address ${shown} is private; it is only reachable with the local opt-in.`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* URL-level rules                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Percent-encodings of path/query delimiters and of CR/LF/NUL. WHATWG `URL`
 * leaves these intact in `pathname`, so an encoded delimiter could otherwise be
 * used to smuggle a second request path or a header break past a naive filter.
 */
const FORBIDDEN_ENCODINGS = /%(?:2f|5c|3f|23|40|00|0a|0d)/i;

/**
 * Host suffixes that can never legitimately name a public LLM endpoint.
 * Checked regardless of `allowPrivate`: `.internal`/`.local`/`.home.arpa` are
 * split-horizon names, and `.onion` only resolves through a Tor proxy we do not
 * use — resolving one through the system resolver is a configuration surprise.
 */
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".private",
  ".corp",
  ".home",
  ".home.arpa",
  ".lan",
  ".onion",
  ".test",
  ".example",
  ".invalid",
] as const;

/** Exact hostnames that are never a public endpoint. */
const BLOCKED_HOSTS = [
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.goog",
] as const;

const DNS_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** Cheap structural check so a malformed literal is not mistaken for a name. */
function looksNumericOrV6(host: string): boolean {
  if (host.includes(":")) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** A rejection carries both a stable machine code and a human-readable reason. */
export interface UrlPolicyRejection {
  code: UrlPolicyErrorCode;
  message: string;
}

type Rejection = UrlPolicyRejection;

function reject(code: UrlPolicyErrorCode, message: string): Rejection {
  return { code, message };
}

/**
 * Shape checks shared by `normalizeBaseUrl` and `classifyTarget`. Returns a
 * rejection, or null when the URL is acceptable.
 */
function checkUrlShape(url: URL, allowPrivate: boolean): Rejection | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return reject("unsupported_protocol", "Endpoint must use http: or https:.");
  }
  if (url.protocol === "http:" && !allowPrivate) {
    return reject("unsupported_protocol", "Endpoint must use https: (plain http is local opt-in only).");
  }
  if (url.username !== "" || url.password !== "") {
    return reject("credentials_in_url", "Endpoint URL must not embed credentials.");
  }
  if (url.search !== "" || url.hash !== "") {
    return reject("query_or_fragment", "Endpoint URL must not contain a query string or fragment.");
  }
  // `url.href` is the WHATWG-normalised form, so it reflects anything a parser
  // may have re-encoded out of the original input.
  const href = url.href;
  if (/\s/.test(href) || href.includes("\\") || FORBIDDEN_ENCODINGS.test(href)) {
    return reject("forbidden_characters", "Endpoint URL contains forbidden characters.");
  }
  return null;
}

/** Hostname rules shared by `normalizeBaseUrl` and `classifyTarget`. */
function checkHost(host: string, url: URL, allowPrivate: boolean): Rejection | null {
  const bare = stripIpv6Brackets(host).replace(/\.$/, "").toLowerCase();
  if (bare === "") return reject("invalid_host", "Endpoint URL has no host.");
  if (bare.includes("%")) return reject("invalid_host", "Endpoint host must not carry a zone index.");
  if (bare.length > 253) return reject("invalid_host", "Endpoint hostname is too long.");

  if (looksNumericOrV6(bare)) {
    try {
      assertAddressAllowed(bare, url.protocol as HttpProtocol, allowPrivate);
    } catch (error) {
      if (error instanceof UrlPolicyError) {
        return reject(error.code, error.message);
      }
      return reject("unsafe_address", "Endpoint address is not permitted.");
    }
    return null;
  }

  if (bare === "localhost") {
    return allowPrivate && url.protocol === "http:"
      ? null
      : reject("blocked_hostname", "Localhost requires the local HTTP opt-in.");
  }
  if (BLOCKED_HOSTS.includes(bare as (typeof BLOCKED_HOSTS)[number])) {
    return reject("blocked_hostname", "Endpoint host is not permitted.");
  }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => bare.endsWith(suffix))) {
    return reject("blocked_hostname", "Endpoint host is not permitted.");
  }
  // Without the opt-in a single-label name can only be a split-horizon/internal
  // name, never a public endpoint.
  if (!allowPrivate && !bare.includes(".")) {
    return reject("invalid_host", "Endpoint must use a fully qualified public hostname.");
  }
  const labels = bare.split(".");
  if (labels.some((label) => label.length === 0 || label.length > 63 || !DNS_LABEL.test(label))) {
    return reject("invalid_host", "Endpoint hostname is not a valid DNS name.");
  }
  return null;
}

/**
 * Validates and canonicalises a user-supplied base URL. No DNS is performed, so
 * this proves nothing about where the name resolves — it only guarantees the
 * literal URL is well-formed and not obviously internal.
 *
 * Returns a canonical absolute URL: lower-cased scheme and host, no trailing
 * slash, no query, no fragment. Throws `UrlPolicyError` on any rejection.
 */
export function normalizeBaseUrl(raw: string, options?: UrlPolicyOptions): string {
  const allowPrivate = options?.allowPrivate === true;
  if (typeof raw !== "string") {
    throw new UrlPolicyError("not_a_string", "Endpoint URL must be a string.");
  }
  // Surrounding whitespace is a UI artefact; interior whitespace is not.
  const trimmed = raw.trim();
  if (/(?:^|\/)\.{1,2}(?:\/|$|[?#])|%2e/i.test(trimmed)) {
    throw new UrlPolicyError("forbidden_characters", "Endpoint URL must not contain dot-path segments.");
  }
  if (trimmed.length > MAX_BASE_URL_LENGTH) {
    throw new UrlPolicyError("too_long", "Endpoint URL is too long.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new UrlPolicyError("invalid_url", "Endpoint URL is not a valid absolute URL.");
  }
  if (url.href.length > MAX_BASE_URL_LENGTH) {
    throw new UrlPolicyError("too_long", "Endpoint URL is too long.");
  }

  const shape = checkUrlShape(url, allowPrivate);
  if (shape !== null) throw new UrlPolicyError(shape.code, shape.message);

  const host = checkHost(url.hostname, url, allowPrivate);
  if (host !== null) throw new UrlPolicyError(host.code, host.message);

  // Canonical output. `URL` already lower-cases the scheme and host and drops a
  // default port; we only need to trim the path's trailing slashes.
  let path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/chat/completions")) path = path.slice(0, -"/chat/completions".length);
  if (!path) path = "/v1";
  return `${url.protocol}//${url.host}${path}`;
}

/**
 * Pre-DNS screen for an already-parsed request URL. Returns null when the URL is
 * acceptable, otherwise a human-readable reason.
 *
 * IMPORTANT: this cannot prove a hostname is public. Only `assertAddressAllowed`
 * running on real resolved addresses (see `lib/net/transport.ts`) can, so this
 * function must never be used as the sole gate on a request.
 */
export function classifyTarget(url: URL, allowPrivate: boolean): string | null {
  const rejection = classifyTargetDetailed(url, allowPrivate);
  return rejection === null ? null : rejection.message;
}

/**
 * Same check as `classifyTarget`, but keeps the machine-readable `code`. Use
 * this when you need to branch on WHY a target was refused (for example to map
 * a rejection onto a localised message); `classifyTarget` is the friendlier
 * shape for a plain "null or a reason to show the user".
 */
export function classifyTargetDetailed(url: URL, allowPrivate: boolean): UrlPolicyRejection | null {
  if (!(url instanceof URL)) {
    throw new UrlPolicyError("invalid_url", "Expected a URL instance.");
  }
  const allowed = allowPrivate === true;
  return checkUrlShape(url, allowed) ?? checkHost(url.hostname, url, allowed);
}

/**
 * Reads the local opt-in flag. Only the explicit value "1" enables it.
 *
 * Anything else — including an unset variable — is FALSE. There is no third
 * state: an unparseable flag must not enable private targets.
 */
export function readAllowPrivateFromEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flag = env.ALLOW_PRIVATE_BASE_URL;
  if (typeof flag !== "string") return false;
  return flag === "1";
}
