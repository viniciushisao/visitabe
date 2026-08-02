import type { FastifyReply, FastifyRequest } from "fastify";

import type { AuthService } from "./auth-service.js";
import type { CreateAnonymousSessionInput } from "./auth-types.js";

type RefreshRequestBody = {
  refreshToken: string;
};

export class AuthController {
  readonly #authService: AuthService;

  constructor(authService: AuthService) {
    this.#authService = authService;
  }

  createAnonymousSession = async (
    request: FastifyRequest<{ Body: CreateAnonymousSessionInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await this.#authService.createAnonymousSession(request.body);

    request.log.info(
      authLogEvent("auth.anonymous.created", "success", request.id, {
        userId: result.user.id,
        sessionId: result.sessionId,
      }),
      "Authentication event.",
    );

    reply.code(201).send({
      data: {
        user: result.user,
        tokens: result.tokens,
      },
    });
  };

  refreshSession = async (
    request: FastifyRequest<{ Body: RefreshRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await this.#authService.refreshSession(
      request.body.refreshToken,
    );

    request.log.info(
      authLogEvent("auth.refresh.rotated", "success", request.id, {
        userId: result.userId,
        sessionId: result.sessionId,
      }),
      "Authentication event.",
    );

    reply.send({ data: result.tokens });
  };

  getCurrentUser = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const user = await this.#authService.getCurrentUser(request.user.userId);

    request.log.info(
      authLogEvent("auth.me.read", "success", request.id, {
        userId: request.user.userId,
        sessionId: request.user.sessionId,
      }),
      "Authentication event.",
    );

    reply.send({ data: { ...user, createdAt: user.createdAt.toISOString() } });
  };

  logoutSession = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    await this.#authService.logoutSession(request.user.sessionId);

    request.log.info(
      authLogEvent("auth.logout.session", "success", request.id, {
        userId: request.user.userId,
        sessionId: request.user.sessionId,
      }),
      "Authentication event.",
    );

    reply.code(204).send();
  };
}

function authLogEvent(
  eventType: string,
  result: "success" | "failure",
  requestId: string,
  identifiers: { userId?: string; sessionId?: string } = {},
): Record<string, string | undefined> {
  return {
    authEvent: eventType,
    result,
    requestId,
    userId: identifiers.userId,
    sessionId: identifiers.sessionId,
    timestamp: new Date().toISOString(),
  };
}
