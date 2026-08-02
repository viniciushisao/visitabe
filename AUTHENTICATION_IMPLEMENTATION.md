# Visita API - Authentication Implementation Plan

> Source guide: [AUTHENTICATION.md](./AUTHENTICATION.md)  
> Scope: Anonymous authentication for the MVP, with a path to future account linking  
> Status: Implementation plan

## Goal

Ship anonymous authentication without adding unnecessary infrastructure.

The first release should let a mobile installation create a real internal user, keep a session alive with rotating refresh tokens, protect private API routes, and preserve the same `user.id` when Google, Apple, email, or another identity is linked later.

## Constraints

- Keep authentication inside the existing Fastify API.
- Store sessions in PostgreSQL through Prisma.
- Do not add Redis, queues, workers, a separate auth service, Docker, or another database.
- Do not store raw refresh tokens.
- Do not trust user IDs from request bodies.
- Do not expose OpenAI-backed routes without a valid access token.
- Keep all token lifetimes, issuer, audience, and signing secrets configurable through environment variables.

## Current Repo State

The API is intentionally small today:

- `api/src/app.ts` builds a bare Fastify app.
- `api/src/server.ts` starts the app.
- `api/src/lib/prisma.ts` creates the Prisma client.
- `api/prisma/schema.prisma` has no models yet.
- `api/.env.example` has base API, database, and OpenAI variables only.

That means the auth implementation can be introduced cleanly without untangling existing route behavior.

## Dependencies

Add only small application dependencies that solve immediate auth needs:

- `jose` for signing and verifying JWT access tokens with explicit issuer, audience, expiration, and algorithm checks.
- `@fastify/rate-limit` for simple in-process rate limiting while the API runs as one instance.

Use Node's built-in `crypto` module for refresh-token generation and hashing. Do not add bcrypt, argon2, Redis-backed rate limiting, or a generic auth framework for the anonymous-token MVP.

## Target Project Structure

```text
api/src/
  auth/
    auth-controller.ts
    auth-errors.ts
    auth-repository.ts
    auth-routes.ts
    auth-schemas.ts
    auth-service.ts
    auth-types.ts
    token-service.ts
  config/
    env.ts
  plugins/
    authentication.ts
```

Keep these responsibilities narrow:

- Routes register paths and schemas.
- Controllers translate Fastify requests and replies.
- `AuthService` owns the anonymous, refresh, me, and logout flows.
- `AuthRepository` owns Prisma reads and writes.
- `TokenService` owns access-token and refresh-token creation, hashing, and verification.
- `plugins/authentication.ts` verifies bearer access tokens and attaches `request.user`.

## Phase 0 - Environment And Conventions

Status: Done.

Added configuration before writing auth behavior.

Tasks:

- Add `api/src/config/env.ts`.
- Parse and validate required env vars at process startup.
- Add auth placeholders to `api/.env.example`.
- Decide the initial JWT algorithm.

Recommended initial signing choice:

- Use `HS256` for the MVP only if production secret management is simple and reliable.
- Keep `AUTH_JWT_ALGORITHM` explicit.
- Require `JWT_SECRET` to be high entropy outside local development.
- Leave the code shaped so `RS256` or `EdDSA` can replace `HS256` later without changing route behavior.

Required env vars:

```env
AUTH_ISSUER=https://api.visita.app
AUTH_AUDIENCE=visita-mobile
AUTH_ACCESS_TOKEN_TTL_SECONDS=900
AUTH_REFRESH_TOKEN_TTL_SECONDS=2592000
AUTH_JWT_ALGORITHM=HS256
AUTH_REFRESH_TOKEN_PEPPER=
JWT_SECRET=
```

Acceptance checks:

- The API fails fast if auth configuration is missing or invalid.
- Token TTLs are positive integers.
- The JWT algorithm is not inferred from incoming tokens.
- `.env.example` documents every required auth setting without real secrets.

