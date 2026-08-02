export type AuthJwtAlgorithm = "HS256";

export type ApiEnv = {
  nodeEnv: string;
  host: string;
  port: number;
  logLevel: string;
  auth: {
    issuer: string;
    audience: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
    jwtAlgorithm: AuthJwtAlgorithm;
    jwtSecret: string;
    refreshTokenPepper: string;
  };
};

const supportedJwtAlgorithms = ["HS256"] as const;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const nodeEnv = source.NODE_ENV?.trim() || "development";
  const port = parsePort(source.PORT ?? "3000");
  const jwtAlgorithm = parseJwtAlgorithm(
    required(source, "AUTH_JWT_ALGORITHM"),
  );
  const jwtSecret = required(source, "JWT_SECRET");
  const refreshTokenPepper = required(source, "AUTH_REFRESH_TOKEN_PEPPER");

  if (nodeEnv !== "development") {
    requireHighEntropySecret("JWT_SECRET", jwtSecret);
    requireHighEntropySecret("AUTH_REFRESH_TOKEN_PEPPER", refreshTokenPepper);
  }

  return {
    nodeEnv,
    host: source.HOST?.trim() || "127.0.0.1",
    port,
    logLevel: source.LOG_LEVEL?.trim() || "info",
    auth: {
      issuer: parseIssuer(required(source, "AUTH_ISSUER")),
      audience: required(source, "AUTH_AUDIENCE"),
      accessTokenTtlSeconds: parsePositiveInteger(
        "AUTH_ACCESS_TOKEN_TTL_SECONDS",
        required(source, "AUTH_ACCESS_TOKEN_TTL_SECONDS"),
      ),
      refreshTokenTtlSeconds: parsePositiveInteger(
        "AUTH_REFRESH_TOKEN_TTL_SECONDS",
        required(source, "AUTH_REFRESH_TOKEN_TTL_SECONDS"),
      ),
      jwtAlgorithm,
      jwtSecret,
      refreshTokenPepper,
    },
  };
}

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("PORT must be a number between 1 and 65535.");
  }

  return port;
}

function parsePositiveInteger(name: string, value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseIssuer(value: string): string {
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error("AUTH_ISSUER must be a valid URL.");
  }
}

function parseJwtAlgorithm(value: string): AuthJwtAlgorithm {
  if (supportedJwtAlgorithms.includes(value as AuthJwtAlgorithm)) {
    return value as AuthJwtAlgorithm;
  }

  throw new Error(
    `AUTH_JWT_ALGORITHM must be one of: ${supportedJwtAlgorithms.join(", ")}.`,
  );
}

function requireHighEntropySecret(name: string, value: string): void {
  if (value.length < 32) {
    throw new Error(
      `${name} must be at least 32 characters outside development.`,
    );
  }
}
