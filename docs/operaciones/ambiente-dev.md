# Ambiente de desarrollo — base de datos y backend

> **Creado:** 2026-08-05 · **Estado:** 🔧 vigente
>
> Hasta acá había **un solo** proyecto Supabase y era producción. La app, los
> tests de integración y `db push` apuntaban todos ahí: probar un cambio de
> backend significaba probarlo sobre datos reales de usuarios reales.
>
> Ahora hay tres ambientes. Este documento explica cuál usar, cómo levantarlos y
> cómo se promueve un cambio hasta prod.

---

## Los tres ambientes

| | Dónde vive | Para qué | Costo |
|---|---|---|---|
| **local** | Docker en tu Mac | El loop rápido: migraciones, RPCs, RLS, seeds. `db reset` reconstruye todo en un comando. | $0 |
| **staging** | Supabase `manifiesto-staging` (`loyhlbemrrcenwejfsfq`, us-east-1) | El ensayo general: push reales al device, `pg_cron` corriendo solo, edge functions deployadas. | $0 (free tier, 2 proyectos) |
| **producción** | Supabase `xaquigyhylzvuyfslkqq` | Usuarios reales. No se toca desde los comandos de desarrollo. | — |

**El local no reemplaza a staging.** Local no puede recibir webhooks de Apple ni
mandar push que lleguen a un device fuera de tu red. Staging sí. Pero staging es
lento para iterar: cada cambio de migración es un round-trip a la nube. La regla
práctica es **iterá en local, confirmá en staging, después prod**.

---

## Arranque rápido

```bash
npm run db:local:up      # levanta el stack local (Docker)
npm run db:local:reset    # aplica las 290 migraciones + siembra datos de prueba
npm run local:ios         # corre la app en tu iPhone contra el stack local
```

Contra staging:

```bash
npm run dev:ios           # la app en tu iPhone contra staging
```

Y prod sigue siendo lo de siempre: `npm run ios` con el `.env` de siempre.

---

## Cuentas de prueba

Las siembra `supabase/seed.sql`. Todas con contraseña **`Dev-2026!`** y email ya
confirmado, así que entrás directo sin OTP.

| Cuenta | Qué estado reproduce |
|---|---|
| `dev.hogar@manifiesto.test` | Hogar compartido (2 miembros), ingreso fijo, **a mitad de ciclo**: ~35 gastos con huecos deliberados para que la racha del jardín tenga sentido, 5 fijos (uno vencido, uno inminente, uno en cuotas), 2 metas de ahorro. |
| `dev.pareja@manifiesto.test` | El segundo miembro del hogar de arriba. |
| `dev.solo@manifiesto.test` | Unipersonal con **ingreso dinámico** (sin sueldo fijo; el cupo sale de los ingresos cargados). |
| `dev.nuevo@manifiesto.test` | Recién creada, cero datos: estados vacíos, onboarding financiero y los 4 tours sin ver. |
| `dev.cerrado@manifiesto.test` | Con un **ciclo anterior ya cerrado** (por el RPC real `close_monthly_cycle`): Control → Meses, wrapped, decisión de sobrante. |

Dos propiedades que conviene no romper al editarlo:

- **Las fechas son relativas a `current_date`.** El ciclo del hogar compartido se
  ancla 18 días atrás, así que cae a mitad de camino sin importar qué día lo
  corras. Si alguna vez ves datos flacos, revisá que no se haya colado una fecha
  fija.
- **Usa los RPC reales de la app** (`bootstrap_family`, `close_monthly_cycle`)
  suplantando al usuario con `request.jwt.claims`, en vez de reimplementar su
  lógica. Así el seed no se desincroniza cuando esa lógica cambia.

El seed es **re-ejecutable**: purga las cuentas `dev.*` de la corrida anterior y
vuelve a sembrar. En staging esa es la forma de recuperar un ciclo fresco:

```bash
npm run db:seed:staging
```

En local no hace falta, `db:local:reset` siembra solo.

---

## Comandos

### App

