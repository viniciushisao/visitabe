export const webAuthPlatform = "web" as const;

export type CreateAnonymousWebSessionRequest = {
  clientInstanceId: string;
  platform: typeof webAuthPlatform;
  appVersion: string;
};

export type BearerAuthorizationHeader = {
  authorization: `Bearer ${string}`;
};

export const webAuthTokenStorageGuidance = {
  accessToken:
    "Keep access tokens short-lived and in memory where possible for browser clients.",
  refreshToken:
    "Do not store long-lived refresh tokens in localStorage; use an httpOnly secure same-site cookie or another reviewed browser storage decision.",
} as const;

export function createAnonymousWebSessionRequest(input: {
  clientInstanceId: string;
  appVersion: string;
}): CreateAnonymousWebSessionRequest {
  return {
    clientInstanceId: input.clientInstanceId,
    platform: webAuthPlatform,
    appVersion: input.appVersion,
  };
}

export function createBearerAuthorizationHeader(
  accessToken: string,
): BearerAuthorizationHeader {
  const trimmedAccessToken = accessToken.trim();

  if (!trimmedAccessToken) {
    throw new Error("accessToken is required.");
  }

  return {
    authorization: `Bearer ${trimmedAccessToken}`,
  };
}
