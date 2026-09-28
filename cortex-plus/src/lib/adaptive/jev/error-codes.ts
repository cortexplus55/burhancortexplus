/** Shared Jev error codes — no server-only import. */

export type JevErrorCode =
  | "missing_credential"
  | "unauthorized"
  | "payment_required"
  | "forbidden"
  | "invalid_request"
  | "rate_limited"
  | "overloaded"
  | "server_error"
  | "timeout"
  | "network"
  | "invalid_response";
