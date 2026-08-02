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

    reply.code(201).send({ data: result });
  };

  refreshSession = async (
    request: FastifyRequest<{ Body: RefreshRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await this.#authService.refreshSession(
      request.body.refreshToken,
    );

    reply.send({ data: result.tokens });
  };

  getCurrentUser = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const user = await this.#authService.getCurrentUser(request.user.userId);

    reply.send({ data: { ...user, createdAt: user.createdAt.toISOString() } });
  };

  logoutSession = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    await this.#authService.logoutSession(request.user.sessionId);

    reply.code(204).send();
  };
}
