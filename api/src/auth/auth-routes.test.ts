import fastify from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import type { ApiEnv } from "../config/env.js";
import { registerAuthentication } from "../plugins/authentication.js";
import type {
  AuthRepository,
  CreateAnonymousSessionRecordInput,
  CreatedAnonymousSessionRecord,
  RotateRefreshTokenInput,
} from "./auth-repository.js";
import { AuthService } from "./auth-service.js";
import type {
  AuthRefreshTokenRecord,
  AuthSessionRecord,
  CurrentUserRecord,
} from "./auth-types.js";
import { TokenService } from "./token-service.js";

const authConfig = {
  issuer: "https://api.visita.test",
  audience: "visita-mobile",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
  jwtAlgorithm: "HS256",
  jwtSecret: "test-jwt-secret-with-at-least-thirty-two-characters",
  refreshTokenPepper: "test-refresh-pepper-with-at-least-thirty-two-characters",
} satisfies ApiEnv["auth"];

const testNow = new Date();

describe("auth routes", () => {
  it("creates an anonymous session and reads the current user", async () => {
    const { app } = buildTestApp();

    const anonymousResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: {
        installationId: "550e8400-e29b-41d4-a716-446655440000",
        platform: "android",
        appVersion: "1.0.0",
      },
    });
    const anonymousBody = anonymousResponse.json<AnonymousAuthResponse>();

    expect(anonymousResponse.statusCode).toBe(201);
    expect(anonymousBody.data.user.status).toBe("anonymous");
    expect(anonymousBody.data.tokens.accessToken).toBeTruthy();
    expect(anonymousBody.data.tokens.refreshToken).toBeTruthy();

    const meResponse = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${anonymousBody.data.tokens.accessToken}`,
      },
    });
    const meBody = meResponse.json<CurrentUserResponse>();

    expect(meResponse.statusCode).toBe(200);
    expect(meBody.data).toEqual({
      id: anonymousBody.data.user.id,
      status: "anonymous",
      createdAt: testNow.toISOString(),
      identityProviders: [],
    });

    await app.close();
  });

  it("rejects protected requests without a bearer token", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });

    await app.close();
  });

  it("rejects protected requests with malformed bearer tokens", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: "Bearer not-a-jwt",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });

    await app.close();
  });

  it("rejects protected requests with expired access tokens", async () => {
    const { app, tokenService } = buildTestApp({
      ...authConfig,
      accessTokenTtlSeconds: 1,
    });
    const expiredToken = await tokenService.createAccessToken(
      { userId: "usr_expired", sessionId: "ses_expired" },
      new Date("2000-01-01T00:00:00.000Z"),
    );

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${expiredToken.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });

    await app.close();
  });

  it("rejects protected requests with wrong-issuer access tokens", async () => {
    const { app } = buildTestApp();
    const wrongIssuerTokenService = new TokenService({
      ...authConfig,
      issuer: "https://wrong-issuer.visita.test",
    });
    const token = await wrongIssuerTokenService.createAccessToken(
      { userId: "usr_wrong_issuer", sessionId: "ses_wrong_issuer" },
      testNow,
    );

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${token.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });

    await app.close();
  });

  it("rejects protected requests with wrong-audience access tokens", async () => {
    const { app } = buildTestApp();
    const wrongAudienceTokenService = new TokenService({
      ...authConfig,
      audience: "wrong-audience",
    });
    const token = await wrongAudienceTokenService.createAccessToken(
      { userId: "usr_wrong_audience", sessionId: "ses_wrong_audience" },
      testNow,
    );

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: `Bearer ${token.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });

    await app.close();
  });

  it("refreshes a session and rotates the refresh token", async () => {
    const { app } = buildTestApp();
    const anonymousResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: {
        installationId: "550e8400-e29b-41d4-a716-446655440000",
        platform: "ios",
        appVersion: "1.0.0",
      },
    });
    const anonymousBody = anonymousResponse.json<AnonymousAuthResponse>();

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: anonymousBody.data.tokens.refreshToken,
      },
    });
    const refreshBody = refreshResponse.json<RefreshAuthResponse>();

    expect(refreshResponse.statusCode).toBe(200);
    expect(refreshBody.data.accessToken).toBeTruthy();
    expect(refreshBody.data.refreshToken).toBeTruthy();
    expect(refreshBody.data.refreshToken).not.toBe(
      anonymousBody.data.tokens.refreshToken,
    );

    await app.close();
  });

  it("rejects reused refresh tokens and revokes the session family", async () => {
    const { app } = buildTestApp();
    const anonymousResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: {
        installationId: "550e8400-e29b-41d4-a716-446655440000",
        platform: "ios",
        appVersion: "1.0.0",
      },
    });
    const anonymousBody = anonymousResponse.json<AnonymousAuthResponse>();

    const firstRefreshResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: anonymousBody.data.tokens.refreshToken,
      },
    });
    const firstRefreshBody = firstRefreshResponse.json<RefreshAuthResponse>();

    expect(firstRefreshResponse.statusCode).toBe(200);

    const reusedRefreshResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: anonymousBody.data.tokens.refreshToken,
      },
    });

    expect(reusedRefreshResponse.statusCode).toBe(401);
    expect(reusedRefreshResponse.json()).toMatchObject({
      error: { code: "INVALID_REFRESH_TOKEN" },
    });

    const familyRevokedResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: firstRefreshBody.data.refreshToken,
      },
    });

    expect(familyRevokedResponse.statusCode).toBe(401);
    expect(familyRevokedResponse.json()).toMatchObject({
      error: { code: "SESSION_REVOKED" },
    });

    await app.close();
  });

  it("rate-limits anonymous account creation", async () => {
    const { app } = buildTestApp();

    for (let requestIndex = 0; requestIndex < 10; requestIndex += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/anonymous",
        payload: {
          installationId: "550e8400-e29b-41d4-a716-446655440000",
          platform: "android",
          appVersion: "1.0.0",
        },
      });

      expect(response.statusCode).toBe(201);
    }

    const limitedResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: {
        installationId: "550e8400-e29b-41d4-a716-446655440000",
        platform: "android",
        appVersion: "1.0.0",
      },
    });

    expect(limitedResponse.statusCode).toBe(429);
    expect(limitedResponse.json()).toMatchObject({
      error: { code: "RATE_LIMIT_EXCEEDED" },
    });

    await app.close();
  });

  it("rate-limits refresh attempts", async () => {
    const { app } = buildTestApp();

    for (let requestIndex = 0; requestIndex < 30; requestIndex += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/refresh",
        payload: {
          refreshToken: "invalid-refresh-token",
        },
      });

      expect(response.statusCode).toBe(401);
    }

    const limitedResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: "invalid-refresh-token",
      },
    });

    expect(limitedResponse.statusCode).toBe(429);
    expect(limitedResponse.json()).toMatchObject({
      error: { code: "RATE_LIMIT_EXCEEDED" },
    });

    await app.close();
  });

  it("logs out the current session and rejects future refresh", async () => {
    const { app } = buildTestApp();
    const anonymousResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/anonymous",
      payload: {
        installationId: "550e8400-e29b-41d4-a716-446655440000",
        platform: "android",
        appVersion: "1.0.0",
      },
    });
    const anonymousBody = anonymousResponse.json<AnonymousAuthResponse>();

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        authorization: `Bearer ${anonymousBody.data.tokens.accessToken}`,
      },
    });

    expect(logoutResponse.statusCode).toBe(204);

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: anonymousBody.data.tokens.refreshToken,
      },
    });

    expect(refreshResponse.statusCode).toBe(401);
    expect(refreshResponse.json()).toMatchObject({
      error: { code: "SESSION_REVOKED" },
    });

    await app.close();
  });

  it("scopes protected route behavior to request.user.userId", async () => {
    const tokenService = new TokenService(authConfig);
    const app = fastify({ logger: false });

    await registerAuthentication(app, tokenService);
    app.post<{
      Body: { userId: string };
    }>(
      "/protected-resource",
      { preHandler: app.authenticate },
      async (request) => ({
        trustedUserId: request.user.userId,
        ignoredBodyUserId: request.body.userId,
      }),
    );

    const token = await tokenService.createAccessToken(
      {
        userId: "usr_trusted",
        sessionId: "ses_trusted",
      },
      testNow,
    );

    const response = await app.inject({
      method: "POST",
      url: "/protected-resource",
      headers: {
        authorization: `Bearer ${token.accessToken}`,
      },
      payload: {
        userId: "usr_attacker_supplied",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      trustedUserId: "usr_trusted",
      ignoredBodyUserId: "usr_attacker_supplied",
    });

    await app.close();
  });
});

