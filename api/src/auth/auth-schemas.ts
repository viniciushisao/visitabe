import type { FastifyInstance } from "fastify";

export const authErrorResponseSchema = {
  $id: "AuthErrorResponse",
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
  $id: "AuthUser",
  type: "object",
  required: ["id", "status"],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    status: { type: "string", enum: ["anonymous", "registered", "disabled"] },
  },
} as const;

const authTokensSchema = {
  $id: "AuthTokens",
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
  $id: "AnonymousAuthBody",
  type: "object",
  required: ["clientInstanceId", "platform", "appVersion"],
  additionalProperties: false,
  properties: {
    clientInstanceId: { type: "string" },
    platform: { type: "string", enum: ["web"] },
    appVersion: { type: "string", minLength: 1, maxLength: 100 },
  },
} as const;

export const refreshAuthBodySchema = {
  $id: "RefreshAuthBody",
  type: "object",
  required: ["refreshToken"],
  additionalProperties: false,
  properties: {
    refreshToken: { type: "string", minLength: 1 },
  },
} as const;

export const anonymousAuthResponseSchema = {
  $id: "AnonymousAuthResponse",
  type: "object",
  required: ["data"],
  additionalProperties: false,
  properties: {
    data: {
      type: "object",
      required: ["user", "tokens"],
      additionalProperties: false,
      properties: {
        user: { $ref: "AuthUser#" },
        tokens: { $ref: "AuthTokens#" },
      },
    },
  },
} as const;

export const refreshAuthResponseSchema = {
  $id: "RefreshAuthResponse",
  type: "object",
  required: ["data"],
  additionalProperties: false,
  properties: {
    data: {
      $ref: "AuthTokens#",
    },
  },
} as const;

const currentUserSchema = {
  $id: "CurrentUser",
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
} as const;

export const currentUserResponseSchema = {
  $id: "CurrentUserResponse",
  type: "object",
  required: ["data"],
  additionalProperties: false,
  properties: {
    data: { $ref: "CurrentUser#" },
  },
} as const;

export const authSchemaRefs = {
  anonymousAuthBody: { $ref: "AnonymousAuthBody#" },
  anonymousAuthResponse: { $ref: "AnonymousAuthResponse#" },
  authErrorResponse: { $ref: "AuthErrorResponse#" },
  currentUserResponse: { $ref: "CurrentUserResponse#" },
  refreshAuthBody: { $ref: "RefreshAuthBody#" },
  refreshAuthResponse: { $ref: "RefreshAuthResponse#" },
} as const;

const authSchemas = [
  authErrorResponseSchema,
  authUserSchema,
  authTokensSchema,
  anonymousAuthBodySchema,
  refreshAuthBodySchema,
  anonymousAuthResponseSchema,
  refreshAuthResponseSchema,
  currentUserSchema,
  currentUserResponseSchema,
] as const;

export function registerAuthSchemas(app: FastifyInstance): void {
  for (const schema of authSchemas) {
    if (!app.getSchema(schema.$id)) {
      app.addSchema(schema);
    }
  }
}
