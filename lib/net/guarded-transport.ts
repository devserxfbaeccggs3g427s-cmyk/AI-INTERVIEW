/**
 * Connect-time guarded HTTP(S) transport for user-supplied ("custom provider")
 * endpoints.
 *
 * This is the ONLY transport allowed to carry custom-provider traffic. `fetch`
 * and the vendor SDKs cannot be used here: they resolve DNS themselves and open
 * the socket from whatever the resolver returned a moment later, so a name that
 * passed validation can be re-pointed at 127.0.0.1 in between (DNS rebinding).
 * They also follow redirects by default, and honour nothing that stops an
 * environment proxy from rerouting the connection.
 *
 * What this transport guarantees, per request:
 *
 *   1. The base URL AND the composed request URL are both re-validated, every
 *      call. Nothing is cached between requests and no validation result from
 *      config-save time is reused.
 *   2. Plain `http:` requires the local opt-in AND a local destination, so the
 *      opt-in can never be used to downgrade a public provider to cleartext.
 *   3. Reserved ranges (link-local/metadata, 0.0.0.0/8, CGNAT, multicast, …) are
 *      refused even when the opt-in is on. See `url-policy.ts`.
 *   4. DNS is resolved once, EVERY answer is checked, and the socket is pinned
 *      to a validated address via a `lookup` override. The name is used only for
 *      TLS SNI and certificate verification, never for a second resolution.
 *   5. Redirects are refused, not followed. A 3xx is an error.
 *   6. No connection pooling (`agent: false`) and no environment proxy — the
 *      node:http/https core never reads HTTP_PROXY/HTTPS_PROXY/ALL_PROXY, and
 *      using `fetch` here would have brought undici's global dispatcher, which
 *      does not.
 *   7. Bounded connect and inter-chunk timeouts, plus a byte cap on the body.
 *   8. Every failure is a `TransportError` carrying a stable `code`. Raw socket
 *      and resolver errors never escape, because they can echo the target host.
 *
 * No dependencies. Node >= 22.5.
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

import {
  UrlPolicyError,
  assertAddressAllowed,
  classifyTargetDetailed,
  normalizeBaseUrl,
  readAllowPrivateFromEnv,
  stripIpv6Brackets,
  type HttpProtocol,
} from "./url-policy";

/** The only endpoints a custom provider is allowed to reach. */
export type GuardedEndpoint = "models" | "chat/completions";

export type TransportErrorCode =
  | "invalid_request"
  | "policy_rejected"
  | "dns_failed"
  | "aborted"
  | "connect_timeout"
  | "body_timeout"
  | "network_error"
  | "redirect_not_allowed"
  | "unsupported_encoding"
  | "invalid_response"
  | "response_too_large";

/** Every failure path throws this. `code` is stable; `message` is generic on purpose. */
export class TransportError extends Error {
  readonly code: TransportErrorCode;

  constructor(code: TransportErrorCode, message: string) {
    super(message);
    this.name = "TransportError";
    this.code = code;
  }
}

/**
 * `init` uses the standard `RequestInit` so callers can pass an ordinary
 * `fetch`-shaped object. Only `method`, `headers`, `body` and `signal` are read,
 * and `body` must be a string — a stream or FormData body has no place in a
 * JSON provider call and is refused rather than coerced.
 */
export type GuardedRequestInit = RequestInit;

export interface GuardedRequestOptions {
  /** Injected for tests. Must behave like `dns.lookup`. Defaults to `dns.lookup`. */
  resolver?: typeof dns.lookup;
  /**
   * Local opt-in for self-hosted endpoints. Defaults to
   * `readAllowPrivateFromEnv()` (ALLOW_PRIVATE_BASE_URL). NEVER enable in a
   * public deployment.
   */
  allowPrivate?: boolean;
  /** Covers DNS + TCP + TLS + time-to-first-response-header. Default 15s. */
  connectTimeoutMs?: number;
  /** Max gap between body chunks while a reader is waiting. Default 120s. */
  bodyTimeoutMs?: number;
  /** Cap for non-streaming (JSON) responses. Default 8 MiB. */
  maxResponseBytes?: number;
  /** Cap for `text/event-stream` responses. Default 64 MiB. */
  maxStreamBytes?: number;
}

