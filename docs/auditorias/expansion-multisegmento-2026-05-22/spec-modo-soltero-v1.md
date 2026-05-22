# Spec — Modo Soltero (familia invisible) · v1

> 🗓️ **2026-05-22** · Diseño aprobado (brainstorming) para el primer slice de la [expansión multi-segmento](README.md): habilitar que un **soltero/individuo** use Manifiesto sin ver conceptos de "familia".
>
> **Enfoque:** *lite* — un soltero es una `familia` de 1 miembro marcada con `kind = 'solo'`. Reutiliza casi todo el producto; la UI/copy de familia se oculta/neutraliza condicionalmente. No introduce la abstracción `workspace` completa (eso queda para pymes, fase 2), pero `families.kind` es la costura forward-compatible (`families.kind` → futuro `workspaces.type`).

---

## 1. Objetivo y criterios de éxito

**Objetivo:** un usuario nuevo que elige "Yo solo" completa el onboarding sin el paso de crear/unirse a familia y usa Home, Gastos, Fijos, Control y Settings sin ver lenguaje ni UI de "familia/hogar/miembros".

**Criterios de éxito (medibles en QA):**
- Signup → primer gasto del solo sin pasar por crear/unirse a familia.
- Un usuario `kind = 'shared'` existente queda **idéntico** (cero regresión).
- La confirmación de cobro (payday) sigue funcionando en modo solo.
- No aparece en modo solo: avatares de miembros, "Miembros · N", invitar, gestionar familia, "Mi aporte mensual", "Sos el dueño de la familia".

**Decisiones tomadas (brainstorming):**
- Alcance: **experiencia solo completa** (onboarding + Home + Settings + copy). Conversión solo→compartido **fuera de v1**.
- Segmentos visibles ahora: **Solo + Familia** (Negocio/pyme no se muestra).
- Marca de tipo: **Enfoque A — `families.kind`** (`'solo' | 'shared'`, default `'shared'`).

---

## 2. Modelo de datos

**Migración aditiva** (`supabase/migrations/20260522010000_families_kind_and_bootstrap.sql`):
```sql
alter table public.families
  add column if not exists kind text not null default 'shared'
  check (kind in ('solo','shared'));
```
- Familias existentes → `'shared'` por default (sin cambio de comportamiento).
- **RLS:** sin policies nuevas. `kind` se lee con las policies de select de familia ya existentes. No hay UPDATE desde cliente en v1.

**RPC `bootstrap_family`** (en migración nueva, `create or replace`):
- Agregar parámetro opcional `p_kind text default 'shared'` con `check`/clamp a `('solo','shared')`.
- Insertar `families.kind = p_kind`.
- Firma retro-compatible: los callers actuales (sin el param) siguen creando `'shared'`.
- Revisar la firma real actual antes de editar (`sql/supabase.sql` + migración donde se define) para no romper grants ni el `security definer`.

---

## 3. Estado en el cliente

