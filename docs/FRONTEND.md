# Frontend Architecture

The frontend is a React 19 + TypeScript single-page application built with Vite and Tailwind CSS 4.

## Key Layers

- **State & Networking**: TanStack Query manages server cache invalidation across `/api/v1/*` mutations via `src/adapters/ApiDataAdapter.ts`.
- **Authentication Context**: `src/context/AuthContext.tsx` holds the signed Bearer token exclusively in React memory (never persisted in `localStorage` or `sessionStorage`) and manages active context switching (`student`, `club_admin`, `core_member`, `super_admin`) plus `activeClubId`.
- **Forms & Validation**: React Hook Form paired with `@hookform/resolvers/zod` reusing shared schemas from `shared/schemas/validation.ts`.
- **Layout & Navigation**: `src/components/layout/AppShell.tsx` renders a unified responsive sidebar, breadcrumbs, global search, notification popover, PWA install trigger, and profile menu.