const DEFAULTS = {
  connectTimeoutMs: 15_000,
  bodyTimeoutMs: 120_000,
  maxResponseBytes: 8 * 1024 * 1024,
  maxStreamBytes: 64 * 1024 * 1024,
} as const;

/** Cap on a request body. Large enough for a CV plus transcript, small enough to bound memory. */
const MAX_REQUEST_BYTES = 32 * 1024 * 1024;

/**
 * Headers the caller may not set. `host` would let the connection be addressed
 * as something other than the host we validated; the rest are hop-by-hop and
 * either desynchronise framing or re-introduce a proxy path.
 */
const FORBIDDEN_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authorization",
  "proxy-authenticate",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "expect",
  "content-length",
]);

const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// CR, LF and NUL in a value is response splitting / request smuggling.
const HEADER_VALUE_FORBIDDEN = /[\r\n\0]/;

const ALLOWED_METHODS = new Set(["GET", "POST"]);

/** Endpoint -> default method. The key check also rejects anything unlisted. */
const ENDPOINT_DEFAULTS: Readonly<Record<GuardedEndpoint, "GET" | "POST">> = {
  models: "GET",
  "chat/completions": "POST",
};

/* -------------------------------------------------------------------------- */
/* Request construction                                                        */
/* -------------------------------------------------------------------------- */

function isGuardedEndpoint(value: unknown): value is GuardedEndpoint {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ENDPOINT_DEFAULTS, value);
}

/**
 * Composes `<base>/<endpoint>` and then re-runs the full pre-DNS policy over
 * the RESULT, not just the base. A base that passed on its own can still
 * produce a rejected composed URL.
 */
function composeUrl(base: URL, endpoint: GuardedEndpoint): URL {
  const composed = new URL(base.href);
  composed.pathname = `${base.pathname.replace(/\/+$/, "")}/${endpoint}`;
  composed.search = "";
  composed.hash = "";
  return composed;
}

function buildHeaders(
  init: GuardedRequestInit,
  method: string,
  body: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    // We do not negotiate compression: a compressed body would defeat the byte
    // cap below and open a decompression-bomb path.
    "accept-encoding": "identity",
    accept: "application/json, text/event-stream",
  };

  let supplied: Headers;
  try {
    supplied = new Headers(init.headers);
  } catch {
    throw new TransportError("invalid_request", "Request headers are not valid.");
  }

  for (const [name, value] of supplied.entries()) {
    const key = name.toLowerCase();
    if (FORBIDDEN_HEADERS.has(key)) {
      throw new TransportError("invalid_request", `Header "${key}" is not allowed.`);
    }
    if (!HEADER_NAME.test(key) || HEADER_VALUE_FORBIDDEN.test(value)) {
      throw new TransportError("invalid_request", "Request headers contain invalid characters.");
    }
    headers[key] = value;
  }

  if (body !== undefined) {
    headers["content-length"] = String(Buffer.byteLength(body));
    if (headers["content-type"] === undefined) headers["content-type"] = "application/json";
  }
  // A GET must not carry a body; node would either drop it or mis-frame it.
  if (method === "GET" && headers["content-length"] !== undefined) {
    throw new TransportError("invalid_request", "GET requests must not have a body.");
  }
  return headers;
}

/* -------------------------------------------------------------------------- */
/* DNS pinning                                                                 */
/* -------------------------------------------------------------------------- */

interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

/**
 * Resolves the host once and returns exactly one address that the socket will be
 * pinned to.
 *
 * EVERY answer must pass `assertAddressAllowed`, not just the first. A resolver
 * that returns one public and one loopback address is either compromised or a
 * rebinding attack, and picking the "good" one would be choosing to trust the
 * attacker's ordering. Fail closed on any unsafe answer.
 */
