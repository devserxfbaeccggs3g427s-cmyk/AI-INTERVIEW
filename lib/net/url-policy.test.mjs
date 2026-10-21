/**
 * Tests for lib/net/url-policy.ts.
 *
 * Offline and dependency-free:
 *   node --test lib/net/url-policy.test.mjs
 *
 * Written as .mjs on purpose. The application sources use extensionless relative
 * imports (required by `moduleResolution: "bundler"` — tsc rejects a `.ts`
 * extension there), which Node's native ESM resolver cannot follow. This module
 * imports only `node:` builtins, so it needs no resolver shim.
 *
 * The security bar here is asymmetric on purpose: any destination that is merely
 * *probably* internal must be refused. A test that fails because the policy got
 * stricter is a good outcome; a test that fails because it got looser is a bug.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  UrlPolicyError,
  assertAddressAllowed,
  classifyAddress,
  classifyTarget,
  classifyTargetDetailed,
  normalizeBaseUrl,
  readAllowPrivateFromEnv,
} from "./url-policy.ts";

/** Asserts `fn` throws a UrlPolicyError carrying exactly `code`. */
function throwsCode(fn, code, label) {
  let thrown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof UrlPolicyError, `${label}: expected UrlPolicyError, got ${thrown}`);
  assert.equal(thrown.code, code, `${label}: expected code "${code}", got "${thrown.code}"`);
}

describe("normalizeBaseUrl — canonicalisation", () => {
  it("lower-cases the host and strips trailing slashes", () => {
    assert.equal(normalizeBaseUrl("https://API.OpenAI.com/v1/"), "https://api.openai.com/v1");
    assert.equal(normalizeBaseUrl("https://api.openai.com/v1///"), "https://api.openai.com/v1");
    assert.equal(normalizeBaseUrl("https://api.openai.com/"), "https://api.openai.com/v1");
    assert.equal(normalizeBaseUrl("https://api.openai.com"), "https://api.openai.com/v1");
    assert.equal(normalizeBaseUrl("https://api.openai.com/v1/chat/completions"), "https://api.openai.com/v1");
    assert.equal(normalizeBaseUrl("http://localhost:11434", { allowPrivate: true }), "http://localhost:11434/v1");
    throwsCode(() => normalizeBaseUrl("https://api.openai.com/v1/../admin"), "forbidden_characters", "dot segment");
    throwsCode(() => normalizeBaseUrl("https://api.openai.com/%2e%2e/admin"), "forbidden_characters", "encoded dot");
    throwsCode(() => normalizeBaseUrl("http://2130706433/v1", { allowPrivate: false }), "unsupported_protocol", "numeric loopback");
    assert.equal(normalizeBaseUrl("http://2130706433/v1", { allowPrivate: true }), "http://127.0.0.1/v1");
  });

  it("drops a redundant default port", () => {
    assert.equal(normalizeBaseUrl("https://api.openai.com:443/v1"), "https://api.openai.com/v1");
  });

  it("trims surrounding whitespace but keeps a deep path", () => {
    assert.equal(normalizeBaseUrl("  https://api.openai.com/v1  "), "https://api.openai.com/v1");
    assert.equal(
      normalizeBaseUrl("https://gateway.internal-host.example.com/openai/v1"),
      "https://gateway.internal-host.example.com/openai/v1",
    );
  });

  it("accepts a public IPv4 literal", () => {
    assert.equal(normalizeBaseUrl("https://93.184.216.34/v1"), "https://93.184.216.34/v1");
  });

  it("accepts loopback over http only under the opt-in", () => {
    assert.equal(
      normalizeBaseUrl("http://127.0.0.1:11434/v1", { allowPrivate: true }),
      "http://127.0.0.1:11434/v1",
    );
  });
});

