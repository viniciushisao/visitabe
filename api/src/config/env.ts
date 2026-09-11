export type AuthJwtAlgorithm = "HS256";

export type ApiEnv = {
  nodeEnv: string;
  host: string;
  port: number;
  logLevel: string;
  web: {
    corsOrigins: string[];
  };
  openApi: {
    enabled: boolean;
    basicAuth?: {
      username: string;
      password: string;
    };
  };
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
  const openApi = parseOpenApiConfig(source, nodeEnv);

  if (nodeEnv !== "development") {
    requireHighEntropySecret("JWT_SECRET", jwtSecret);
    requireHighEntropySecret("AUTH_REFRESH_TOKEN_PEPPER", refreshTokenPepper);
  }

  const webCorsOrigins = parseWebCorsOrigins(source.WEB_CORS_ORIGINS ?? "");

  if (nodeEnv !== "development" && webCorsOrigins.length === 0) {
    throw new Error("WEB_CORS_ORIGINS is required outside development.");
  }

  return {
    nodeEnv,
    host: source.HOST?.trim() || "127.0.0.1",
    port,
    logLevel: source.LOG_LEVEL?.trim() || "info",
    web: {
      corsOrigins: webCorsOrigins,
    },
    openApi,
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

function parseOpenApiConfig(
  source: NodeJS.ProcessEnv,
  nodeEnv: string,
): ApiEnv["openApi"] {
  const enabled = parseBoolean(
    "OPENAPI_ENABLED",
    source.OPENAPI_ENABLED,
    nodeEnv === "development",
  );

  if (!enabled) {
    return { enabled };
  }

  const username = source.OPENAPI_BASIC_AUTH_USERNAME?.trim();
  const password = source.OPENAPI_BASIC_AUTH_PASSWORD?.trim();

  if (nodeEnv === "development" && !username && !password) {
    return { enabled };
  }

  if (!username || !password) {
    throw new Error(
      "OPENAPI_BASIC_AUTH_USERNAME and OPENAPI_BASIC_AUTH_PASSWORD are required when OpenAPI is enabled outside development.",
    );
  }

  if (nodeEnv !== "development") {
    requireHighEntropySecret("OPENAPI_BASIC_AUTH_PASSWORD", password);
  }

  return {
    enabled,
    basicAuth: {
      username,
      password,
    },
  };
}

function parseBoolean(
  name: string,
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`${name} must be true or false.`);
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

function parseWebCorsOrigins(value: string): string[] {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        throw new Error("WEB_CORS_ORIGINS must contain valid URL origins.");
      }
    });

  return [...new Set(origins)];
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
