import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import { timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { version: string };

export type OpenApiBasicAuth = {
  username: string;
  password: string;
};

export type OpenApiOptions = {
  basicAuth?: OpenApiBasicAuth;
};

export function registerOpenApi(
  app: FastifyInstance,
  options: OpenApiOptions = {},
): void {
  const preHandler = options.basicAuth
    ? createBasicAuthPreHandler(options.basicAuth)
    : undefined;

  void app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Visita API",
        description: "Fastify API for the Visita MVP.",
        version: packageJson.version,
      },
      tags: [
        {
          name: "Auth",
          description: "Anonymous authentication and session management.",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
    refResolver: {
      buildLocalReference(json, _baseUri, _fragment, index) {
        return typeof json.$id === "string" ? json.$id : `def-${index}`;
      },
    },
  });

  app.get(
    "/openapi.json",
    {
      schema: {
        hide: true,
      },
      preHandler,
    },
    async () => app.swagger(),
  );

  void app.register(swaggerUi, {
    routePrefix: "/docs",
    uiHooks: preHandler
      ? {
          preHandler,
        }
      : undefined,
    uiConfig: {
      deepLinking: true,
      docExpansion: "list",
    },
  });
}

function createBasicAuthPreHandler(
  expected: OpenApiBasicAuth,
): preHandlerHookHandler {
  return async (request, reply) => {
    const credentials = readBasicAuthCredentials(request);

    if (
      !credentials ||
      !constantTimeEqual(credentials.username, expected.username) ||
      !constantTimeEqual(credentials.password, expected.password)
    ) {
      sendBasicAuthChallenge(reply);
    }
  };
}

function readBasicAuthCredentials(
  request: FastifyRequest,
): OpenApiBasicAuth | undefined {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Basic ")) {
    return undefined;
  }

  const encodedCredentials = authorization.slice("Basic ".length);
  const decodedCredentials = Buffer.from(encodedCredentials, "base64").toString(
    "utf8",
  );
  const separatorIndex = decodedCredentials.indexOf(":");

  if (separatorIndex === -1) {
    return undefined;
  }

  return {
    username: decodedCredentials.slice(0, separatorIndex),
    password: decodedCredentials.slice(separatorIndex + 1),
  };
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function sendBasicAuthChallenge(reply: FastifyReply): void {
  reply
    .header("www-authenticate", 'Basic realm="Visita API Docs"')
    .code(401)
    .send({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
      },
    });
}
