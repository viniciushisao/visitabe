import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";

import type { ApiEnv, AuthJwtAlgorithm } from "../config/env.js";

export type AccessTokenInput = {
  userId: string;
  sessionId: string;
};

export type AccessTokenResult = {
  accessToken: string;
  expiresIn: number;
};

export type VerifiedAccessToken = {
  userId: string;
  sessionId: string;
  issuedAt: Date;
  expiresAt: Date;
};

export type RefreshTokenResult = {
  refreshToken: string;
  tokenId: string;
  expiresIn: number;
};

type TokenServiceConfig = ApiEnv["auth"];

export class TokenService {
  readonly #config: TokenServiceConfig;
  readonly #signingKey: Uint8Array;

  constructor(config: TokenServiceConfig) {
    this.#config = config;
    this.#signingKey = new TextEncoder().encode(config.jwtSecret);
  }

  async createAccessToken(
    input: AccessTokenInput,
    now = new Date(),
  ): Promise<AccessTokenResult> {
    const issuedAt = toUnixSeconds(now);
    const expiresAt = issuedAt + this.#config.accessTokenTtlSeconds;

    const accessToken = await new SignJWT({ sid: input.sessionId })
      .setProtectedHeader({ alg: this.#config.jwtAlgorithm })
      .setIssuer(this.#config.issuer)
      .setAudience(this.#config.audience)
      .setSubject(input.userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(this.#signingKey);

    return {
      accessToken,
      expiresIn: this.#config.accessTokenTtlSeconds,
    };
  }

  async verifyAccessToken(
    accessToken: string,
    now = new Date(),
  ): Promise<VerifiedAccessToken> {
    const { payload } = await jwtVerify(accessToken, this.#signingKey, {
      algorithms: [this.#config.jwtAlgorithm],
      audience: this.#config.audience,
      issuer: this.#config.issuer,
      currentDate: now,
    });

    if (!payload.sub || typeof payload.sid !== "string") {
      throw new Error("Access token is missing required claims.");
    }

    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
      throw new Error("Access token is missing required timestamps.");
    }

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      issuedAt: fromUnixSeconds(payload.iat),
      expiresAt: fromUnixSeconds(payload.exp),
    };
  }

  createRefreshToken(): RefreshTokenResult {
    const tokenId = `rft_${randomUUID().replaceAll("-", "")}`;
    const secret = randomBytes(32).toString("base64url");

    return {
      refreshToken: `${tokenId}.${secret}`,
      tokenId,
      expiresIn: this.#config.refreshTokenTtlSeconds,
    };
  }

  hashRefreshToken(refreshToken: string): string {
    return createHmac("sha256", this.#config.refreshTokenPepper)
      .update(refreshToken, "utf8")
      .digest("base64url");
  }

  verifyRefreshTokenHash(refreshToken: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashRefreshToken(refreshToken), "utf8");
    const expected = Buffer.from(expectedHash, "utf8");

    if (actual.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(actual, expected);
  }

  get accessTokenExpiresIn(): number {
    return this.#config.accessTokenTtlSeconds;
  }

  get refreshTokenExpiresIn(): number {
    return this.#config.refreshTokenTtlSeconds;
  }

  get jwtAlgorithm(): AuthJwtAlgorithm {
    return this.#config.jwtAlgorithm;
  }
}

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function fromUnixSeconds(seconds: number): Date {
  return new Date(seconds * 1000);
}