## Phase 1 - Database Foundation

Status: Done in code. Migration apply is pending a local `DATABASE_URL`.

Created the persistent model that makes anonymous users, sessions, logout, and future identity linking possible.

Tasks:

- Add Prisma enums:
  - `UserStatus`: `anonymous`, `registered`, `disabled`
  - `IdentityProvider`: `google`, `apple`, `email`
  - `AuthPlatform`: `ios`, `android`
- Add `User`.
- Add `AuthIdentity`.
- Add `AuthSession`.
- Add `AuthRefreshToken`.
- Generate Prisma client.
- Create and run the first auth migration.

Suggested Prisma shape:

```prisma
model User {
  id        String     @id
  status    UserStatus @default(anonymous)
  createdAt DateTime   @default(now()) @map("created_at")
  updatedAt DateTime   @updatedAt @map("updated_at")

  identities AuthIdentity[]
  sessions   AuthSession[]

  @@map("users")
}

model AuthIdentity {
  id              String           @id
  userId          String           @map("user_id")
  provider        IdentityProvider
  providerSubject String           @map("provider_subject")
  email           String?
  emailVerified   Boolean?         @map("email_verified")
  createdAt       DateTime         @default(now()) @map("created_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerSubject])
  @@index([userId])
  @@map("auth_identities")
}

model AuthSession {
  id             String       @id
  userId         String       @map("user_id")
  installationId String       @map("installation_id")
  platform       AuthPlatform
  appVersion     String       @map("app_version")
  tokenFamilyId  String       @map("token_family_id")
  expiresAt      DateTime     @map("expires_at")
  lastUsedAt     DateTime?    @map("last_used_at")
  revokedAt      DateTime?    @map("revoked_at")
  createdAt      DateTime     @default(now()) @map("created_at")
  updatedAt      DateTime     @updatedAt @map("updated_at")

  user          User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshTokens AuthRefreshToken[]

  @@index([userId])
  @@index([tokenFamilyId])
  @@index([expiresAt])
  @@map("auth_sessions")
}

model AuthRefreshToken {
  id               String    @id
  sessionId        String    @map("session_id")
  tokenFamilyId    String    @map("token_family_id")
  refreshTokenHash String    @unique @map("refresh_token_hash")
  expiresAt        DateTime  @map("expires_at")
  usedAt           DateTime? @map("used_at")
  revokedAt        DateTime? @map("revoked_at")
  replacedByTokenId String?  @map("replaced_by_token_id")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  session AuthSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@index([tokenFamilyId])
  @@index([expiresAt])
  @@map("auth_refresh_tokens")
}
```

Acceptance checks:

- A user can have multiple sessions.
- A user can later have multiple external identities.
- `AuthIdentity` uniqueness is based on provider subject, not email.
- Refresh-token lookup by hash is indexed.
- Used refresh tokens remain discoverable until expiration, so reuse can revoke the session family.
- Domain tables added later can reference `User.id`.

## Phase 2 - Token Service

Implement token primitives before wiring HTTP endpoints.

Tasks:

- Add access-token signing with `iss`, `aud`, `sub`, `sid`, `iat`, and `exp`.
- Add access-token verification with a fixed algorithm allowlist.
- Generate opaque refresh tokens in the format `<token-id>.<random-secret>`.
- Hash refresh tokens with HMAC-SHA-256 plus `AUTH_REFRESH_TOKEN_PEPPER`.
- Compare token hashes with timing-safe comparison where applicable.
- Ensure raw tokens are never logged.

Implementation notes:

- `token-id` can be a prefixed ID such as `rft_<uuid>` for diagnostics, but authorization must depend on the random secret hash.
- Store the hash of the full opaque refresh token for fewer parsing footguns.
- Access-token expiration remains short because logout revokes refresh but cannot revoke already-issued JWTs without extra infrastructure.

Acceptance checks:

