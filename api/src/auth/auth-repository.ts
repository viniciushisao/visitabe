import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  AuthPlatform,
  AuthRefreshTokenRecord,
  AuthSessionRecord,
  CurrentUserRecord,
  IdentityProvider,
  PublicAuthUser,
  UserStatus,
} from "./auth-types.js";

export type CreateAnonymousSessionRecordInput = {
  userId: string;
  sessionId: string;
  refreshTokenId: string;
  refreshTokenHash: string;
  tokenFamilyId: string;
  clientInstanceId: string;
  platform: AuthPlatform;
  appVersion: string;
  expiresAt: Date;
};

export type CreatedAnonymousSessionRecord = {
  user: PublicAuthUser;
  session: AuthSessionRecord;
};

export type RotateRefreshTokenInput = {
  currentRefreshTokenId: string;
  replacementRefreshTokenId: string;
  replacementRefreshTokenHash: string;
  replacementExpiresAt: Date;
  now: Date;
};

export interface AuthRepository {
  createAnonymousSession(
    input: CreateAnonymousSessionRecordInput,
  ): Promise<CreatedAnonymousSessionRecord>;
  findRefreshTokenByHash(
    refreshTokenHash: string,
  ): Promise<AuthRefreshTokenRecord | null>;
  rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<AuthSessionRecord>;
  revokeTokenFamily(tokenFamilyId: string, now: Date): Promise<void>;
  getCurrentUser(userId: string): Promise<CurrentUserRecord | null>;
  revokeSession(sessionId: string, now: Date): Promise<void>;
}

export class PrismaAuthRepository implements AuthRepository {
  readonly #prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.#prisma = prisma;
  }

  async createAnonymousSession(
    input: CreateAnonymousSessionRecordInput,
  ): Promise<CreatedAnonymousSessionRecord> {
    return this.#prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: input.userId,
        },
      });

      const session = await tx.authSession.create({
        data: {
          id: input.sessionId,
          userId: input.userId,
          clientInstanceId: input.clientInstanceId,
          platform: input.platform,
          appVersion: input.appVersion,
          tokenFamilyId: input.tokenFamilyId,
          expiresAt: input.expiresAt,
        },
      });

      await tx.authRefreshToken.create({
        data: {
          id: input.refreshTokenId,
          sessionId: input.sessionId,
          tokenFamilyId: input.tokenFamilyId,
          refreshTokenHash: input.refreshTokenHash,
          expiresAt: input.expiresAt,
        },
      });

      return {
        user: {
          id: user.id,
          status: user.status as UserStatus,
        },
        session: mapSession(session),
      };
    });
  }

  async findRefreshTokenByHash(
    refreshTokenHash: string,
  ): Promise<AuthRefreshTokenRecord | null> {
    const refreshToken = await this.#prisma.authRefreshToken.findUnique({
      where: { refreshTokenHash },
      include: { session: true },
    });

    if (!refreshToken) {
      return null;
    }

    return {
      id: refreshToken.id,
      sessionId: refreshToken.sessionId,
      tokenFamilyId: refreshToken.tokenFamilyId,
      refreshTokenHash: refreshToken.refreshTokenHash,
      expiresAt: refreshToken.expiresAt,
      usedAt: refreshToken.usedAt,
      revokedAt: refreshToken.revokedAt,
      session: mapSession(refreshToken.session),
    };
  }

  async rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<AuthSessionRecord> {
    return this.#prisma.$transaction(async (tx) => {
      const currentRefreshToken = await tx.authRefreshToken.findUnique({
        where: { id: input.currentRefreshTokenId },
        include: { session: true },
      });

      if (!currentRefreshToken) {
        throw new Error("Refresh token disappeared during rotation.");
      }

      const updateResult = await tx.authRefreshToken.updateMany({
        where: {
          id: input.currentRefreshTokenId,
          usedAt: null,
          revokedAt: null,
        },
        data: {
          usedAt: input.now,
          replacedByTokenId: input.replacementRefreshTokenId,
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("Refresh token was already rotated or revoked.");
      }

      await tx.authRefreshToken.create({
        data: {
          id: input.replacementRefreshTokenId,
          sessionId: currentRefreshToken.sessionId,
          tokenFamilyId: currentRefreshToken.tokenFamilyId,
          refreshTokenHash: input.replacementRefreshTokenHash,
          expiresAt: input.replacementExpiresAt,
        },
      });

      const session = await tx.authSession.update({
        where: { id: currentRefreshToken.sessionId },
        data: {
          expiresAt: input.replacementExpiresAt,
          lastUsedAt: input.now,
        },
      });

      return mapSession(session);
    });
  }

  async revokeTokenFamily(tokenFamilyId: string, now: Date): Promise<void> {
    await this.#prisma.$transaction([
      this.#prisma.authSession.updateMany({
        where: {
          tokenFamilyId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      }),
      this.#prisma.authRefreshToken.updateMany({
        where: {
          tokenFamilyId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      }),
    ]);
  }

  async getCurrentUser(userId: string): Promise<CurrentUserRecord | null> {
    const user = await this.#prisma.user.findUnique({
      where: { id: userId },
      include: {
        identities: {
          select: { provider: true },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      status: user.status as UserStatus,
      createdAt: user.createdAt,
      identityProviders: user.identities.map(
        (identity) => identity.provider as IdentityProvider,
      ),
    };
  }

  async revokeSession(sessionId: string, now: Date): Promise<void> {
    await this.#prisma.$transaction([
      this.#prisma.authSession.updateMany({
        where: {
          id: sessionId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      }),
      this.#prisma.authRefreshToken.updateMany({
        where: {
          sessionId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      }),
    ]);
  }
}

function mapSession(session: {
  id: string;
  userId: string;
  tokenFamilyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}): AuthSessionRecord {
  return {
    id: session.id,
    userId: session.userId,
    tokenFamilyId: session.tokenFamilyId,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
  };
}