async function pinHost(
  hostname: string,
  protocol: HttpProtocol,
  allowPrivate: boolean,
  resolver: typeof dns.lookup,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<PinnedAddress> {
  const host = stripIpv6Brackets(hostname);
  if (host === "") {
    throw new UrlPolicyError("invalid_host", "Endpoint URL has no host.");
  }

  // An IP literal needs no resolution; validate it and pin it directly.
  const literalFamily = resolveFamily(host);
  if (literalFamily !== null) {
    assertAddressAllowed(host, protocol, allowPrivate);
    return { address: host, family: literalFamily };
  }

  const records = await lookupAll(host, resolver, signal, timeoutMs);
  if (records.length === 0) {
    throw new TransportError("dns_failed", "Endpoint hostname did not resolve.");
  }

  const usable: PinnedAddress[] = [];
  for (const record of records) {
    if (typeof record?.address !== "string") {
      throw new TransportError("dns_failed", "Endpoint resolver returned a malformed answer.");
    }
    const family = resolveFamily(record.address);
    if (family === null || (record.family !== undefined && family !== record.family)) {
      throw new TransportError("dns_failed", "Endpoint resolver returned an inconsistent answer.");
    }
    // Throws on the first unsafe answer — including unsafe ones we would not
    // have used — which is the whole point.
    assertAddressAllowed(record.address, protocol, allowPrivate);
    usable.push({ address: record.address, family });
  }
  return usable[0];
}

/** 4 / 6 for a well-formed IP literal, null for anything else. */
function resolveFamily(address: string): 4 | 6 | null {
  const bare = stripIpv6Brackets(String(address));
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return 4;
  if (bare.includes(":")) return 6;
  return null;
}

function lookupAll(
  host: string,
  resolver: typeof dns.lookup,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Array<{ address: string; family?: number }>> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TransportError("aborted", "Request was aborted."));
      return;
    }

    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    function onAbort() {
      // A dns.lookup already in flight cannot be cancelled, but refusing to
      // connect afterwards is what actually matters.
      finish(() => reject(new TransportError("aborted", "Request was aborted.")));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      finish(() => reject(new TransportError("connect_timeout", "Endpoint did not respond in time.")));
    }, timeoutMs);
    timer.unref?.();

    let callback: (error: unknown, addresses?: unknown) => void;
    try {
      callback = (error: unknown, addresses?: unknown) => {
        if (error) {
          // The raw resolver error can contain the host and OS detail; drop it.
          finish(() => reject(new TransportError("dns_failed", "Endpoint hostname lookup failed.")));
          return;
        }
        if (!Array.isArray(addresses)) {
          // A resolver that ignored `all: true` gave us a shape we cannot audit.
          finish(() =>
            reject(new TransportError("dns_failed", "Endpoint resolver returned an unexpected answer.")),
          );
          return;
        }
        finish(() => resolve(addresses as Array<{ address: string; family?: number }>));
      };
      // `dns.lookup` is heavily overloaded; narrow it once here rather than
      // scattering casts across the call sites.
      const lookup = resolver as unknown as (
        hostname: string,
        options: { all: true; verbatim: true },
        cb: (error: unknown, addresses?: unknown) => void,
      ) => void;
      lookup(host, { all: true, verbatim: true }, callback);
    } catch {
      finish(() => reject(new TransportError("dns_failed", "Endpoint hostname lookup failed.")));
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Public transport                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Performs one guarded request. See the module header for the guarantees.
 *
 * Rejects with `UrlPolicyError` when the target is refused, and with
 * `TransportError` for every other failure. Never resolves for a 3xx.
 */
export async function guardedRequest(
  baseUrl: string,
  endpoint: GuardedEndpoint,
  init: GuardedRequestInit = {},
  options: GuardedRequestOptions = {},
): Promise<Response> {
  const allowPrivate = options.allowPrivate ?? readAllowPrivateFromEnv();
  const resolver = options.resolver ?? dns.lookup;
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULTS.connectTimeoutMs;
  const bodyTimeoutMs = options.bodyTimeoutMs ?? DEFAULTS.bodyTimeoutMs;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULTS.maxResponseBytes;
  const maxStreamBytes = options.maxStreamBytes ?? DEFAULTS.maxStreamBytes;

  if (!isGuardedEndpoint(endpoint)) {
    throw new TransportError("invalid_request", "Unsupported endpoint.");
  }

  // `RequestInit.signal` is `AbortSignal | null | undefined`.
  const signal = init.signal ?? undefined;

  // Gate 1: the base URL. Re-checked on every call, never cached.
  const normalized = normalizeBaseUrl(baseUrl, { allowPrivate });
  const base = new URL(normalized);
  const baseRejection = classifyTargetDetailed(base, allowPrivate);
  if (baseRejection !== null) {
    throw new UrlPolicyError(baseRejection.code, baseRejection.message);
  }

  // Gate 2: the composed request URL, not just the base.
  const url = composeUrl(base, endpoint);
  const composedRejection = classifyTargetDetailed(url, allowPrivate);
  if (composedRejection !== null) {
    throw new UrlPolicyError(composedRejection.code, composedRejection.message);
  }

  const method = String(init.method ?? ENDPOINT_DEFAULTS[endpoint]).toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw new TransportError("invalid_request", `Unsupported method: ${method}.`);
  }

  // `RequestInit.body` is `BodyInit | null`. Only a string is accepted; a
  // stream/FormData/Blob body is refused rather than coerced, because a JSON
  // provider call has exactly one correct body type.
  let body: string | undefined;
  if (init.body !== undefined && init.body !== null) {
    if (typeof init.body !== "string") {
      throw new TransportError("invalid_request", "Request body must be a string.");
    }
    if (Buffer.byteLength(init.body) > MAX_REQUEST_BYTES) {
      throw new TransportError("invalid_request", "Request body is too large.");
    }
    body = init.body;
  }
  const headers = buildHeaders(init, method, body);

  if (signal?.aborted) {
    throw new TransportError("aborted", "Request was aborted.");
  }

  // Gate 3: connect-time DNS. Runs after the URL checks and before any socket.
  // Share one deadline with TCP/TLS and response headers; DNS must not extend it.
  const deadline = Date.now() + connectTimeoutMs;
  const pinned = await pinHost(
    url.hostname,
    url.protocol as HttpProtocol,
    allowPrivate,
    resolver,
    signal,
    connectTimeoutMs,
  );
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    throw new TransportError("connect_timeout", "Endpoint did not respond in time.");
  }

  return sendGuarded({
    url,
    method,
    headers,
    body,
    signal,
    pinned,
    connectTimeoutMs: remainingMs,
    bodyTimeoutMs,
    maxResponseBytes,
    maxStreamBytes,
  });
}