describe("normalizeBaseUrl — rejections", () => {
  it("refuses plain http without the opt-in", () => {
    throwsCode(() => normalizeBaseUrl("http://api.example.test/v1"), "unsupported_protocol", "http");
    throwsCode(() => normalizeBaseUrl("http://127.0.0.1:11434/v1"), "unsupported_protocol", "http loopback");
  });

  it("refuses non-HTTP schemes", () => {
    for (const raw of [
      "ftp://example.com/v1",
      "file:///etc/passwd",
      "data:text/plain,hi",
      "javascript:alert(1)",
      "gopher://example.com",
    ]) {
      throwsCode(() => normalizeBaseUrl(raw), "unsupported_protocol", raw);
    }
  });

  it("refuses embedded credentials", () => {
    throwsCode(() => normalizeBaseUrl("https://user:pass@api.example.test/v1"), "credentials_in_url", "creds");
    throwsCode(() => normalizeBaseUrl("https://user@api.example.test/v1"), "credentials_in_url", "user only");
  });

  it("refuses a query string or fragment", () => {
    throwsCode(() => normalizeBaseUrl("https://api.example.test/v1?key=abc"), "query_or_fragment", "query");
    throwsCode(() => normalizeBaseUrl("https://api.example.test/v1#frag"), "query_or_fragment", "fragment");
  });

  it("refuses percent-encoded delimiters used for path smuggling", () => {
    throwsCode(() => normalizeBaseUrl("https://api.example.test/v1%2f..%2fadmin"), "forbidden_characters", "%2f");
    throwsCode(() => normalizeBaseUrl("https://api.example.test/v1%5cadmin"), "forbidden_characters", "%5c");
    throwsCode(() => normalizeBaseUrl("https://api.example.test/v1%0d%0aX-Injected:1"), "forbidden_characters", "CRLF");
    throwsCode(() => normalizeBaseUrl("https://api.example.test/v1%00"), "forbidden_characters", "NUL");
  });

  it("refuses internal-only host names regardless of the opt-in", () => {
    for (const host of [
      "localhost",
      "sub.localhost",
      "db.internal",
      "metadata.google.internal",
      "printer.local",
      "box.lan",
      "host.home.arpa",
      "corp.example",
      "svc.test",
      "svc.invalid",
      "abc.onion",
    ]) {
      throwsCode(() => normalizeBaseUrl(`https://${host}/v1`), "blocked_hostname", host);
      throwsCode(
        () => normalizeBaseUrl(`https://${host}/v1`, { allowPrivate: true }),
        "blocked_hostname",
        `${host} + optin`,
      );
    }
  });

  it("refuses a single-label host without the opt-in", () => {
    throwsCode(() => normalizeBaseUrl("https://myserver/v1"), "invalid_host", "single label");
  });

  it("refuses malformed host names", () => {
    // `.com` rather than `.test`: a blocked-suffix host is rejected earlier, and
    // these cases are specifically about DNS label shape.
    throwsCode(() => normalizeBaseUrl("https://-lead.example.com/v1"), "invalid_host", "leading dash");
    throwsCode(() => normalizeBaseUrl("https://trail-.example.com/v1"), "invalid_host", "trailing dash");
    throwsCode(() => normalizeBaseUrl("https://a..b.example.com/v1"), "invalid_host", "empty label");
    throwsCode(() => normalizeBaseUrl(`https://${"x".repeat(64)}.example.com/v1`), "invalid_host", "long label");
    throwsCode(() => normalizeBaseUrl("https://exa mple.test/v1"), "invalid_url", "space in host");
    throwsCode(() => normalizeBaseUrl("not a url"), "invalid_url", "garbage");
    throwsCode(() => normalizeBaseUrl("/relative/path"), "invalid_url", "relative");
  });

  it("refuses reserved IP literals even with the opt-in", () => {
    const alwaysDenied = [
      "https://169.254.169.254/v1", // AWS/GCP/Azure metadata
      "https://169.254.170.2/v1", // ECS task metadata
      "https://100.100.100.200/v1", // Alibaba Cloud metadata (inside CGNAT)
      "https://192.0.0.192/v1", // IETF protocol assignments
      "https://0.0.0.0/v1",
      "https://100.64.0.1/v1", // CGNAT
      "https://224.0.0.1/v1", // multicast
      "https://255.255.255.255/v1",
      "https://192.0.2.1/v1", // TEST-NET-1
      "https://[fe80::1]/v1", // IPv6 link-local
      "https://[fd00:ec2::254]/v1", // AWS IMDS over IPv6, inside ULA
      "https://[::ffff:169.254.169.254]/v1",
      "https://[::ffff:100.100.100.200]/v1",
      "https://[2002:7f00:1::1]/v1", // 6to4 wrapping loopback
      "https://[::]/v1",
    ];
    for (const raw of alwaysDenied) {
      throwsCode(() => normalizeBaseUrl(raw), "unsafe_address", raw);
      throwsCode(() => normalizeBaseUrl(raw, { allowPrivate: true }), "unsafe_address", `${raw} + optin`);
    }
  });

  it("refuses private literals without the opt-in but allows them with it", () => {
    for (const raw of [
      "https://127.0.0.1/v1",
      "https://10.1.2.3/v1",
      "https://172.16.5.4/v1",
      "https://192.168.1.10/v1",
      "https://[::1]/v1",
      "https://[fd00::1]/v1",
    ]) {
      throwsCode(() => normalizeBaseUrl(raw), "unsafe_address", raw);
      assert.ok(normalizeBaseUrl(raw, { allowPrivate: true }), `${raw} + optin should pass`);
    }
  });

  it("refuses oversized and non-string input", () => {
    throwsCode(() => normalizeBaseUrl(`https://a.test/${"x".repeat(4000)}`), "too_long", "long");
    throwsCode(() => normalizeBaseUrl(123), "not_a_string", "number");
    throwsCode(() => normalizeBaseUrl(undefined), "not_a_string", "undefined");
    throwsCode(() => normalizeBaseUrl(null), "not_a_string", "null");
  });
});

