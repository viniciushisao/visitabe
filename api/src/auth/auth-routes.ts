import type { FastifyInstance, FastifyRequest } from "fastify";

import { AuthController } from "./auth-controller.js";
import {
  anonymousAuthBodySchema,
  anonymousAuthResponseSchema,
  authErrorResponseSchema,
  currentUserResponseSchema,
  refreshAuthBodySchema,
  refreshAuthResponseSchema,
} from "./auth-schemas.js";
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
        body: anonymousAuthBodySchema,
        response: {
          201: anonymousAuthResponseSchema,
          400: authErrorResponseSchema,
          429: authErrorResponseSchema,
          500: authErrorResponseSchema,
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
        body: refreshAuthBodySchema,
        response: {
          200: refreshAuthResponseSchema,
          401: authErrorResponseSchema,
          429: authErrorResponseSchema,
          500: authErrorResponseSchema,
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
          200: currentUserResponseSchema,
          401: authErrorResponseSchema,
          500: authErrorResponseSchema,
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
          401: authErrorResponseSchema,
          500: authErrorResponseSchema,
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