interface SendArgs {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  signal: AbortSignal | undefined;
  pinned: PinnedAddress;
  connectTimeoutMs: number;
  bodyTimeoutMs: number;
  maxResponseBytes: number;
  maxStreamBytes: number;
}

function sendGuarded(args: SendArgs): Promise<Response> {
  const { url, method, headers, body, signal, pinned } = args;
  const isHttps = url.protocol === "https:";
  // An IP literal must not be sent as SNI; a name must be, so the certificate is
  // verified against the name we validated rather than the pinned IP.
  const isLiteralHost = pinned.address === stripIpv6Brackets(url.hostname);

  // `https.RequestOptions` extends `http.RequestOptions`, so one object serves
  // both drivers; `servername` is inert for a plaintext request.
  const requestOptions: https.RequestOptions = {
    method,
    // agent:false gives this request its own throwaway agent with keepAlive off,
    // so no socket is ever reused across requests. It also guarantees a caller-
    // or environment-supplied agent cannot be picked up, which is where a proxy
    // would otherwise enter.
    agent: false,
    headers,
    // The pinned, already-validated address is what the socket connects to; the
    // hostname never triggers a second resolution.
    //
    // The `all` branch is not optional. With `autoSelectFamily` (Node's default
    // since v20) net.connect calls `lookup(host, { all: true }, cb)` and expects
    // an ARRAY of addresses. A callback returning the scalar form makes Node read
    // `addresses[0]` and fail with "Invalid IP address: undefined".
    lookup: (hostname, options, callback) => {
      const wantsAll = (options as { all?: boolean } | undefined)?.all === true;
      if (wantsAll) {
        (callback as unknown as (e: null, a: Array<{ address: string; family: number }>) => void)(
          null,
          [{ address: pinned.address, family: pinned.family }],
        );
        return;
      }
      (callback as unknown as (e: null, a: string, f: number) => void)(
        null,
        pinned.address,
        pinned.family,
      );
    },
    servername: isLiteralHost ? undefined : url.hostname,
  };

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    let connectTimer: NodeJS.Timeout | undefined;
    let response: http.IncomingMessage | undefined;

    const clearConnectTimer = () => {
      if (connectTimer !== undefined) {
        clearTimeout(connectTimer);
        connectTimer = undefined;
      }
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearConnectTimer();
      signal?.removeEventListener("abort", onAbort);
      response?.destroy();
      reject(error);
    };

    const onResponse = (incoming: http.IncomingMessage) => {
      response = incoming;
      if (connectTimer !== undefined) {
        clearTimeout(connectTimer);
        connectTimer = undefined;
      }

      const status = incoming.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        // Refused, not followed: a 302 to an internal host is the whole point.
        incoming.destroy();
        fail(new TransportError("redirect_not_allowed", "Endpoint redirects are not permitted."));
        return;
      }
      if (status < 200 || status > 599) {
        incoming.destroy();
        fail(new TransportError("invalid_response", "Endpoint returned an unusable status."));
        return;
      }

      const encoding = incoming.headers["content-encoding"];
      if (encoding !== undefined && String(encoding).toLowerCase() !== "identity") {
        incoming.destroy();
        fail(new TransportError("unsupported_encoding", "Endpoint response must not be compressed."));
        return;
      }

      const streaming = String(incoming.headers["content-type"] ?? "")
        .toLowerCase()
        .startsWith("text/event-stream");
      const limit = streaming ? args.maxStreamBytes : args.maxResponseBytes;

      // Reject an oversized body from its declared length before reading a byte.
      const declared = Number(incoming.headers["content-length"]);
      if (Number.isFinite(declared) && declared > limit) {
        incoming.destroy();
        fail(new TransportError("response_too_large", "Endpoint response is too large."));
        return;
      }

      let outHeaders: Headers;
      try {
        outHeaders = responseHeaders(incoming.headers);
      } catch {
        incoming.destroy();
        fail(new TransportError("invalid_response", "Endpoint returned an unusable response."));
        return;
      }

      // 204/205/304 are defined to carry no body; `new Response` rejects one, so
      // hand back null and let the socket close.
      const nullBodyStatus = status === 204 || status === 205 || status === 304;
      // The body stream owns the abort listener from here on. Detaching it when
      // the promise resolves would leave a caller who aborts mid-stream (a user
      // pressing Stop) waiting out the full idle timeout instead of stopping.
      const bodyStream = nullBodyStatus
        ? null
        : buildCappedBody(incoming, limit, args.bodyTimeoutMs, fail, signal, () =>
            signal?.removeEventListener("abort", onAbort),
          );
      if (nullBodyStatus) {
        incoming.destroy();
        signal?.removeEventListener("abort", onAbort);
      }

      if (settled) return;
      settled = true;
      clearConnectTimer();
      try {
        resolve(new Response(bodyStream, { status, statusText: incoming.statusMessage, headers: outHeaders }));
      } catch {
        incoming.destroy();
        signal?.removeEventListener("abort", onAbort);
        reject(new TransportError("invalid_response", "Endpoint returned an unusable response."));
      }
    };

    const request = isHttps
      ? https.request(url, requestOptions, onResponse)
      : http.request(url, requestOptions, onResponse);

    function onAbort() {
      request.destroy(new TransportError("aborted", "Request was aborted."));
    }

    signal?.addEventListener("abort", onAbort, { once: true });

    // Covers DNS, TCP, TLS and time-to-first-byte. Cleared once headers land;
    // the body has its own idle timer.
    connectTimer = setTimeout(() => {
      fail(new TransportError("connect_timeout", "Endpoint did not respond in time."));
      request.destroy();
    }, args.connectTimeoutMs);
    connectTimer.unref?.();

    request.on("error", (error: NodeJS.ErrnoException) => {
      // Our own TransportError (abort / timeout) is meaningful; everything else
      // is collapsed so socket detail and the host name never escape.
      fail(
        error instanceof TransportError
          ? error
          : new TransportError("network_error", "Endpoint request failed."),
      );
    });

    request.end(body);
  });
}