function buildTestApp(config: ApiEnv["auth"] = authConfig): {
  app: ReturnType<typeof buildApp>;
  tokenService: TokenService;
} {
  const repository = new InMemoryAuthRepository();
  const tokenService = new TokenService(config);
  const authService = new AuthService(repository, tokenService, () => testNow);
  const app = buildApp({ logger: false, authService, tokenService });

  return { app, tokenService };
}

type AnonymousAuthResponse = {
  data: {
    user: {
      id: string;
      status: string;
    };
    tokens: AuthTokens;
  };
};

type RefreshAuthResponse = {
  data: AuthTokens;
};

type CurrentUserResponse = {
  data: {
    id: string;
    status: string;
    createdAt: string;
    identityProviders: string[];
  };
};

type AuthTokens = {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
};

class InMemoryAuthRepository implements AuthRepository {
  readonly users = new Map<string, CurrentUserRecord>();
  readonly sessions = new Map<string, AuthSessionRecord>();
  readonly refreshTokensByHash = new Map<
    string,
    AuthRefreshTokenRecord & { replacedByTokenId: string | null }
  >();

  async createAnonymousSession(
    input: CreateAnonymousSessionRecordInput,
  ): Promise<CreatedAnonymousSessionRecord> {
    const user: CurrentUserRecord = {
      id: input.userId,
      status: "anonymous",
      createdAt: testNow,
      identityProviders: [],
    };
    const session: AuthSessionRecord = {
      id: input.sessionId,
      userId: input.userId,
      tokenFamilyId: input.tokenFamilyId,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    const refreshToken: AuthRefreshTokenRecord & {
      replacedByTokenId: string | null;
    } = {
      id: input.refreshTokenId,
      sessionId: input.sessionId,
      tokenFamilyId: input.tokenFamilyId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      revokedAt: null,
      replacedByTokenId: null,
      session,
    };

    this.users.set(user.id, user);
    this.sessions.set(session.id, session);
    this.refreshTokensByHash.set(refreshToken.refreshTokenHash, refreshToken);

    return {
      user: {
        id: user.id,
        status: user.status,
      },
      session,
    };
  }

  async findRefreshTokenByHash(
    refreshTokenHash: string,
  ): Promise<AuthRefreshTokenRecord | null> {
    return this.refreshTokensByHash.get(refreshTokenHash) ?? null;
  }

  async rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<AuthSessionRecord> {
    const currentRefreshToken = [...this.refreshTokensByHash.values()].find(
      (refreshToken) => refreshToken.id === input.currentRefreshTokenId,
    );

    if (!currentRefreshToken) {
      throw new Error("Refresh token not found.");
    }

    if (currentRefreshToken.usedAt || currentRefreshToken.revokedAt) {
      throw new Error("Refresh token already used.");
    }

    const session = this.sessions.get(currentRefreshToken.sessionId);

    if (!session) {
      throw new Error("Session not found.");
    }

    currentRefreshToken.usedAt = input.now;
    currentRefreshToken.replacedByTokenId = input.replacementRefreshTokenId;
    session.expiresAt = input.replacementExpiresAt;

    const replacementRefreshToken: AuthRefreshTokenRecord & {
      replacedByTokenId: string | null;
    } = {
      id: input.replacementRefreshTokenId,
      sessionId: session.id,
      tokenFamilyId: currentRefreshToken.tokenFamilyId,
      refreshTokenHash: input.replacementRefreshTokenHash,
      expiresAt: input.replacementExpiresAt,
      usedAt: null,
      revokedAt: null,
      replacedByTokenId: null,
      session,
    };

    this.refreshTokensByHash.set(
      replacementRefreshToken.refreshTokenHash,
      replacementRefreshToken,
    );

    return session;
  }

  async revokeTokenFamily(
    tokenFamilyId: string,
    revokedAt: Date,
  ): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.tokenFamilyId === tokenFamilyId) {
        session.revokedAt = revokedAt;
      }
    }

    for (const refreshToken of this.refreshTokensByHash.values()) {
      if (refreshToken.tokenFamilyId === tokenFamilyId) {
        refreshToken.revokedAt = revokedAt;
      }
    }
  }

  async getCurrentUser(userId: string): Promise<CurrentUserRecord | null> {
    return this.users.get(userId) ?? null;
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (session) {
      session.revokedAt = revokedAt;
    }

    for (const refreshToken of this.refreshTokensByHash.values()) {
      if (refreshToken.sessionId === sessionId) {
        refreshToken.revokedAt = revokedAt;
      }
    }
  }
}
