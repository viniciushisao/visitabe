import "dotenv/config";

import { buildApp } from "./app.js";
import { PrismaAuthRepository } from "./auth/auth-repository.js";
import { AuthService } from "./auth/auth-service.js";
import { TokenService } from "./auth/token-service.js";
import { loadEnv } from "./config/env.js";
import { getPrismaClient } from "./lib/prisma.js";

const env = loadEnv();
const tokenService = new TokenService(env.auth);
const authRepository = new PrismaAuthRepository(getPrismaClient());
const authService = new AuthService(authRepository, tokenService);

const app = buildApp({
  authService,
  tokenService,
  webCorsOrigins: env.web.corsOrigins,
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down API server.");

  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "Failed to shut down API server.");
    process.exit(1);
  }
}

async function start(): Promise<void> {
  process.on("SIGINT", (signal) => {
    void shutdown(signal);
  });

  process.on("SIGTERM", (signal) => {
    void shutdown(signal);
  });

  try {
    await app.listen({
      host: env.host,
      port: env.port,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
