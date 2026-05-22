# Account kinds — modo soltero (familia invisible)

> 🗓️ **Vigente** (2026-05-22) · Primer slice de la [expansión multi-segmento](../auditorias/expansion-multisegmento-2026-05-22/README.md). Doc canónico del sistema; se actualiza in-place.

## Qué es

Manifiesto soporta dos tipos de espacio, marcados en `families.kind`:

- **`shared`** (default): familia/pareja que comparte gastos. Comportamiento histórico.
- **`solo`**: un único usuario. Es una `familia` de 1 miembro, pero la UI **oculta todos los conceptos de familia** (avatares de miembros, invitar, gestionar miembros, "aporte"). El usuario nunca ve la palabra "familia/hogar".

El modelo sigue siendo el mismo (`families`/`family_members`/`family_finance`): un soltero es una familia invisible de 1. Esto mantiene las ~129 referencias a `family_id` sin cambios y es **forward-compatible** con la futura abstracción `workspaces.type` (pymes, fase 2).

## Backend

- **Columna:** `families.kind text not null default 'shared' check (kind in ('solo','shared'))` — migración [`20260522010000_families_kind.sql`](../../supabase/migrations/20260522010000_families_kind.sql).
- **RPC `set_family_kind(p_kind text)`:** owner-only (vía `is_family_owner`), `security definer`. Setea el kind de la familia del caller; clamp a valores válidos. Misma migración.
- **`home_snapshot()`** incluye `kind` en su slice `family` ([`20260522020000_home_snapshot_kind.sql`](../../supabase/migrations/20260522020000_home_snapshot_kind.sql)) — si no, el seed del snapshot clobbearía la cache de familia a `'shared'` y un soltero vería UI de familia.

## Cliente

- **`mobile/features/family/account-kind.ts`** — `type AccountKind`, `normalizeAccountKind`, `isSolo` (helpers puros, testeados en `tests/unit/account-kind.test.ts`).
- **`useFamily(userId)`** devuelve `{ familyId, kind }`.
- **`useIsSolo(userId): boolean`** — fuente única para ramificar UI; lee de la cache `['family', userId]` (sin fetch extra). Default `false` mientras carga (seguro: muestra UI de familia).
- **`useSetFamilyKind(userId)`** — mutation que llama `set_family_kind` e invalida la cache de familia.

## Dónde deriva la UI (qué cambia en modo solo)

| Pantalla | En modo solo |
|---|---|
| **Onboarding** (`step-family.tsx`) | Step 3 ofrece "Yo solo" / "Con mi familia o pareja". "Yo solo" → `bootstrap_family()` + `set_family_kind('solo')`, sin paso crear/unirse. Card de confirmación con copy neutral. |
| **Home** (`family-strip.tsx` / `home-dashboard.tsx` / `home-screen.tsx`) | `FamilyStrip` con `showMembers={!isSolo}`: oculta avatares y "Miembros · N", **conserva el PaydayPill** (confirmación de cobro). |
| **Settings** (`settings-screen.tsx`) | Oculta el grupo "Familia" (invitar/gestionar/salir). Hero "Tu cuenta personal" sin pill de dueño. Grupo "Hogar" → "Tu cuenta"; "Mi aporte mensual" → "Ingreso mensual". Config financiera intacta. |
| **family-admin** (`app/(app)/settings/family-admin.tsx`) | Redirige a `/settings` (un soltero no tiene gestión de miembros). |

## Cómo se elige

Solo se setea en el onboarding (elección explícita "Yo solo"). No hay UPDATE desde cliente fuera de eso. Familias existentes quedan `'shared'` (cero regresión).

## Conversión de tipo de cuenta

Cambiar el tipo desde Settings, en ambos sentidos (diseño aprobado — ver [spec-conversion-cuenta-v1.md](../auditorias/expansion-multisegmento-2026-05-22/spec-conversion-cuenta-v1.md)):

- **Soltero → Familia:** flip a `shared` vía `set_family_kind('shared')`; aparecen los settings de familia. No destructivo.
- **Familia (owner) → Soltero:** RPC `convert_family_to_solo()` — quita a los demás miembros (que vuelven a onboardear, con `onboarding_completed_at` reseteado), invalida invites pendientes y deja la familia en `kind='solo'`. Los gastos/config quedan con el owner. Destructivo → confirmación fuerte.
- **Miembro no-dueño → Soltero:** flujo existente "Salir del hogar" (`leave_current_family`) → re-onboarding → elige "Yo solo".

> Estado: especificado/planificado. Marcar como implementado al cerrar el plan correspondiente.

## Limitaciones (v1)

- Pymes/negocio: fase 2 (decisión de producto separada). Cuando se haga, `families.kind` evoluciona a `workspaces.type`.

## Referencias

- Spec: [spec-modo-soltero-v1.md](../auditorias/expansion-multisegmento-2026-05-22/spec-modo-soltero-v1.md)
- Plan: [plan-modo-soltero-v1.md](../auditorias/expansion-multisegmento-2026-05-22/plan-modo-soltero-v1.md)
