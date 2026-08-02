import rateLimit from "@fastify/rate-limit";
import fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";

import { AuthError } from "./auth/auth-errors.js";
import { registerAuthRoutes } from "./auth/auth-routes.js";
import type { AuthService } from "./auth/auth-service.js";
import type { TokenService } from "./auth/token-service.js";
import { registerAuthentication } from "./plugins/authentication.js";

export type BuildAppOptions = FastifyServerOptions & {
  authService?: AuthService;
  tokenService?: TokenService;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const { authService, tokenService, ...fastifyOptions } = options;

  if ((authService && !tokenService) || (!authService && tokenService)) {
    throw new Error("authService and tokenService must be provided together.");
  }

  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
    ...fastifyOptions,
  });

  app.setErrorHandler(
    (error: Error & { validation?: unknown }, _request, reply) => {
      if (error.validation) {
        reply.code(400).send({
          error: {
            code: "INVALID_REQUEST",
            message: "The request is invalid.",
          },
        });
        return;
      }

      if (error instanceof AuthError) {
        reply.code(statusCodeForAuthError(error)).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
        return;
      }

      reply.code(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred.",
        },
      });
    },
  );

  void app.register(rateLimit, { global: false });

  if (authService && tokenService) {
    void app.register(async (authApp) => {
      await registerAuthentication(authApp, tokenService);
      await registerAuthRoutes(authApp, authService);
    });
  }

  return app;
}

function statusCodeForAuthError(error: AuthError): number {
  switch (error.code) {
    case "INVALID_REQUEST":
      return 400;
    case "INTERNAL_ERROR":
      return 500;
    default:
      return 401;
  }
}
