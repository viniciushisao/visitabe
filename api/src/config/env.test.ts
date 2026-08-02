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
});
