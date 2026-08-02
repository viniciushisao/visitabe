import { describe, expect, it } from "vitest";

import type { ApiEnv } from "../config/env.js";
import { AuthError } from "./auth-errors.js";
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

const now = new Date("2026-08-02T12:00:00.000Z");
const later = new Date("2026-08-02T12:05:00.000Z");

describe("AuthService", () => {
  it("creates an anonymous user, session, refresh token, and access token", async () => {
    const repository = new InMemoryAuthRepository();
    const tokenService = new TokenService(authConfig);
    const service = new AuthService(repository, tokenService, () => now);

    const result = await service.createAnonymousSession({
      installationId: "550e8400-e29b-41d4-a716-446655440000",
      platform: "android",
      appVersion: "1.0.0",
    });

    const verifiedAccessToken = await tokenService.verifyAccessToken(
      result.tokens.accessToken,
      now,
    );

    expect(result.user.status).toBe("anonymous");
    expect(result.tokens.accessTokenExpiresIn).toBe(900);
    expect(result.tokens.refreshTokenExpiresIn).toBe(2_592_000);
    expect(result.tokens.refreshToken).toMatch(
      /^rft_[a-f0-9]{32}\.[A-Za-z0-9_-]+$/,
    );
    expect(verifiedAccessToken.userId).toBe(result.user.id);
    expect(repository.sessions.get(verifiedAccessToken.sessionId)?.userId).toBe(
      result.user.id,
    );
  });

  it("rejects invalid anonymous session input", async () => {
    const service = new AuthService(
      new InMemoryAuthRepository(),
      new TokenService(authConfig),
      () => now,
    );

    await expect(
      service.createAnonymousSession({
        installationId: "not-a-uuid",
        platform: "android",
        appVersion: "1.0.0",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    } satisfies Partial<AuthError>);
  });

  it("refreshes a session by rotating the refresh token", async () => {
    const repository = new InMemoryAuthRepository();
    const tokenService = new TokenService(authConfig);
    let currentNow = now;
    const service = new AuthService(repository, tokenService, () => currentNow);
    const created = await service.createAnonymousSession({
      installationId: "550e8400-e29b-41d4-a716-446655440000",
      platform: "ios",
      appVersion: "1.0.0",
    });

    currentNow = later;
    const refreshed = await service.refreshSession(created.tokens.refreshToken);

    const oldTokenHash = tokenService.hashRefreshToken(
      created.tokens.refreshToken,
    );
    const newTokenHash = tokenService.hashRefreshToken(
      refreshed.tokens.refreshToken,
    );
    const oldToken = repository.refreshTokensByHash.get(oldTokenHash);
    const newToken = repository.refreshTokensByHash.get(newTokenHash);

    expect(refreshed.tokens.refreshToken).not.toBe(created.tokens.refreshToken);
    expect(oldToken?.usedAt).toEqual(later);
    expect(oldToken?.replacedByTokenId).toBe(newToken?.id);
    expect(newToken?.usedAt).toBeNull();
    expect(
      repository.sessions.get(newToken?.sessionId ?? "")?.expiresAt,
    ).toEqual(newToken?.expiresAt);
  });

  it("revokes the token family when a rotated refresh token is reused", async () => {
    const repository = new InMemoryAuthRepository();
    const tokenService = new TokenService(authConfig);
    let currentNow = now;
    const service = new AuthService(repository, tokenService, () => currentNow);
    const created = await service.createAnonymousSession({
      installationId: "550e8400-e29b-41d4-a716-446655440000",
      platform: "ios",
      appVersion: "1.0.0",
    });

    currentNow = later;
    await service.refreshSession(created.tokens.refreshToken);

    await expect(
      service.refreshSession(created.tokens.refreshToken),
    ).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    } satisfies Partial<AuthError>);

    expect(
      [...repository.sessions.values()].every((session) => session.revokedAt),
    ).toBe(true);
    expect(
      [...repository.refreshTokensByHash.values()].every(
        (refreshToken) => refreshToken.revokedAt,
      ),
    ).toBe(true);
  });

  it("rejects refresh for revoked sessions after logout", async () => {
    const repository = new InMemoryAuthRepository();
    const tokenService = new TokenService(authConfig);
    const service = new AuthService(repository, tokenService, () => now);
    const created = await service.createAnonymousSession({
      installationId: "550e8400-e29b-41d4-a716-446655440000",
      platform: "android",
      appVersion: "1.0.0",
    });
    const accessToken = await tokenService.verifyAccessToken(
      created.tokens.accessToken,
      now,
    );

    await service.logoutSession(accessToken.sessionId);

    await expect(
      service.refreshSession(created.tokens.refreshToken),
    ).rejects.toMatchObject({
      code: "SESSION_REVOKED",
    } satisfies Partial<AuthError>);
  });

  it("returns the current user public auth data", async () => {
    const repository = new InMemoryAuthRepository();
    const service = new AuthService(
      repository,
      new TokenService(authConfig),
      () => now,
    );
    const created = await service.createAnonymousSession({
      installationId: "550e8400-e29b-41d4-a716-446655440000",
      platform: "ios",
      appVersion: "1.0.0",
    });

    const user = repository.users.get(created.user.id);

    if (!user) {
      throw new Error("Expected user to exist.");
    }

    user.status = "registered";
    user.identityProviders = ["google"];

    await expect(service.getCurrentUser(created.user.id)).resolves.toEqual({
      id: created.user.id,
      status: "registered",
      createdAt: now,
      identityProviders: ["google"],
    });
  });
});

class InMemoryAuthRepository implements AuthRepository {
  readonly users = new Map<string, CurrentUserRecord>();
  readonly sessions = new Map<string, AuthSessionRecord>();
  readonly refreshTokensByHash = new Map<
    string,
    AuthRefreshTokenRecord & { replacedByTokenId: string | null }
  >();
  #now = now;

  async createAnonymousSession(
    input: CreateAnonymousSessionRecordInput,
  ): Promise<CreatedAnonymousSessionRecord> {
    const user: CurrentUserRecord = {
      id: input.userId,
      status: "anonymous",
      createdAt: this.#now,
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

  async revokeTokenFamily(tokenFamilyId: string, now: Date): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.tokenFamilyId === tokenFamilyId) {
        session.revokedAt = now;
      }
    }

    for (const refreshToken of this.refreshTokensByHash.values()) {
      if (refreshToken.tokenFamilyId === tokenFamilyId) {
        refreshToken.revokedAt = now;
      }
    }
  }

  async getCurrentUser(userId: string): Promise<CurrentUserRecord | null> {
    return this.users.get(userId) ?? null;
  }

  async revokeSession(sessionId: string, now: Date): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (session) {
      session.revokedAt = now;
    }

    for (const refreshToken of this.refreshTokensByHash.values()) {
      if (refreshToken.sessionId === sessionId) {
        refreshToken.revokedAt = now;
      }
    }
  }
}
