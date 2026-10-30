import { describe, expect, it } from "vitest";

import { fail, ok, toResponse } from "@/lib/api-response";

describe("api-response — chuẩn hoá mọi route", () => {
  it("ok() trả { ok: true, data }", () => {
    expect(ok({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
  });

  it("fail() trả { ok: false, error }", () => {
    expect(fail("not_found")).toEqual({ ok: false, error: "not_found" });
  });

  it("fail() kèm message", () => {
    expect(fail("invalid_input", "Sai dữ liệu")).toEqual({
      ok: false,
      error: "invalid_input",
      message: "Sai dữ liệu",
    });
  });

  it("mỗi error code map đúng HTTP status", async () => {
    const cases: Array<[Parameters<typeof fail>[0], number]> = [
      ["invalid_input", 400],
      ["not_found", 404],
      ["conflict", 409],
      ["no_api_key", 503],
      ["ai_error", 502],
      ["db_error", 500],
      ["unknown", 500],
    ];

    for (const [code, status] of cases) {
      const response = toResponse(fail(code));
      expect(response.status).toBe(status);
    }
  });

  it("toResponse với ok trả status 200", () => {
    expect(toResponse(ok("x")).status).toBe(200);
  });

  it("response body luôn có trường ok", async () => {
    const success = await toResponse(ok([1, 2])).json();
    expect(success.ok).toBe(true);

    const failure = await toResponse(fail("conflict")).json();
    expect(failure.ok).toBe(false);
    expect(failure.error).toBe("conflict");
  });
});
