import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

describe("buildApp", () => {
  it("creates a Fastify app without registering endpoints yet", async () => {
    const app = buildApp({ logger: false });

    await app.ready();

    expect(app.hasRoute({ method: "GET", url: "/" })).toBe(false);

    await app.close();
  });
});
