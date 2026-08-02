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
        response: {
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
