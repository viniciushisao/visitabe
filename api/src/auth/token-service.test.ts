import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import type { ApiEnv } from "../config/env.js";
import { TokenService } from "./token-service.js";

const baseAuthConfig = {
  issuer: "https://api.visita.test",
  audience: "visita-mobile",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
  jwtAlgorithm: "HS256",
  jwtSecret: "test-jwt-secret-with-at-least-thirty-two-characters",
  refreshTokenPepper: "test-refresh-pepper-with-at-least-thirty-two-characters",
} satisfies ApiEnv["auth"];

describe("TokenService", () => {
  it("creates and verifies an access token with required claims", async () => {
    const service = new TokenService(baseAuthConfig);
    const now = new Date("2026-08-02T12:00:00.000Z");

    const result = await service.createAccessToken(
      { userId: "usr_test", sessionId: "ses_test" },
      now,
    );

    const verified = await service.verifyAccessToken(result.accessToken, now);

    expect(result.expiresIn).toBe(900);
    expect(verified).toEqual({
      userId: "usr_test",
      sessionId: "ses_test",
      issuedAt: now,
      expiresAt: new Date("2026-08-02T12:15:00.000Z"),
    });
  });

  it("rejects expired access tokens", async () => {
    const service = new TokenService({
      ...baseAuthConfig,
      accessTokenTtlSeconds: 1,
    });
    const issuedAt = new Date("2026-08-02T12:00:00.000Z");
    const afterExpiration = new Date("2026-08-02T12:00:02.000Z");
    const result = await service.createAccessToken(
      { userId: "usr_test", sessionId: "ses_test" },
      issuedAt,
    );

    await expect(
      service.verifyAccessToken(result.accessToken, afterExpiration),
    ).rejects.toThrow();
  });

  it("rejects access tokens with the wrong issuer or audience", async () => {
    const service = new TokenService(baseAuthConfig);
    const result = await service.createAccessToken({
      userId: "usr_test",
      sessionId: "ses_test",
    });

    await expect(
      new TokenService({
        ...baseAuthConfig,
        issuer: "https://other-issuer.visita.test",
      }).verifyAccessToken(result.accessToken),
    ).rejects.toThrow();

    await expect(
      new TokenService({
        ...baseAuthConfig,
        audience: "other-audience",
      }).verifyAccessToken(result.accessToken),
    ).rejects.toThrow();
  });

  it("rejects malformed access tokens", async () => {
    const service = new TokenService(baseAuthConfig);

    await expect(service.verifyAccessToken("not-a-jwt")).rejects.toThrow();
  });

  it("rejects access tokens signed with a disallowed algorithm", async () => {
    const service = new TokenService(baseAuthConfig);
    const token = await new SignJWT({ sid: "ses_test" })
      .setProtectedHeader({ alg: "HS384" })
      .setIssuer(baseAuthConfig.issuer)
      .setAudience(baseAuthConfig.audience)
      .setSubject("usr_test")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(baseAuthConfig.jwtSecret));

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it("creates opaque refresh tokens with an id and random secret", () => {
    const service = new TokenService(baseAuthConfig);

    const first = service.createRefreshToken();
    const second = service.createRefreshToken();

    expect(first.expiresIn).toBe(2_592_000);
    expect(first.tokenId).toMatch(/^rft_[a-f0-9]{32}$/);
    expect(first.refreshToken).toMatch(/^rft_[a-f0-9]{32}\.[A-Za-z0-9_-]+$/);
    expect(first.refreshToken).not.toBe(second.refreshToken);
  });

  it("hashes refresh tokens deterministically and verifies them safely", () => {
    const service = new TokenService(baseAuthConfig);
    const { refreshToken } = service.createRefreshToken();

    const hash = service.hashRefreshToken(refreshToken);

    expect(service.hashRefreshToken(refreshToken)).toBe(hash);
    expect(hash).not.toContain(refreshToken);
    expect(service.verifyRefreshTokenHash(refreshToken, hash)).toBe(true);
    expect(
      service.verifyRefreshTokenHash(`${refreshToken}-changed`, hash),
    ).toBe(false);
    expect(service.verifyRefreshTokenHash(refreshToken, "short")).toBe(false);
  });
});
