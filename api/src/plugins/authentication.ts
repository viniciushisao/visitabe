import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { AuthError } from "../auth/auth-errors.js";
import type { AuthenticatedUser } from "../auth/auth-types.js";
import type { TokenService } from "../auth/token-service.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }

  interface FastifyRequest {
    user: AuthenticatedUser;
  }
}

export async function registerAuthentication(
  app: FastifyInstance,
  tokenService: TokenService,
): Promise<void> {
  app.decorateRequest("user", undefined as unknown as AuthenticatedUser);
  app.decorate(
    "authenticate",
    async (request: FastifyRequest): Promise<void> => {
      const token = readBearerToken(request.headers.authorization);

      try {
        const verifiedToken = await tokenService.verifyAccessToken(token);
        request.user = {
          userId: verifiedToken.userId,
          sessionId: verifiedToken.sessionId,
        };
      } catch {
        throw new AuthError("UNAUTHORIZED");
      }
    },
  );
}

function readBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    throw new AuthError("UNAUTHORIZED");
  }

  const [scheme, token, extra] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token || extra) {
    throw new AuthError("UNAUTHORIZED");
  }

  return token;
}
