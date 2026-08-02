import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import type { AuthRepository } from "./auth/auth-repository.js";
import { AuthService } from "./auth/auth-service.js";
import { TokenService } from "./auth/token-service.js";
import type { ApiEnv } from "./config/env.js";

const authConfig = {
  issuer: "https://api.visita.test",
  audience: "visita-web",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
  jwtAlgorithm: "HS256",
  jwtSecret: "test-jwt-secret-with-at-least-thirty-two-characters",
  refreshTokenPepper: "test-refresh-pepper-with-at-least-thirty-two-characters",
} satisfies ApiEnv["auth"];

describe("buildApp", () => {
  it("creates a Fastify app without registering endpoints yet", async () => {
    const app = buildApp({ logger: false });

    await app.ready();

    expect(app.hasRoute({ method: "GET", url: "/" })).toBe(false);

    await app.close();
  });

  it("allows configured web origins through CORS", async () => {
    const app = buildApp({
      logger: false,
      webCorsOrigins: ["https://app.visita.test"],
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/auth/me",
      headers: {
        origin: "https://app.visita.test",
        "access-control-request-method": "GET",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://app.visita.test",
    );
    expect(response.headers["access-control-allow-credentials"]).toBe("true");

    await app.close();
  });

  it("serves OpenAPI JSON for registered auth routes", async () => {
    const app = buildDocumentedAuthApp();

    const response = await app.inject({
      method: "GET",
      url: "/openapi.json",
    });
    const openApi = response.json<OpenApiDocument>();

    expect(response.statusCode).toBe(200);
    expect(openApi.openapi).toBe("3.0.3");
    expect(openApi.info.title).toBe("Visita API");
    expect(openApi.paths).toHaveProperty("/v1/auth/anonymous");
    expect(openApi.paths).toHaveProperty("/v1/auth/refresh");
    expect(openApi.paths).toHaveProperty("/v1/auth/me");
    expect(openApi.paths).toHaveProperty("/v1/auth/logout");
    expect(openApi.paths["/v1/auth/me"]?.get?.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(openApi.paths["/v1/auth/logout"]?.post?.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(openApi.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });

    await app.close();
  });

  it("serves Swagger UI", async () => {
    const app = buildDocumentedAuthApp();

    const response = await app.inject({
      method: "GET",
      url: "/docs",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");

    await app.close();
  });
});

function buildDocumentedAuthApp(): ReturnType<typeof buildApp> {
  const tokenService = new TokenService(authConfig);
  const authService = new AuthService(unusedAuthRepository, tokenService);

  return buildApp({ logger: false, authService, tokenService });
}

const unusedAuthRepository: AuthRepository = {
  async createAnonymousSession() {
    throw new Error(
      "Auth repository should not be used by documentation tests.",
    );
  },
  async findRefreshTokenByHash() {
    throw new Error(
      "Auth repository should not be used by documentation tests.",
    );
  },
  async rotateRefreshToken() {
    throw new Error(
      "Auth repository should not be used by documentation tests.",
    );
  },
  async revokeTokenFamily() {
    throw new Error(
      "Auth repository should not be used by documentation tests.",
    );
  },
  async getCurrentUser() {
    throw new Error(
      "Auth repository should not be used by documentation tests.",
    );
  },
  async revokeSession() {
    throw new Error(
      "Auth repository should not be used by documentation tests.",
    );
  },
};

type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
  };
  components: {
    securitySchemes: Record<string, unknown>;
  };
  paths: Record<
    string,
    Record<
      string,
      {
        security?: Array<Record<string, string[]>>;
      }
    >
  >;
};
