# Gastos Familia (Ionic React + Supabase)

App mobile-first de gastos compartidos para 2 usuarios, sin backend propio.

## Stack
- Vite + React + TypeScript
- Ionic React + Ionic Router
- Supabase (`@supabase/supabase-js`)
- TanStack React Query
- Deploy en GitHub Pages

## 1) Crear proyecto (desde cero)
```bash
npm create vite@latest gastos-familia -- --template react-ts
cd gastos-familia
npm install
npm install @ionic/react @ionic/react-router ionicons react-router@5.3.4 react-router-dom@5.3.4 @supabase/supabase-js @tanstack/react-query @tanstack/react-query-devtools
npm install -D @types/react-router@5 @types/react-router-dom@5
```

## 2) Variables de entorno
Crear `.env` a partir de `.env.example`:
```env
VITE_SUPABASE_URL=https://xaquigyhylzvuyfslkqq.supabase.co
VITE_SUPABASE_KEY=sb_publishable_IW-shCHE7J00_e1DCOaP7Q_9iwprkLd
VITE_BASE_PATH=/
```

## 3) Supabase paso a paso
1. Crear proyecto en Supabase.
2. Ir a `SQL Editor` y ejecutar `sql/supabase.sql` completo.
3. Ir a `Authentication -> Providers -> Email` y habilitar Email/Password.
4. (Opcional recomendado) desactivar confirmación por email para pruebas rápidas.

### Push notifications (Web Push + Supabase Edge Function)
1. Generar llaves VAPID:
```bash
npx web-push generate-vapid-keys
```
2. Configurar frontend (`.env`):
```env
VITE_WEB_PUSH_PUBLIC_KEY=<public_key>
```
3. Configurar secrets de la Edge Function:
```bash
supabase secrets set WEB_PUSH_VAPID_PUBLIC_KEY=<public_key>
supabase secrets set WEB_PUSH_VAPID_PRIVATE_KEY=<private_key>
supabase secrets set WEB_PUSH_CONTACT_EMAIL=tu-email@dominio.com
```
4. Deploy de la función:
```bash
supabase functions deploy send-family-push
```
5. En la app, abrir menú familiar y tocar `Activar push`.

Si desplegás en GitHub Pages, agregá también `VITE_WEB_PUSH_PUBLIC_KEY` como `Repository secret` (o `Repository variable`) para que quede embebida en el build.

## 4) Correr local
```bash
nvm use 22
npm install
npm run dev
```

## 5) Deploy GitHub Pages
1. Subir repo a GitHub.
2. Agregar secrets del repo:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_KEY`
   - `VITE_WEB_PUSH_PUBLIC_KEY`
3. En GitHub: `Settings -> Pages -> Build and deployment -> Source: GitHub Actions`.
4. Push a `main`.

El workflow `/.github/workflows/deploy-pages.yml` compila con:
```bash
VITE_BASE_PATH=/<repo-name>/
```
y genera también `dist/404.html` para fallback SPA.

## Base path configurable
`vite.config.ts` usa `VITE_BASE_PATH`:
```ts
base: env.VITE_BASE_PATH || '/'
```
Para GitHub Pages usar `/<repo-name>/`.

## Scripts
```bash
npm run dev
npm run build
npm run preview
```
