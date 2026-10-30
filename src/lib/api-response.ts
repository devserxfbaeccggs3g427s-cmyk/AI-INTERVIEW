/**
 * Chuẩn hoá response cho **mọi** API route (FR-AF-27).
 * Format: `{ ok: true, data }` | `{ ok: false, error, message? }`.
 */

export type ApiErrorCode =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "no_api_key"
  | "ai_error"
  | "db_error"
  | "unknown";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: ApiErrorCode;
  message?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const STATUS_BY_ERROR: Record<ApiErrorCode, number> = {
  invalid_input: 400,
  not_found: 404,
  conflict: 409,
  no_api_key: 503,
  ai_error: 502,
  db_error: 500,
  unknown: 500,
};

/** Response thành công. */
export function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

/** Response thất bại. */
export function fail(error: ApiErrorCode, message?: string): ApiFailure {
  return message === undefined ? { ok: false, error } : { ok: false, error, message };
}

/** Chuyển `ApiResult` thành `Response` với status code đúng. */
export function toResponse<T>(result: ApiResult<T>): Response {
  if (result.ok) {
    return Response.json(result);
  }
  return Response.json(result, { status: STATUS_BY_ERROR[result.error] ?? 500 });
}