describe("classifyAddress", () => {
  it("marks loopback, RFC1918 and ULA as private", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "::1", "fd00::1", "fe80::1"]) {
      const tier = classifyAddress(ip);
      // fe80::/10 is link-local, i.e. permanently denied, not merely private.
      assert.equal(ip === "fe80::1" ? "deny" : "private", tier, ip);
    }
  });

  it("marks reserved ranges as denied", () => {
    for (const ip of [
      "0.0.0.0",
      "169.254.169.254",
      "100.64.0.1",
      "192.0.0.1",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
      "::",
      "ff02::1",
      "2001:db8::1", // documentation
      "2001:2::1", // benchmarking
      "2001::1", // Teredo
      "::ffff:169.254.169.254",
      "3fff::1", // documentation
      "100::1", // discard-only
    ]) {
      assert.equal(classifyAddress(ip), "deny", ip);
    }
  });

  it("classifies a NAT64-wrapped address by the IPv4 it embeds", () => {
    // 64:ff9b::/96 carrying 127.0.0.1 is loopback, so it is private (opt-in
    // unlockable) rather than permanently denied.
    assert.equal(classifyAddress("64:ff9b::7f00:1"), "private");
    throwsCode(() => assertAddressAllowed("64:ff9b::7f00:1", "https:", false), "unsafe_address", "NAT64 loopback");
    assert.doesNotThrow(() => assertAddressAllowed("64:ff9b::7f00:1", "https:", true));
    // ...while the metadata address stays refused even under the opt-in.
    assert.equal(classifyAddress("64:ff9b::a9fe:a9fe"), "deny");
  });

  it("marks routable addresses as public", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"]) {
      assert.equal(classifyAddress(ip), "public", ip);
    }
  });

  it("treats unparseable input as denied rather than public", () => {
    for (const value of ["", "not-an-ip", "999.999.999.999", "1.2.3", "fe80::1%eth0", "::ffff:", "[::1]x"]) {
      assert.equal(classifyAddress(value), "deny", JSON.stringify(value));
    }
  });
});

describe("assertAddressAllowed", () => {
  it("keeps metadata and link-local blocked even with the opt-in", () => {
    for (const ip of [
      "169.254.169.254",
      "169.254.170.2",
      "100.100.100.200",
      "192.0.0.192",
      "fe80::1",
      "fd00:ec2::254",
      "0.0.0.0",
      "0.0.0.1",
      "100.64.0.1",
      "::ffff:169.254.169.254",
      "::ffff:100.100.100.200",
    ]) {
      throwsCode(() => assertAddressAllowed(ip, "https:", true), "unsafe_address", `${ip} optin https`);
    }
  });

  it("classifies a mapped address by the IPv4 it embeds", () => {
    // ::ffff:127.0.0.1 is loopback, so the opt-in unlocks it — unlike metadata.
    throwsCode(() => assertAddressAllowed("::ffff:127.0.0.1", "https:", false), "unsafe_address", "mapped, no optin");
    assert.doesNotThrow(() => assertAddressAllowed("::ffff:127.0.0.1", "https:", true));
    // ...and the metadata address stays refused under the opt-in.
    throwsCode(() => assertAddressAllowed("::ffff:169.254.169.254", "https:", true), "unsafe_address", "mapped metadata");
  });

  it("requires the opt-in for loopback and RFC1918", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "192.168.0.1", "::1", "fd00::1"]) {
      throwsCode(() => assertAddressAllowed(ip, "https:", false), "unsafe_address", `${ip} no optin`);
      assert.doesNotThrow(() => assertAddressAllowed(ip, "https:", true), `${ip} optin`);
    }
  });

  it("allows public addresses over https", () => {
    assert.doesNotThrow(() => assertAddressAllowed("8.8.8.8", "https:", false));
    assert.doesNotThrow(() => assertAddressAllowed("2606:4700:4700::1111", "https:", false));
  });

  it("allows plain http to any address when the opt-in is on", () => {
    assert.doesNotThrow(() => assertAddressAllowed("8.8.8.8", "http:", true), "public + http + optin");
    assert.doesNotThrow(() => assertAddressAllowed("127.0.0.1", "http:", true), "loopback + http + optin");
    throwsCode(() => assertAddressAllowed("8.8.8.8", "http:", false), "unsupported_protocol", "public + http no optin");
    throwsCode(() => assertAddressAllowed("127.0.0.1", "http:", false), "unsupported_protocol", "loopback + http no optin");
  });

  it("rejects unsupported protocols", () => {
    throwsCode(() => assertAddressAllowed("8.8.8.8", "ftp:", true), "unsupported_protocol", "ftp");
  });

  it("rejects anything that is not an IP literal", () => {
    throwsCode(() => assertAddressAllowed("example.com", "https:", false), "unsafe_address", "hostname");
    throwsCode(() => assertAddressAllowed("", "https:", false), "unsafe_address", "empty");
  });
});

