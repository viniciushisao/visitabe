import type { FastifyInstance } from "fastify";

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

export async function registerAuthRoutes(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  const controller = new AuthController(authService);

  app.post(
    "/v1/auth/anonymous",
    {
      schema: {
        body: anonymousAuthBodySchema,
        response: {
          201: anonymousAuthResponseSchema,
          400: authErrorResponseSchema,
          500: authErrorResponseSchema,
        },
      },
    },
    controller.createAnonymousSession,
  );

  app.post(
    "/v1/auth/refresh",
    {
      schema: {
        body: refreshAuthBodySchema,
        response: {
          200: refreshAuthResponseSchema,
          401: authErrorResponseSchema,
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
