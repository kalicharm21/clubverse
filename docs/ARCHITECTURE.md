# System Architecture

CampusVerse follows a **modular monolith** architecture with strict separation between HTTP transport, business logic, database privilege boundaries, and persistence adapters.

```mermaid
flowchart TB
  subgraph Client["React 19 SPA + PWA"]
    Router[React Router v7]
    TQ[TanStack Query Cache]
    SBClient["@supabase/supabase-js (Auth Only)"]
    AuthCtx[AuthContext]
    ClientAdapter[ApiDataAdapter]
  end

  subgraph Server["Express Modular Monolith (Port 3000)"]
    Security[Helmet + Restrictive CORS + Rate Limiter]
    AuthMW["Authentication MW (ES256 JWKS Verify + Provision)"]
    RlsCtx["dbRequestContext (AsyncLocalStorage)"]
    AuthzMW[Role & Club Permission MW]
    ValMW[Zod Schema Validation]
    Modules[13 Business Modules]
    AdapterIF[DataAdapter Interface]
    PgAdapter[PostgresDataAdapter + Domain Repositories]
    DemoStore["DemoDataAdapter (Isolated Dev/Test Only)"]
  end

  subgraph Data["Supabase PostgreSQL 17"]
    Pooler["Supavisor Session Pooler (prepare: false)"]
    RLS["Row-Level Security + Triggers + FOR UPDATE Locks"]
  end

  Router --> TQ --> ClientAdapter
  AuthCtx --> SBClient
  AuthCtx --> ClientAdapter
  ClientAdapter -->|/api/v1/* + Bearer JWT| Security --> AuthMW --> RlsCtx --> AuthzMW --> ValMW --> Modules
  Modules --> AdapterIF --> PgAdapter --> Pooler --> RLS
  AdapterIF -.->|ENABLE_DEMO_MODE=true & No DB URL| DemoStore
```

## Request Lifecycle

`Request → Router → Supabase JWT Verify → AsyncLocalStorage RLS Context → RBAC/Club Permission Check → Zod Input Validation → Controller → Service → PostgresDataAdapter → Transaction (SET LOCAL app.current_user_id / app.current_global_role) → Standardized JSON Response`

## Adapter Selection Rules

- **Production (`NODE_ENV === 'production'`)**: Requires `DATABASE_URL` (restricted `campusverse_app` role) and `SUPABASE_URL`; fails fast on startup if missing.
- **Development with DB configured**: Uses `PostgresDataAdapter` (`DATABASE_URL` preferred, `DATABASE_MIGRATION_URL` permitted locally until `DATABASE_URL` is added).
- **Isolated Demo Sandbox**: Active **only** when `NODE_ENV !== 'production' && ENABLE_DEMO_MODE === 'true'` AND no PostgreSQL URL is present (or inside isolated Vitest unit tests injecting `DemoDataAdapter`). No silent fallback from PostgreSQL errors to demo mode ever occurs.
