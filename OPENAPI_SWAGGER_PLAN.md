# OpenAPI Swagger Documentation Plan

## Goal

Add OpenAPI/Swagger documentation to the Fastify API while keeping the MVP architecture simple. The Fastify route schemas should remain the source of truth for request and response documentation.

## Assumption

This plan covers OpenAPI/Swagger documentation for the Visita Fastify API, not documentation for the OpenAI API.

## Implementation Plan

Status: Done

1. [x] Add the official Fastify documentation plugins to the API package:
   - [x] `@fastify/swagger`
   - [x] `@fastify/swagger-ui`

2. [x] Create an OpenAPI plugin at `api/src/plugins/openapi.ts`.

   The plugin should register:
   - [x] OpenAPI version `3.0.3`
   - [x] API title `Visita API`
   - [x] API version from `api/package.json`
   - [x] tags such as `Auth`
   - [x] bearer authentication security scheme
   - [x] Swagger UI at `/docs`
   - [x] raw OpenAPI JSON at `/openapi.json`

3. [x] Register the OpenAPI plugin in `api/src/app.ts`.

   Register it before API routes so the generated document includes all route schemas.

4. [x] Improve route schemas in `api/src/auth/auth-routes.ts`.

   Add:
   - [x] `tags`
   - [x] `summary`
   - [x] `description`
   - [x] `security: [{ bearerAuth: [] }]` for protected routes
   - [x] an explicit success response for `POST /v1/auth/logout`, such as `204`, if that is the intended behavior

5. [x] Refactor schemas in `api/src/auth/auth-schemas.ts`.

   The current inline JSON schemas are enough for OpenAPI generation, but Swagger UI renders reusable models better when schemas are registered with `$id` and referenced with `$ref`.

   Completed by registering named auth schemas with `$id`, using `$ref` from route request and response schemas, and preserving schema names in generated OpenAPI components.

6. [x] Add tests.

   Cover:
   - [x] `GET /openapi.json` returns an OpenAPI document
   - [x] the document includes `/v1/auth/anonymous`
   - [x] the document includes `/v1/auth/refresh`
   - [x] the document includes `/v1/auth/me`
   - [x] the document includes `/v1/auth/logout`
   - [x] protected routes include bearer authentication metadata
   - [x] `/docs` loads successfully

7. [x] Verify the implementation.

   Run:

   ```sh
   npm run typecheck
   npm run test
   ```

   Then start the API and manually open `/docs`.

   Automated verification completed:

   ```sh
   npm run typecheck
   npm run test
   npm run lint
   ```

   Manual browser verification is still available by starting the API and opening `/docs`.

## Notes

- Do not add a separate documentation service.
- Do not generate server code from OpenAPI.
- Do not introduce infrastructure outside the current Fastify API.
- Keep route schemas as the documentation source of truth.