| Comando | Qué hace |
|---|---|
| `npm run dev:start` / `dev:ios` / `dev:android` | Metro apuntando a **staging** |
| `npm run local:start` / `local:ios` | Metro apuntando al **stack local** |
| `npm start` / `npm run ios` | Lo de siempre: **producción** |

### Base de datos

| Comando | Qué hace |
|---|---|
| `npm run db:local:up` / `db:local:down` | Levanta / baja el stack local |
| `npm run db:local:reset` | Reconstruye la base local desde cero + seed |
| `npm run db:local:studio` | Abre Supabase Studio local |
| `npm run db:staging:push` | Aplica las migraciones pendientes a staging |
| `npm run db:staging:diff` | Diff del esquema de staging contra las migraciones |
| `npm run db:seed:staging` | Re-siembra staging |
| `npm run functions:staging:deploy` | Deploya las edge functions a staging |

Los comandos contra **prod** siguen siendo los `supabase:remote:*` de siempre.
Son deliberadamente otro prefijo: que apuntarle a producción se lea distinto.

### Tests

| Comando | Contra qué corre |
|---|---|
| `npm test` | Nada: solo unitarios, sin red ni base |
| `npm run test:integration` | **staging** |
| `npm run test:integration:prod` | producción (escotilla, evitar) |

Dos cambios acá, ambos del 2026-08-05:

- **`npm test` ya no corre los tests de integración.** `vitest.config.ts` incluía
  `tests/**` sin excluir `tests/integration/`, así que `npm test` — y por lo
  tanto `npm run validate` — se conectaba a un Supabase real y **escribía en
  producción**. Ahora los unitarios no tocan ninguna base y el suite pasa entero
  (157 archivos, 1526 tests).
- **`test:integration` apunta a staging por default.** Antes salía a prod, porque
  el destino se leía de `.env.supabase`. La versión peligrosa quedó como
  `test:integration:prod`, explícita.

> ⚠️ Hoy 48 de esos tests fallan con `cannot insert into view "categories"`.
> **Es preexistente**, no una regresión del ambiente: falla igual contra prod y
> contra staging. Los helpers insertan en `categories`, que pasó a ser una VISTA
> en el cutover de categorías de junio (`20260627144108`). Hay que reescribirlos
> contra `family_custom_categories` y `category_templates`.

### Archivos de entorno

| Archivo | Apunta a | ¿Se commitea? |
|---|---|---|
| `.env` | producción | no |
| `.env.dev` | staging | no (hay `.env.dev.example`) |
| `.env.localdb` | stack local | no (hay `.env.localdb.example`) |

`.env.localdb` usa el placeholder `__LAN_IP__`, que `scripts/env-runner.mjs`
reemplaza por la IP de tu máquina en la red. Hace falta porque **en Apple Silicon
la app corre en un iPhone físico** (ver
[[feedback_ios_sim_excluded_archs_arm64]]) y el device no resuelve `127.0.0.1`:
tiene que llegar por la red local. Como la IP cambia de red en red, no se puede
fijar en el archivo.

### La guarda anti-prod

`scripts/env-runner.mjs` aborta si el archivo de entorno apunta al ref de
producción. Todo el punto del ambiente es no tocar prod; un `dev:ios` que
silenciosamente hable con producción sería peor que no tener ambiente:

```
✖ .env.dev apunta a PRODUCCIÓN (xaquigyhylzvuyfslkqq).
```

`scripts/db-seed.mjs` repite el chequeo, y `supabase/seed.sql` tiene el suyo
propio del lado de la base: aborta si encuentra usuarios que no son de prueba.
Tres capas, porque el error que previenen no tiene vuelta atrás.

---

## Cómo se promueve un cambio de backend

1. **Escribí la migración** y probala en local: `npm run db:local:reset`. El reset
   la aplica desde cero junto con todas las anteriores, así que también verifica
   que la cadena completa siga siendo reproducible.
2. **Subila a staging**: `npm run db:staging:push`.
3. **Probá la app contra staging**: `npm run dev:ios`. Acá es donde se ven las
   cosas que local no puede mostrar — push que llegan al device, cron corriendo
   solo, edge functions de verdad.
4. **Recién ahí, prod**: `npm run supabase:remote:db:push`.

