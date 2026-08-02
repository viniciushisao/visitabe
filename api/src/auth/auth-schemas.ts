export const authErrorResponseSchema = {
  type: "object",
  required: ["error"],
  additionalProperties: false,
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      additionalProperties: false,
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
    },
  },
} as const;

const authUserSchema = {
  type: "object",
  required: ["id", "status"],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    status: { type: "string", enum: ["anonymous", "registered", "disabled"] },
  },
} as const;

const authTokensSchema = {
  type: "object",
  required: [
    "accessToken",
    "accessTokenExpiresIn",
    "refreshToken",
    "refreshTokenExpiresIn",
  ],
  additionalProperties: false,
  properties: {
    accessToken: { type: "string" },
    accessTokenExpiresIn: { type: "number" },
    refreshToken: { type: "string" },
    refreshTokenExpiresIn: { type: "number" },
  },
} as const;

export const anonymousAuthBodySchema = {
  type: "object",
  required: ["installationId", "platform", "appVersion"],
  additionalProperties: false,
  properties: {
    installationId: { type: "string" },
    platform: { type: "string", enum: ["android", "ios"] },
    appVersion: { type: "string", minLength: 1, maxLength: 100 },
  },
} as const;

export const refreshAuthBodySchema = {
  type: "object",
  required: ["refreshToken"],
  additionalProperties: false,
  properties: {
    refreshToken: { type: "string", minLength: 1 },
  },
} as const;

export const anonymousAuthResponseSchema = {
  type: "object",
  required: ["data"],
  additionalProperties: false,
  properties: {
    data: {
      type: "object",
      required: ["user", "tokens"],
      additionalProperties: false,
      properties: {
        user: authUserSchema,
        tokens: authTokensSchema,
      },
    },
  },
} as const;

export const refreshAuthResponseSchema = {
  type: "object",
  required: ["data"],
  additionalProperties: false,
  properties: {
    data: {
      type: "object",
      required: [
        "accessToken",
        "accessTokenExpiresIn",
        "refreshToken",
        "refreshTokenExpiresIn",
      ],
      additionalProperties: false,
      properties: authTokensSchema.properties,
    },
  },
} as const;

export const currentUserResponseSchema = {
  type: "object",
  required: ["data"],
  additionalProperties: false,
  properties: {
    data: {
      type: "object",
      required: ["id", "status", "createdAt", "identityProviders"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        status: {
          type: "string",
          enum: ["anonymous", "registered", "disabled"],
        },
        createdAt: { type: "string" },
        identityProviders: {
          type: "array",
          items: { type: "string", enum: ["google", "apple", "email"] },
        },
      },
    },
  },
} as const;
