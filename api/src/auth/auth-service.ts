import { randomUUID } from "crypto";

import { AuthError } from "./auth-errors.js";
import type { AuthRepository } from "./auth-repository.js";
import type {
  AnonymousSessionResult,
  AuthPlatform,
  AuthTokenResponse,
  CreateAnonymousSessionInput,
  CurrentUser,
  RefreshSessionResult,
} from "./auth-types.js";
import { TokenService } from "./token-service.js";

export class AuthService {
  readonly #repository: AuthRepository;
  readonly #tokenService: TokenService;
  readonly #now: () => Date;

  constructor(
    repository: AuthRepository,
    tokenService: TokenService,
    now: () => Date = () => new Date(),
  ) {
    this.#repository = repository;
    this.#tokenService = tokenService;
    this.#now = now;
  }

  async createAnonymousSession(
    input: CreateAnonymousSessionInput,
  ): Promise<AnonymousSessionResult> {
    const normalizedInput = validateAnonymousSessionInput(input);
    const now = this.#now();
    const userId = prefixedId("usr");
    const sessionId = prefixedId("ses");
    const tokenFamilyId = prefixedId("rtf");
    const refreshToken = this.#tokenService.createRefreshToken();
    const refreshTokenHash = this.#tokenService.hashRefreshToken(
      refreshToken.refreshToken,
    );
    const expiresAt = addSeconds(now, refreshToken.expiresIn);

    const { user, session } = await this.#repository.createAnonymousSession({
      userId,
      sessionId,
      refreshTokenId: refreshToken.tokenId,
      refreshTokenHash,
      tokenFamilyId,
      installationId: normalizedInput.installationId,
      platform: normalizedInput.platform,
      appVersion: normalizedInput.appVersion,
      expiresAt,
    });

    const accessToken = await this.#tokenService.createAccessToken(
      {
        userId: user.id,
        sessionId: session.id,
      },
      now,
    );

    return {
      user,
      tokens: buildTokenResponse(
        accessToken.accessToken,
        accessToken.expiresIn,
        refreshToken.refreshToken,
        refreshToken.expiresIn,
      ),
    };
  }

  async refreshSession(refreshToken: string): Promise<RefreshSessionResult> {
    const submittedRefreshToken = refreshToken.trim();

    if (!submittedRefreshToken) {
      throw new AuthError("INVALID_REFRESH_TOKEN");
    }

    const now = this.#now();
    const refreshTokenHash = this.#tokenService.hashRefreshToken(
      submittedRefreshToken,
    );
    const currentRefreshToken =
      await this.#repository.findRefreshTokenByHash(refreshTokenHash);

    if (!currentRefreshToken) {
      throw new AuthError("INVALID_REFRESH_TOKEN");
    }

    if (currentRefreshToken.usedAt) {
      await this.#repository.revokeTokenFamily(
        currentRefreshToken.tokenFamilyId,
        now,
      );
      throw new AuthError("INVALID_REFRESH_TOKEN");
    }

    if (
      currentRefreshToken.revokedAt ||
      currentRefreshToken.session.revokedAt
    ) {
      throw new AuthError("SESSION_REVOKED");
    }

    if (
      currentRefreshToken.expiresAt <= now ||
      currentRefreshToken.session.expiresAt <= now
    ) {
      throw new AuthError("REFRESH_TOKEN_EXPIRED");
    }

    const replacementRefreshToken = this.#tokenService.createRefreshToken();
    const replacementRefreshTokenHash = this.#tokenService.hashRefreshToken(
      replacementRefreshToken.refreshToken,
    );
    const replacementExpiresAt = addSeconds(
      now,
      replacementRefreshToken.expiresIn,
    );

    let session;

    try {
      session = await this.#repository.rotateRefreshToken({
        currentRefreshTokenId: currentRefreshToken.id,
        replacementRefreshTokenId: replacementRefreshToken.tokenId,
        replacementRefreshTokenHash,
        replacementExpiresAt,
        now,
      });
    } catch {
      await this.#repository.revokeTokenFamily(
        currentRefreshToken.tokenFamilyId,
        now,
      );
      throw new AuthError("INVALID_REFRESH_TOKEN");
    }

    const accessToken = await this.#tokenService.createAccessToken(
      {
        userId: session.userId,
        sessionId: session.id,
      },
      now,
    );

    return {
      tokens: buildTokenResponse(
        accessToken.accessToken,
        accessToken.expiresIn,
        replacementRefreshToken.refreshToken,
        replacementRefreshToken.expiresIn,
      ),
    };
  }

  async getCurrentUser(userId: string): Promise<CurrentUser> {
    const user = await this.#repository.getCurrentUser(userId);

    if (!user) {
      throw new AuthError("UNAUTHORIZED");
    }

    return user;
  }

  async logoutSession(sessionId: string): Promise<void> {
    await this.#repository.revokeSession(sessionId, this.#now());
  }
}

function validateAnonymousSessionInput(
  input: CreateAnonymousSessionInput,
): CreateAnonymousSessionInput {
  if (!isUuid(input.installationId)) {
    throw new AuthError("INVALID_REQUEST", "installationId must be a UUID.");
  }

  if (!isAuthPlatform(input.platform)) {
    throw new AuthError("INVALID_REQUEST", "platform must be ios or android.");
  }

  const appVersion = input.appVersion.trim();

  if (!appVersion || appVersion.length > 100) {
    throw new AuthError("INVALID_REQUEST", "appVersion is invalid.");
  }

  return {
    installationId: input.installationId,
    platform: input.platform,
    appVersion,
  };
}

function buildTokenResponse(
  accessToken: string,
  accessTokenExpiresIn: number,
  refreshToken: string,
  refreshTokenExpiresIn: number,
): AuthTokenResponse {
  return {
    accessToken,
    accessTokenExpiresIn,
    refreshToken,
    refreshTokenExpiresIn,
  };
}

function prefixedId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isAuthPlatform(value: string): value is AuthPlatform {
  return value === "ios" || value === "android";
}