Antes de tocar prod conviene correr `npm run supabase:remote -- migration list` y
confirmar que las dos columnas están alineadas.

---

## Trampas conocidas

**El `.env` del disco viajaba al bundle y le GANABA al env inyectado.** En dev,
Expo reescribe `process.env.EXPO_PUBLIC_*` al módulo `expo/virtual/env`, que se
transforma en un `require.context` sobre los `.env*` de la raíz y los mezcla
como `{ ...process.env, ...archivos }` — el archivo pisa lo inyectado. Resultado
(detectado 2026-08-05 parseando el bundle): `npm run start:dev` bundleaba LAS DOS
URLs de Supabase y la app del device le hablaba a **prod**. El fix vive en
`metro.config.js` (blockList sobre los `.env` de la raíz: el context queda vacío
y el template cae a `process.env`) + `EXPO_NO_DOTENV=1` en `env-runner`.
Verificado en ambas direcciones: el bundle de `start:dev` contiene SOLO staging
y el de `npm start` SOLO prod. Costo: editar un `.env` con Metro corriendo ya no
hot-reloadea (nuestros scripts usan `-c` y reinician igual). Corolario: el
archivo que cargue `env-runner` debe ser AUTOSUFICIENTE — por eso `.env.dev`
replica todas las claves públicas de `.env`, no solo las de Supabase.

**No apliques migraciones a prod por MCP.** Cada `apply_migration` re-estampa el
timestamp, y el archivo local queda con un número distinto al del ledger. Así se
generaron las 61 migraciones desalineadas que hubo que reconciliar el 2026-08-04.
Usá `db push`, que ahora funciona.

**Los seeds de datos no van en migraciones.** Las migraciones
`seed_control_demo_account`, `seed_home_test_account`, `seed_apple_review_account`
y las tres de `sim_account_kenility` quedaron gateadas: no corren salvo que
pidas explícitamente `set manifiesto.seed_demo_accounts = 'on'`. Creaban cuentas
en cada base nueva y sus gastos hacían abortar la compactación de categorías. El
dato de desarrollo va en `supabase/seed.sql`.

**Cada ambiente declara su propia URL de orchestrator.**
`dispatch_notifications_kind` tenía la URL de producción hardcodeada; ahora la
lee del secreto `orchestrator_url` del vault. Si creás otro ambiente, cargáselo:

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/notifications-orchestrator',
  'orchestrator_url',
  'URL del orchestrator de ESTE ambiente');
```

Sin ese secreto la función **no despacha** y avisa con un warning. Es a propósito:
antes que mandarle push a los usuarios de otro ambiente, prefiere no mandar nada.

**Storage está apagado en local.** La app no usa Supabase Storage (cero llamadas
a `.storage`; los avatares son packs de assets y el OCR corre on-device). El
contenedor quedaba unhealthy y hacía fallar `db reset`. Si algún día se suben
archivos, volver a `enabled = true` en `config.toml`.

---

## Lo que staging todavía NO puede hacer

Requieren acción tuya en consolas externas:

- **Validar compras (IAP).** Faltan los secrets `APPLE_IAP_KEY_P8`,
  `APPLE_IAP_KEY_ID` y `APPLE_IAP_ISSUER_ID`. No los copié de prod: son
  credenciales de firma y la decisión de reusarlas es tuya.
- **Recibir webhooks de Apple.** App Store Connect permite una URL de producción
  y una de sandbox; habría que apuntar la de **sandbox** a staging, lo que se la
  quita a prod.
- **Web push.** Faltan `WEB_PUSH_VAPID_PUBLIC_KEY` / `_PRIVATE_KEY`. Para push
  mobile no hacen falta (van por Expo).

El resto — auth, RLS, RPCs, cron, push por Expo, edge functions — está funcionando
y verificado.

---

## Ver también

- [setup-entorno.md](setup-entorno.md) — setup general del proyecto
- [runbook-backend-hardening.md](runbook-backend-hardening.md) — operación del backend en prod
- [../sistemas/notifications.md](../sistemas/notifications.md) — pipeline de notificaciones
