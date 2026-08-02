export type AuthErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "INVALID_REFRESH_TOKEN"
  | "REFRESH_TOKEN_EXPIRED"
  | "SESSION_REVOKED"
  | "INTERNAL_ERROR";

const defaultMessages = {
  INVALID_REQUEST: "The request is invalid.",
  UNAUTHORIZED: "Authentication is required.",
  INVALID_REFRESH_TOKEN: "The session is no longer valid.",
  REFRESH_TOKEN_EXPIRED: "The session has expired.",
  SESSION_REVOKED: "The session has been revoked.",
  INTERNAL_ERROR: "An internal error occurred.",
} satisfies Record<AuthErrorCode, string>;

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message = defaultMessages[code]) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) {
    return error;
  }

  return new AuthError("INTERNAL_ERROR");
}
