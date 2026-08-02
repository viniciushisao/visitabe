import type { FastifyInstance, FastifyRequest } from "fastify";

import { AuthController } from "./auth-controller.js";
import { authSchemaRefs, registerAuthSchemas } from "./auth-schemas.js";
import type { AuthService } from "./auth-service.js";

const anonymousAuthRateLimit = {
  max: 10,
  timeWindow: "1 minute",
  groupId: "auth-anonymous",
  onExceeded: logRateLimitExceeded,
} as const;

const refreshAuthRateLimit = {
  max: 30,
  timeWindow: "1 minute",
  groupId: "auth-refresh",
  onExceeded: logRateLimitExceeded,
} as const;

export async function registerAuthRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  const controller = new AuthController(authService);
  registerAuthSchemas(app);

  app.post(
    "/v1/auth/anonymous",
    {
      config: {
        rateLimit: anonymousAuthRateLimit,
      },
      schema: {
        tags: ["Auth"],
        summary: "Create an anonymous session",
        description:
          "Creates an anonymous user and returns access and refresh tokens for the first app session.",
        body: authSchemaRefs.anonymousAuthBody,
        response: {
          201: authSchemaRefs.anonymousAuthResponse,
          400: authSchemaRefs.authErrorResponse,
          429: authSchemaRefs.authErrorResponse,
          500: authSchemaRefs.authErrorResponse,
        },
      },
    },
    controller.createAnonymousSession,
  );

  app.post(
    "/v1/auth/refresh",
    {
      config: {
        rateLimit: refreshAuthRateLimit,
      },
      schema: {
        tags: ["Auth"],
        summary: "Refresh a session",
        description:
          "Rotates a refresh token and returns a new access token and refresh token.",
        body: authSchemaRefs.refreshAuthBody,
        response: {
          200: authSchemaRefs.refreshAuthResponse,
          401: authSchemaRefs.authErrorResponse,
          429: authSchemaRefs.authErrorResponse,
          500: authSchemaRefs.authErrorResponse,
        },
      },
    },
    controller.refreshSession,
  );

  app.get(
    "/v1/auth/me",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["Auth"],
        summary: "Read the current user",
        description:
          "Returns the authenticated user's public profile and linked identity providers.",
        security: [{ bearerAuth: [] }],
        response: {
          200: authSchemaRefs.currentUserResponse,
          401: authSchemaRefs.authErrorResponse,
          500: authSchemaRefs.authErrorResponse,
        },
      },
    },
    controller.getCurrentUser,
  );

  app.post(
    "/v1/auth/logout",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["Auth"],
        summary: "Log out the current session",
        description:
          "Revokes the authenticated session and its refresh tokens.",
        security: [{ bearerAuth: [] }],
        response: {
          204: {
            type: "null",
            description: "Session revoked.",
          },
          401: authSchemaRefs.authErrorResponse,
          500: authSchemaRefs.authErrorResponse,
        },
      },
    },
    controller.logoutSession,
  );
}

function logRateLimitExceeded(request: FastifyRequest): void {
  request.log.warn(
    {
      authEvent: "auth.rate_limit.exceeded",
      result: "failure",
      requestId: request.id,
      failureCode: "RATE_LIMIT_EXCEEDED",
      timestamp: new Date().toISOString(),
    },
    "Authentication event.",
  );
}
