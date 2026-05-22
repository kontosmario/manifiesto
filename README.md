# Manifiesto Mobile

App mobile-only de **gastos familiares compartidos** (Expo + React Native + Expo Router + Supabase, es-AR).

## 🚀 Quick start

```bash
nvm use 22
npm install
npm run start      # · npm run ios · npm run android
```

Antes necesitás un `.env` (a partir de `.env.example`). Setup completo (env vars, Supabase CLI, push, deep linking, CI) en **[docs/operaciones/setup-entorno.md](docs/operaciones/setup-entorno.md)**.

## 📚 Documentación

Toda la documentación vive en **[`docs/`](docs/README.md)**. Puntos de entrada:

- **Estado actual del proyecto** (cada vista, componente, servicio) → [docs/ESTADO-DEL-PROYECTO](docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md)
- **Índice maestro de toda la doc** → [docs/README.md](docs/README.md)
- **Reglas de código** → [docs/arquitectura/code-rules.md](docs/arquitectura/code-rules.md)
- **Setup y entorno** → [docs/operaciones/setup-entorno.md](docs/operaciones/setup-entorno.md)

## Stack

Expo · React Native · TypeScript · Expo Router · Supabase (Postgres/RLS/RPC/Edge/cron) · TanStack React Query · Reanimated v4 · Expo Notifications · dark mode persistente.

Estructura del código: `app/` (rutas expo-router) · `mobile/` (`screens/`, `components/`, `features/`, `lib/`, `theme/`, `hooks/`) · `supabase/` (migraciones + edge functions).