- **`useFamily(userId)`** ([mobile/features/family/use-family.ts:15-46](../../../mobile/features/family/use-family.ts#L15-L46)): extender el select para traer el `kind` de la familia (embedded select `families(kind)` o segundo campo). Retorno pasa de `{ familyId }` a `{ familyId, kind }`. **Compat:** los consumidores actuales de `familyId` no cambian.
- **`useIsSolo(userId)`** (hook nuevo, `mobile/features/family/use-is-solo.ts`): lee de la cache `['family', userId]` y devuelve `boolean`. Sin fetch extra. Es la fuente única para ramificar UI.
- **`FamilyInfo`** type ([use-family.ts:4-6](../../../mobile/features/family/use-family.ts#L4-L6)): agregar `kind: 'solo' | 'shared'`.

---

## 4. Onboarding

Pasos actuales ([onboarding-screen.tsx:61-729](../../../mobile/screens/home/onboarding-screen.tsx#L61-L729), [use-onboarding-state.ts:6-169](../../../mobile/features/onboarding/use-onboarding-state.ts#L6-L169)):
1 Nombre · 2 Avatar · 3 Familia (crear/unirse) · 4 Ingreso (creator) / Aporte (joiner) · 5 Ahorro (creator) / Resumen (joiner).

**Cambios:**
- **`use-onboarding-state.ts`:** agregar `accountKind: 'solo' | 'shared'` al `OnboardingDraft` y acción para setearlo. `ONBOARDING_TOTAL_STEPS` se mantiene en 5.
- **Step 3 → "Modo + Familia"** ([step-family.tsx](../../../mobile/components/home/onboarding/step-family.tsx)):
  - Panel raíz nuevo: "¿Cómo vas a usar Manifiesto?" → **Yo solo** / **Con mi familia o pareja**.
  - **Yo solo:** `bootstrap_family(p_kind:'solo')` en background (reusar [use-family-actions.ts:24-50](../../../mobile/features/family/use-family-actions.ts#L24-L50), agregando el param), set `accountKind='solo'`, `familyMode='created'`, avanza. Sin panel crear/unirse.
  - **Con mi familia:** muestra el panel crear/unirse actual; `bootstrap_family` con `p_kind:'shared'` (o default).
- **Step 4/5:** el path solo reutiliza `StepIncome` + `StepSavings` (path "creator") con copy neutral. El solo nunca ve `StepIncomeContribution` ni `StepFamilySummary`.
- **`canContinue`** ([onboarding-screen.tsx:149-195](../../../mobile/screens/home/onboarding-screen.tsx#L149-L195)): step 3 en modo solo requiere bootstrap completado.
- `useCompleteOnboarding` ([use-complete-onboarding.ts:10-34](../../../mobile/features/onboarding/use-complete-onboarding.ts#L10-L34)): sin cambios.

---

## 5. AppEntryGate

**Sin cambios.** El solo tiene familia auto-creada → pasa el check de familia → Home. Lógica intacta en [app-entry-gate.tsx:100-106](../../../mobile/components/root/app-entry-gate.tsx#L100-L106).

---

## 6. Home

- **`FamilyStrip`** ([family-strip.tsx:26-70](../../../mobile/components/home/family-strip.tsx#L26-L70)) mezcla avatares + `PaydayPillV2`. Agregar prop `showMembers?: boolean` (default `true`): cuando `false`, ocultar el bloque de avatares y "Miembros · N", **conservando** `PaydayPillV2` (alineado a la izquierda o full-width).
- **`home-dashboard.tsx`** ([~L590](../../../mobile/components/home/home-dashboard.tsx#L590)): pasar `showMembers={!isSolo}`.
- Copy de Home con "hogar/familia" → variante neutral con `isSolo` (ver §8).

---

## 7. Settings

- **Ocultar si `isSolo`** ([settings-screen.tsx](../../../mobile/screens/settings/settings-screen.tsx)): row "Mi aporte mensual" (~L775), invitar (`ShareInviteSheet`), entrada a "Gestionar familia", header "Sos el dueño de la familia" (~L727).
- **Ruta `/settings/family-admin`** ([app/(app)/settings/family-admin.tsx:12-22](../../../app/(app)/settings/family-admin.tsx#L12-L22)): el guard hoy redirige a no-owners; agregar check `isSolo` → redirigir a `/settings`.
- **Conservar** config financiera (ingreso, día de cobro, ahorro %, buffer, USD) vía `useUpsertFamilyFinance` — son parámetros personales. Relabel "Preferencias del hogar" → neutral.

---

## 8. Copy

- No hay framework i18n. Centralizar las strings dependientes del modo en `mobile/lib/copy/account-kind.ts` (mapa por `kind`). Componentes leen `isSolo ? copy.solo : copy.shared`.
- **Tono solo:** personal/neutral ("tu plata", "tu mes", "tu cuenta"), sin "familia/nuestro/hogar".
- Inventario inicial (~15-20 keys) a confirmar durante implementación: saludo/contexto Home, títulos de secciones Settings, labels de onboarding step 3, accesibilidad del strip.

---

## 9. Testing

- **Unit (Vitest, client-side):** path solo en `use-onboarding-state`; pureza de `useIsSolo`/derivación; función pura `shouldShowFamilyUI(kind)`.
- **Migración:** verificar al deployar (consulta a `pg_policies`/columna como se hizo con el fix RLS) — sin Docker local, usar `./node_modules/.bin/supabase db push` con `.env.supabase`.
- **QA manual:** signup solo end-to-end; usuario `'shared'` existente idéntico; payday confirm en solo; Settings sin secciones de familia; family-admin redirige.

---

## 10. Fuera de alcance (v1)

Conversión solo→compartido (invitar después), pymes/negocio, monetización, abstracción `workspace` completa.

---

## 11. Limitaciones conocidas

- Un solo no puede invitar a nadie en v1 (conversión = fast-follow). Mitigación: la elección en onboarding es explícita.

---

## 12. Docs a actualizar (mismo commit — [[feedback_keep_docs_in_sync]])

- Nuevo snapshot fechado en `docs/ESTADO-DEL-PROYECTO/` (o nota en el vigente) reflejando el modo solo en auth/onboarding + home + settings.
- `docs/producto/flujos-y-funcionamiento.md`: journey del solo.
- `docs/auditorias/expansion-multisegmento-2026-05-22/README.md`: marcar Fase 1 (solteros) en progreso/hecha.
- Opcional: doc nuevo `docs/sistemas/account-kinds.md` (qué es `families.kind`, cómo deriva la UI).

---

## 13. Archivos afectados (resumen)

| Capa | Archivo | Cambio |
|---|---|---|
| DB | `supabase/migrations/20260522010000_families_kind_and_bootstrap.sql` (nuevo) | columna `kind` + `bootstrap_family(p_kind)` |
| DB | `sql/supabase.sql` | nota baseline (no es ruta de apply) |
| Cliente | `mobile/features/family/use-family.ts` | retornar `kind` |
| Cliente | `mobile/features/family/use-is-solo.ts` (nuevo) | hook derivado |
| Cliente | `mobile/features/family/use-family-actions.ts` | `bootstrap_family` con `p_kind` |
| Cliente | `mobile/features/onboarding/use-onboarding-state.ts` | `accountKind` en draft |
| Cliente | `mobile/components/home/onboarding/step-family.tsx` | panel modo Solo/Familia |
| Cliente | `mobile/screens/home/onboarding-screen.tsx` | `canContinue` + branch solo |
| Cliente | `mobile/components/home/family-strip.tsx` | prop `showMembers` |
| Cliente | `mobile/components/home/home-dashboard.tsx` | `showMembers={!isSolo}` |
| Cliente | `mobile/screens/settings/settings-screen.tsx` | ocultar secciones familia si solo |
| Cliente | `app/(app)/settings/family-admin.tsx` | redirigir si solo |
| Cliente | `mobile/lib/copy/account-kind.ts` (nuevo) | copy por modo |
| Tests | `*.test.ts` | onboarding solo, derivación, render condicional |
| Docs | ver §12 | sync |

<!-- Spec aprobado en brainstorming 2026-05-22; pendiente review del owner antes de writing-plans -->
