import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { version: string };

export function registerOpenApi(app: FastifyInstance): void {
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
    },
    async () => app.swagger(),
  );

  void app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      deepLinking: true,
      docExpansion: "list",
    },
  });
}