/**
 * Wraps the response body in a byte-capped, timeout-guarded web stream that also
 * honours the caller's AbortSignal for the WHOLE transfer, not just the connect
 * phase. `onRelease` drops the caller's request-level abort listener once this
 * stream owns it.
 */
function buildCappedBody(
  incoming: http.IncomingMessage,
  limit: number,
  bodyTimeoutMs: number,
  onFatal: (error: Error) => void,
  signal: AbortSignal | undefined,
  onRelease: () => void,
): ReadableStream<Uint8Array> {
  const source = Readable.toWeb(incoming) as unknown as ReadableStream<Uint8Array>;
  const reader = source.getReader();
  let total = 0;
  let released = false;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const release = () => {
    if (released) return;
    released = true;
    signal?.removeEventListener("abort", onAbortBody);
    onRelease();
  };

  /**
   * Stops the transfer. `reader.cancel()` is what tears the socket down — toWeb
   * destroys the IncomingMessage from it — so `release()` deliberately does NOT
   * call `incoming.destroy()`. Destroying first would make toWeb report the
   * premature close against an already-closed controller, which surfaces as an
   * uncaught ERR_INVALID_STATE instead of an error on the caller's stream.
   */
  const stop = () => {
    release();
    reader.cancel().catch(() => {});
  };

  function onAbortBody() {
    const error = new TransportError("aborted", "Request was aborted.");
    controllerRef?.error(error);
    stop();
    // No-op once the promise has resolved; the stream error above is the signal.
    onFatal(error);
  }
  signal?.addEventListener("abort", onAbortBody, { once: true });

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
    async pull(controller) {
      // Armed only while a read is outstanding, so a slow consumer is never
      // mistaken for a stalled server, and a stalled server is still caught.
      const timer = setTimeout(() => {
        const error = new TransportError("body_timeout", "Endpoint response stalled.");
        controller.error(error);
        stop();
        onFatal(error);
      }, bodyTimeoutMs);
      timer.unref?.();

      try {
        const { done, value } = await reader.read();
        clearTimeout(timer);
        // An abort may have errored the stream while this read was in flight.
        if (released) return;
        if (done) {
          stop();
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > limit) {
          const error = new TransportError("response_too_large", "Endpoint response is too large.");
          controller.error(error);
          stop();
          onFatal(error);
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        clearTimeout(timer);
        stop();
        controller.error(
          error instanceof TransportError
            ? error
            : new TransportError("network_error", "Endpoint response failed."),
        );
      }
    },
    cancel(reason) {
      release();
      reader.cancel(reason).catch(() => {});
    },
  });
}

/** Copies Node headers into a `Headers`, rejecting anything malformed. */
function responseHeaders(raw: http.IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (!HEADER_NAME.test(name) || HEADER_VALUE_FORBIDDEN.test(name)) {
      throw new TransportError("invalid_response", "Endpoint returned a malformed header.");
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (HEADER_VALUE_FORBIDDEN.test(item)) {
          throw new TransportError("invalid_response", "Endpoint returned a malformed header.");
        }
        headers.append(name, item);
      }
      continue;
    }
    if (HEADER_VALUE_FORBIDDEN.test(value)) {
      throw new TransportError("invalid_response", "Endpoint returned a malformed header.");
    }
    headers.set(name, value);
  }
  return headers;
}