- Access tokens expire after `AUTH_ACCESS_TOKEN_TTL_SECONDS`.
- Refresh tokens expire after `AUTH_REFRESH_TOKEN_TTL_SECONDS`.
- Malformed, expired, wrong-audience, wrong-issuer, and wrong-algorithm JWTs are rejected.
- No tests, logs, or fixtures contain live token secrets.

## Phase 3 - Auth Repository And Service

Implement auth behavior as service methods that can be exercised directly and through HTTP tests.

Tasks:

- `createAnonymousSession(input)`
  - Validate `installationId`, `platform`, and `appVersion`.
  - Create `User`.
  - Create `AuthSession`.
  - Create the first `AuthRefreshToken`.
  - Return user data plus access and refresh tokens.
- `refreshSession(refreshToken)`
  - Hash the submitted token.
  - Find the refresh-token row and its session.
  - Reject missing, expired, revoked, or already-used tokens.
  - Mark the submitted refresh token as used.
  - Create the replacement refresh-token row.
  - Link the old token to the replacement token.
  - Return a new access token and refresh token.
- `getCurrentUser(userId)`
  - Return public user fields and identity provider names.
- `logoutSession(sessionId)`
  - Revoke only the current session.

Important rotation detail:

Refresh tokens live in `AuthRefreshToken` rather than only on `AuthSession` so the API can detect an old token being replayed after rotation. If a token row is found but already has `usedAt`, revoke every active token and session in the same `tokenFamilyId`.

Acceptance checks:

- Refresh-token rotation is one-time use.
- Rotation happens in a Prisma transaction.
- Reusing an old refresh token revokes the session family.
- Logout prevents future refresh for that session.
- Service errors map to public auth error codes without leaking database details.

## Phase 4 - HTTP Routes And Middleware

Expose the MVP endpoints and protect future private routes.

Tasks:

- Register `@fastify/rate-limit` in `buildApp`.
- Add `POST /v1/auth/anonymous`.
- Add `POST /v1/auth/refresh`.
- Add `GET /v1/auth/me`.
- Add `POST /v1/auth/logout`.
- Add `authenticate` middleware/decorator.
- Add Fastify request typing for:

```ts
type AuthenticatedUser = {
  userId: string;
  sessionId: string;
};
```

Route behavior:

- Public auth endpoints return the documented error envelope.
- Protected routes require `Authorization: Bearer <access-token>`.
- `request.user.userId` is the only user scope trusted by business routes.
- `GET /v1/auth/me` never returns session internals, token hashes, provider subjects, or secrets.
- `POST /v1/auth/logout` returns `204 No Content`.

Acceptance checks:

- Anonymous account creation returns `201`.
- Refresh returns a new access token and a new refresh token.
- `me` works with a valid access token.
- Requests with missing, malformed, expired, wrong-issuer, or wrong-audience access tokens return `401`.
- Logout revokes the persisted session.

## Phase 5 - Logging, Abuse Controls, And OpenAI Route Safety

Add the minimum operational protections before connecting auth to OpenAI-backed product endpoints.

Tasks:

- Mask `authorization` headers in Fastify logs.
- Avoid logging full auth request bodies.
- Log auth event type, user ID, session ID, result category, timestamp, and request ID.
- Apply strict rate limits to:
  - `POST /v1/auth/anonymous`
  - `POST /v1/auth/refresh`
  - OpenAI-backed endpoints
- Use per-IP limits for public anonymous account creation.
- Use per-user or per-session limits after authentication.
- Ensure every OpenAI-backed endpoint uses the auth middleware.

Acceptance checks:

- Raw access tokens and refresh tokens do not appear in logs.
- Public auth endpoints are rate-limited.
- OpenAI-backed endpoints reject unauthenticated requests.
- No Redis or external rate-limit store is required for the single-instance MVP.

## Phase 6 - Test Coverage

Add focused tests at the HTTP boundary, with smaller unit tests for token utilities.

