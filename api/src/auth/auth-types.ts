export type AuthPlatform = "web";
export type IdentityProvider = "google" | "apple" | "email";
export type UserStatus = "anonymous" | "registered" | "disabled";

export type AuthenticatedUser = {
  userId: string;
  sessionId: string;
};

export type CreateAnonymousSessionInput = {
  clientInstanceId: string;
  platform: AuthPlatform;
  appVersion: string;
};

export type PublicAuthUser = {
  id: string;
  status: UserStatus;
};

export type CurrentUser = PublicAuthUser & {
  createdAt: Date;
  identityProviders: IdentityProvider[];
};

export type AuthTokenResponse = {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
};

export type AnonymousSessionResult = {
  user: PublicAuthUser;
  sessionId: string;
  tokens: AuthTokenResponse;
};

export type RefreshSessionResult = {
  userId: string;
  sessionId: string;
  tokens: AuthTokenResponse;
};

export type AuthSessionRecord = {
  id: string;
  userId: string;
  tokenFamilyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type AuthRefreshTokenRecord = {
  id: string;
  sessionId: string;
  tokenFamilyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  session: AuthSessionRecord;
};

export type CurrentUserRecord = CurrentUser;
