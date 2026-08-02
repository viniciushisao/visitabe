import "dotenv/config";

import { buildApp } from "./app.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

if (Number.isNaN(port)) {
  throw new Error("PORT must be a number.");
}

const app = buildApp();

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down API server.");
  await app.close();
}

process.on("SIGINT", (signal) => {
  void shutdown(signal).then(() => process.exit(0));
});

process.on("SIGTERM", (signal) => {
  void shutdown(signal).then(() => process.exit(0));
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