Minimum HTTP tests:

- `POST /v1/auth/anonymous` creates a user and session.
- `GET /v1/auth/me` accepts a valid access token.
- Protected routes reject missing access tokens.
- Protected routes reject malformed access tokens.
- Protected routes reject expired access tokens.
- `POST /v1/auth/refresh` succeeds with a valid refresh token.
- Refresh rotation invalidates the previous refresh token.
- Reusing a rotated refresh token revokes the session family.
- Refresh rejects revoked sessions.
- `POST /v1/auth/logout` revokes the current session.
- Authenticated resource access cannot be redirected to another user by changing body or path IDs.
- Anonymous account creation is rate-limited.

Unit tests:

- Refresh-token generation uses random opaque values.
- Refresh-token hashing is deterministic for lookup.
- JWT verification enforces issuer, audience, expiration, and algorithm.
- Public error mapping hides internal errors.

Acceptance checks:

- `npm test` passes.
- `npm run typecheck` passes.
- Security-sensitive behavior is covered through Fastify `app.inject` tests where possible.

## Phase 7 - Flutter Client Integration

Do this once the backend endpoints are stable enough for the app to consume.

Tasks:

- Generate and persist a random installation UUID on first launch.
- Call `/v1/auth/anonymous` only when no refresh token exists.
- Store access and refresh tokens in OS-backed secure storage.
- Attach the access token to protected API requests.
- Refresh when the access token is expired or close to expiring.
- Retry the original request once after successful refresh.
- Coalesce concurrent refresh attempts into one in-flight refresh request.
- Clear local tokens on logout or unrecoverable refresh failure.

Acceptance checks:

- Reinstalling the app creates a new anonymous account unless secure storage survives the reinstall.
- Closing and reopening the app keeps the session if the refresh token is valid.
- Expired access tokens are refreshed without user-visible friction.
- Failed refresh clears local auth state and starts a new anonymous flow deliberately.
- Tokens are not stored in SharedPreferences, logs, analytics, crash reports, or plain files.

## Phase 8 - Future Account Linking

Do not implement this for the first anonymous-auth release, but preserve the model for it.

Future tasks:

- Add `POST /v1/auth/link/google`.
- Add `POST /v1/auth/link/apple`.
- Add `POST /v1/auth/link/email`.
- Validate provider proofs on the backend.
- Attach verified provider identities to the current `user.id`.
- Change `User.status` from `anonymous` to `registered`.
- Add conflict handling when a provider identity already belongs to a different user.
- Design account recovery and explicit merge flows before merging any users.

Acceptance checks:

- Linking never creates a second user for the currently authenticated anonymous account.
- Existing clients, visits, actions, and other user-owned data remain attached to the same `user.id`.
- Provider identity uniqueness uses provider subject, not email.
- Account conflicts do not expose another user's data.

## Release Checklist

- [ ] Production traffic uses HTTPS.
- [ ] Auth env vars are configured in the hosting platform.
- [ ] JWT signing secret or private key is not committed.
- [ ] JWT issuer, audience, expiration, and algorithm are verified.
- [ ] Access tokens are short-lived.
- [ ] Refresh tokens are opaque, random, hashed, and rotated.
- [ ] Reused rotated refresh tokens revoke their session family.
- [ ] Logout revokes the current persisted session.
- [ ] Auth endpoints and OpenAI-backed endpoints are rate-limited.
- [ ] Logs mask tokens and authorization headers.
- [ ] Every protected domain query is scoped by `request.user.userId`.
- [ ] Flutter stores tokens in Keychain or Keystore-backed secure storage.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.

## Non-Goals

- Password authentication
- Email verification
- Google or Apple login in the first release
- Redis-backed token revocation or rate limiting
- Authentication microservice
- Hardware device fingerprinting
- Automatic account merging
- Permanent access tokens
- API keys in the mobile app
