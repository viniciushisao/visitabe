import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.js";

const baseEnv = {
  NODE_ENV: "production",
  HOST: "127.0.0.1",
  PORT: "3000",
  AUTH_ISSUER: "https://api.visita.test",
  AUTH_AUDIENCE: "visita-web",
  AUTH_ACCESS_TOKEN_TTL_SECONDS: "900",
  AUTH_REFRESH_TOKEN_TTL_SECONDS: "2592000",
  AUTH_JWT_ALGORITHM: "HS256",
  JWT_SECRET: "test-jwt-secret-with-at-least-thirty-two-characters",
  AUTH_REFRESH_TOKEN_PEPPER:
    "test-refresh-pepper-with-at-least-thirty-two-characters",
};

describe("loadEnv", () => {
  it("parses unique web CORS origins", () => {
    const env = loadEnv({
      ...baseEnv,
      WEB_CORS_ORIGINS: "https://app.visita.test, https://app.visita.test/path",
    });

    expect(env.web.corsOrigins).toEqual(["https://app.visita.test"]);
    expect(env.openApi).toEqual({ enabled: false });
  });

  it("requires web CORS origins outside development", () => {
    expect(() => loadEnv(baseEnv)).toThrow(
      "WEB_CORS_ORIGINS is required outside development.",
    );
  });

  it("rejects malformed web CORS origins", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        WEB_CORS_ORIGINS: "not-a-url",
      }),
    ).toThrow("WEB_CORS_ORIGINS must contain valid URL origins.");
  });

  it("enables unprotected OpenAPI routes by default in development", () => {
    const env = loadEnv({
      ...baseEnv,
      NODE_ENV: "development",
    });

    expect(env.openApi).toEqual({ enabled: true });
  });

  it("rejects malformed OpenAPI enabled values", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        WEB_CORS_ORIGINS: "https://app.visita.test",
        OPENAPI_ENABLED: "yes",
      }),
    ).toThrow("OPENAPI_ENABLED must be true or false.");
  });

  it("requires basic auth when OpenAPI is enabled outside development", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        WEB_CORS_ORIGINS: "https://app.visita.test",
        OPENAPI_ENABLED: "true",
      }),
    ).toThrow(
      "OPENAPI_BASIC_AUTH_USERNAME and OPENAPI_BASIC_AUTH_PASSWORD are required when OpenAPI is enabled outside development.",
    );
  });

  it("parses protected OpenAPI settings outside development", () => {
    const env = loadEnv({
      ...baseEnv,
      WEB_CORS_ORIGINS: "https://app.visita.test",
      OPENAPI_ENABLED: "true",
      OPENAPI_BASIC_AUTH_USERNAME: "docs",
      OPENAPI_BASIC_AUTH_PASSWORD:
        "test-docs-password-with-at-least-thirty-two-characters",
    });

    expect(env.openApi).toEqual({
      enabled: true,
      basicAuth: {
        username: "docs",
        password: "test-docs-password-with-at-least-thirty-two-characters",
      },
    });
  });
});
