import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

describe("buildApp", () => {
  it("creates a Fastify app without registering endpoints yet", async () => {
    const app = buildApp({ logger: false });

    await app.ready();

    expect(app.hasRoute({ method: "GET", url: "/" })).toBe(false);

    await app.close();
  });

  it("allows configured web origins through CORS", async () => {
    const app = buildApp({
      logger: false,
      webCorsOrigins: ["https://app.visita.test"],
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/auth/me",
      headers: {
        origin: "https://app.visita.test",
        "access-control-request-method": "GET",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://app.visita.test",
    );
    expect(response.headers["access-control-allow-credentials"]).toBe("true");

    await app.close();
  });
});
