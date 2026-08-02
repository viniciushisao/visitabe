import fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";

export function buildApp(options: FastifyServerOptions = {}): FastifyInstance {
  return fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
    ...options,
  });
}