describe("classifyTarget", () => {
  it("returns null for an acceptable target", () => {
    assert.equal(classifyTarget(new URL("https://api.openai.com/v1"), false), null);
    assert.equal(classifyTarget(new URL("https://api.openai.com/v1/models"), false), null);
  });

  it("returns a reason string for a rejected target", () => {
    assert.ok(classifyTarget(new URL("https://localhost/v1"), false));
    assert.ok(classifyTarget(new URL("https://169.254.169.254/v1"), false));
    assert.ok(classifyTarget(new URL("https://169.254.169.254/v1"), true));
    assert.ok(classifyTarget(new URL("http://api.openai.com/v1"), false));
    assert.ok(classifyTarget(new URL("https://user:pw@api.openai.com/v1"), false));
    assert.ok(classifyTarget(new URL("https://api.openai.com/v1?a=1"), false));
  });

  it("accepts a literal loopback target only under the opt-in", () => {
    const url = new URL("http://127.0.0.1:11434/v1");
    assert.ok(classifyTarget(url, false));
    assert.equal(classifyTarget(url, true), null);
  });

  it("throws rather than guessing when handed a non-URL", () => {
    throwsCode(() => classifyTarget("https://api.openai.com", false), "invalid_url", "string");
  });

  it("keeps the machine-readable code in classifyTargetDetailed", () => {
    assert.equal(classifyTargetDetailed(new URL("https://api.openai.com/v1"), false), null);
    assert.equal(
      classifyTargetDetailed(new URL("https://localhost/v1"), false).code,
      "blocked_hostname",
    );
    assert.equal(
      classifyTargetDetailed(new URL("http://api.openai.com/v1"), false).code,
      "unsupported_protocol",
    );
    assert.equal(
      classifyTargetDetailed(new URL("https://169.254.169.254/v1"), true).code,
      "unsafe_address",
    );
    assert.equal(
      classifyTargetDetailed(new URL("https://api.openai.com/v1?a=1"), false).code,
      "query_or_fragment",
    );
  });
});

describe("readAllowPrivateFromEnv", () => {
  it("is false for anything that is not an explicit yes", () => {
    for (const env of [
      {},
      { ALLOW_PRIVATE_BASE_URL: "" },
      { ALLOW_PRIVATE_BASE_URL: "0" },
      { ALLOW_PRIVATE_BASE_URL: "false" },
      { ALLOW_PRIVATE_BASE_URL: "yes" },
      { ALLOW_PRIVATE_BASE_URL: "on" },
      { ALLOW_PRIVATE_BASE_URL: "  " },
    ]) {
      assert.equal(readAllowPrivateFromEnv(env), false, JSON.stringify(env));
    }
  });

  it("is true only for the explicit value 1", () => {
    assert.equal(readAllowPrivateFromEnv({ ALLOW_PRIVATE_BASE_URL: "1" }), true);
    for (const value of ["true", "TRUE", "True", " true ", " 1 "]) {
      assert.equal(readAllowPrivateFromEnv({ ALLOW_PRIVATE_BASE_URL: value }), false, value);
    }
  });
});
