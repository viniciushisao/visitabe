import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyServerOptions,
} from "fastify";

import { AuthError } from "./auth/auth-errors.js";
import { registerAuthRoutes } from "./auth/auth-routes.js";
import type { AuthService } from "./auth/auth-service.js";
import type { TokenService } from "./auth/token-service.js";
import { registerAuthentication } from "./plugins/authentication.js";
import { registerOpenApi } from "./plugins/openapi.js";

export type BuildAppOptions = FastifyServerOptions & {
  authService?: AuthService;
  tokenService?: TokenService;
  webCorsOrigins?: readonly string[];
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const {
    authService,
    tokenService,
    logger,
    webCorsOrigins,
    ...fastifyOptions
  } = options;

  if ((authService && !tokenService) || (!authService && tokenService)) {
    throw new Error("authService and tokenService must be provided together.");
  }

  const app = fastify({
    logger: logger ?? {
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: ["req.headers.authorization", "request.headers.authorization"],
        censor: "[redacted]",
      },
    },
    ...fastifyOptions,
  });

  if (webCorsOrigins?.length) {
    void app.register(cors, {
      origin: [...webCorsOrigins],
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["authorization", "content-type"],
    });
  }

  app.setErrorHandler(
    (
      error: Error & { statusCode?: number; validation?: unknown },
      request,
      reply,
    ) => {
      if (error.validation) {
        logAuthFailure(request, "INVALID_REQUEST");
        reply.code(400).send({
          error: {
            code: "INVALID_REQUEST",
            message: "The request is invalid.",
          },
        });
        return;
      }

      if (error.statusCode === 429) {
        logAuthFailure(request, "RATE_LIMIT_EXCEEDED");
        reply.code(429).send({
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests.",
          },
        });
        return;
      }

      if (error instanceof AuthError) {
        logAuthFailure(request, error.code);
        reply.code(statusCodeForAuthError(error)).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
        return;
      }

      logAuthFailure(request, "INTERNAL_ERROR");
      reply.code(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred.",
        },
      });
    },
  );

  void app.register(rateLimit, { global: false });
  registerOpenApi(app);

  if (authService && tokenService) {
    void app.register(async (authApp) => {
      await registerAuthentication(authApp, tokenService);
      await registerAuthRoutes(authApp, authService);
    });
  }

  return app;
}

function logAuthFailure(request: FastifyRequest, code: string): void {
  if (!request.url.startsWith("/v1/auth/")) {
    return;
  }

  request.log.warn(
    {
      authEvent: "auth.request.failed",
      result: "failure",
      requestId: request.id,
      userId: request.user?.userId,
      sessionId: request.user?.sessionId,
      failureCode: code,
      timestamp: new Date().toISOString(),
    },
    "Authentication event.",
  );
}

function statusCodeForAuthError(error: AuthError): number {
  switch (error.code) {
    case "INVALID_REQUEST":
      return 400;
    case "RATE_LIMIT_EXCEEDED":
      return 429;
    case "INTERNAL_ERROR":
      return 500;
    default:
      return 401;
  }
}
