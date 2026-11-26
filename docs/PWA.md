# Progressive Web App (PWA)

Configured via `vite-plugin-pwa` in `vite.config.ts`:
- **Manifest**: Standalone display mode, `id: '/'`, `start_url: '/'`, `192x192`, `512x512`, `maskable 512x512`, and `180x180` iOS `apple-touch-icon.png`.
- **Service Worker Security**: All `/api/*` paths use `NetworkOnly` and are excluded from `navigateFallback`, ensuring private account and financial API responses are never cached in the service worker.
- **In-App Install & Status UX**: `PWAInstallButton` supports Chromium `beforeinstallprompt` and iOS Safari Share-sheet instructions; `OfflineStatusBanner` warns clearly that server mutations require connectivity.
