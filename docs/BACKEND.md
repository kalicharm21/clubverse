# Backend Architecture

The Express backend under `server/` implements 13 domain modules inside a clean modular monolith.

## Layer Responsibilities

- **Routes (`*.routes.ts`)**: Declare `/api/v1/*` paths and attach middleware (`requireAuth`, `requireClubAdmin`, `requireEventPermission`, `validateBody`).
- **Controllers (`*.controller.ts`)**: Extract HTTP params/query/body, invoke pure services, and return standardized `sendSuccess` responses. Zero business logic lives in controllers.
- **Services (`*.service.ts`)**: Enforce business rules (e.g., 2-club limit, endTime > startTime, single-use attendance, financial totals, audit logging) without importing Express `Request`/`Response`.
- **Adapters (`server/adapters/`)**: `DataAdapter` defines the contract implemented by `DemoDataAdapter` in Phase 1 and Drizzle/PostgreSQL repositories in Phase 2.
