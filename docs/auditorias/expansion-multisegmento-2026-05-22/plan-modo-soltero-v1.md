# Modo Soltero (familia invisible) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un usuario "soltero" use Manifiesto sin ver conceptos de familia, modelándolo como una `familia` de 1 miembro con `families.kind = 'solo'`.

**Architecture:** Enfoque *lite*: el soltero es una familia marcada `kind='solo'`. El cliente deriva `isSolo` de la familia (vía React Query, sin fetch extra) y oculta/neutraliza la UI/copy de familia en onboarding, Home y Settings. `families.kind` es la costura forward-compatible hacia `workspaces.type` (pymes, fase 2). Sin abstracción `workspace` completa.

**Tech Stack:** Expo + React Native + TypeScript + Supabase (Postgres/RLS/RPC) + TanStack React Query v5 + Vitest.

**Spec:** [spec-modo-soltero-v1.md](spec-modo-soltero-v1.md)

**Convenciones del repo:**
- Tests: `tests/unit/*.test.ts`, se corren con `npm run test` (vitest run).
- Validación full: `npm run validate` (typecheck + lint + test + guards, incluido `guard:forbidden-copy`).
- Migraciones: fuente de verdad; deploy con `./node_modules/.bin/supabase db push --password "$(grep SUPABASE_DB_PASSWORD .env.supabase | cut -d= -f2)" --yes` (no hay Docker/psql local). `sql/supabase.sql` es baseline desincronizado (no es ruta de apply).
- Actualizar docs de `docs/` en el mismo commit (preferencia del owner).

---

## Task 1: DB — columna `families.kind` + RPC `set_family_kind`

**Files:**
- Create: `supabase/migrations/20260522010000_families_kind.sql`
- Modify: `sql/supabase.sql` (nota baseline)

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/20260522010000_families_kind.sql`:

```sql
-- Modo soltero (familia invisible): marca el tipo de espacio.
-- 'shared' = familia/pareja (comportamiento actual, default).
-- 'solo'   = un único usuario; la UI oculta conceptos de familia.
-- Forward-compatible con la futura abstracción workspaces.type (pymes).
-- Ver docs/auditorias/expansion-multisegmento-2026-05-22/spec-modo-soltero-v1.md

alter table public.families
  add column if not exists kind text not null default 'shared'
  check (kind in ('solo','shared'));

-- Setea el kind de la familia del caller. Solo el owner puede hacerlo.
-- Se usa en onboarding del modo solo: bootstrap_family() crea 'shared'
-- por default y luego esta RPC lo flipea a 'solo'. Evita recrear el
-- cuerpo (~100 líneas) de bootstrap_family.
create or replace function public.set_family_kind(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_kind text := case when p_kind in ('solo','shared') then p_kind else 'shared' end;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id
  limit 1;

  if v_family_id is null then
    raise exception 'No family for current user';
  end if;

  if not public.is_family_owner(v_family_id) then
    raise exception 'Only the family owner can set the family kind';
  end if;

  update public.families set kind = v_kind where id = v_family_id;
  return v_kind;
end;
$$;

revoke all on function public.set_family_kind(text) from public;
grant execute on function public.set_family_kind(text) to authenticated;
```

- [ ] **Step 2: Deploy de la migración**

Run:
```bash
./node_modules/.bin/supabase db push --password "$(grep SUPABASE_DB_PASSWORD .env.supabase | cut -d= -f2)" --yes
```
Expected: `Applying migration 20260522010000_families_kind.sql...` y `Finished supabase db push.` sin errores.

- [ ] **Step 3: Verificar columna + RPC en prod**

Run (instala `pg` en temp y consulta; `psql`/Docker no están disponibles):
```bash
mkdir -p /tmp/pgv && npm --prefix /tmp/pgv i pg >/dev/null 2>&1 && PGPW="$(grep SUPABASE_DB_PASSWORD .env.supabase | cut -d= -f2)" node -e '
import("pg").then(async ({default:pg})=>{
  const c=new pg.Client({host:"aws-1-us-east-1.pooler.supabase.com",port:5432,user:"postgres.xaquigyhylzvuyfslkqq",password:process.env.PGPW,database:"postgres",ssl:{rejectUnauthorized:false}});
  await c.connect();
  const col=await c.query("select column_name,data_type,column_default from information_schema.columns where table_name=\x27families\x27 and column_name=\x27kind\x27");
  const fn=await c.query("select proname from pg_proc where proname=\x27set_family_kind\x27");
  console.log("col:",col.rows); console.log("fn:",fn.rows);
  await c.end();
});' ; rm -rf /tmp/pgv
```
Expected: `col:` muestra `kind text 'shared'::text` y `fn:` muestra `set_family_kind`.

- [ ] **Step 4: Nota en el baseline sql**

En `sql/supabase.sql`, ubicar el bloque `create table ... families` (buscar `create table public.families` o `families(`) y agregar arriba del bloque un comentario:
```sql
-- NOTE: la columna families.kind ('solo'|'shared') y la RPC set_family_kind
-- viven en la migración 20260522010000_families_kind.sql (este baseline está
-- desincronizado; las migraciones son la ruta canónica de apply).
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260522010000_families_kind.sql sql/supabase.sql
git commit -m "feat(db): families.kind + set_family_kind RPC (modo soltero) · deploy a prod"
```

---

## Task 2: Cliente — helper `account-kind`, `useFamily` con kind, `useIsSolo`, `useSetFamilyKind`

**Files:**
- Create: `mobile/features/family/account-kind.ts`
- Create: `tests/unit/account-kind.test.ts`
- Create: `mobile/features/family/use-is-solo.ts`
- Modify: `mobile/features/family/use-family.ts:4-46`
- Modify: `mobile/features/family/use-family-actions.ts` (agregar mutation)

- [ ] **Step 1: Escribir el test del helper (falla primero)**

Create `tests/unit/account-kind.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isSolo, normalizeAccountKind, type AccountKind } from '@/features/family/account-kind'

describe('account-kind', () => {
  it('isSolo true solo para "solo"', () => {
    expect(isSolo('solo')).toBe(true)
    expect(isSolo('shared')).toBe(false)
    expect(isSolo(null)).toBe(false)
    expect(isSolo(undefined)).toBe(false)
  })

  it('normalizeAccountKind clampa valores inválidos a "shared"', () => {
    expect(normalizeAccountKind('solo')).toBe('solo')
    expect(normalizeAccountKind('shared')).toBe('shared')
    expect(normalizeAccountKind('garbage' as AccountKind)).toBe('shared')
    expect(normalizeAccountKind(null)).toBe('shared')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -- account-kind`
Expected: FAIL — `Cannot find module '@/features/family/account-kind'`.

- [ ] **Step 3: Escribir el helper**

Create `mobile/features/family/account-kind.ts`:

```ts
export type AccountKind = 'solo' | 'shared'

/** Clampa cualquier valor (DB, string suelto, null) a un AccountKind válido. */
export function normalizeAccountKind(value: string | null | undefined): AccountKind {
  return value === 'solo' ? 'solo' : 'shared'
}

/** True solo cuando el espacio es de un único usuario. */
export function isSolo(value: string | null | undefined): boolean {
  return value === 'solo'
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -- account-kind`
Expected: PASS (2 tests).

- [ ] **Step 5: Extender `useFamily` para devolver `kind`**

En `mobile/features/family/use-family.ts`:

Reemplazar el `interface FamilyInfo` (líneas 4-6):
```ts
import type { AccountKind } from '@/features/family/account-kind'
import { normalizeAccountKind } from '@/features/family/account-kind'

export interface FamilyInfo {
  familyId: string
  kind: AccountKind
}
```

Reemplazar el `select` y el return del `queryFn` (líneas 27-43):
```ts
      const membershipResponse = await supabase
        .from('family_members')
        .select('family_id, families(kind)')
        .eq('user_id', userId)
        .maybeSingle()

      if (membershipResponse.error) {
        throw membershipResponse.error
      }

      if (!membershipResponse.data) {
        return null
      }

      const familyRel = membershipResponse.data.families as { kind: string } | { kind: string }[] | null
      const kindRaw = Array.isArray(familyRel) ? familyRel[0]?.kind : familyRel?.kind

      return {
        familyId: membershipResponse.data.family_id as string,
        kind: normalizeAccountKind(kindRaw),
      }
```

- [ ] **Step 6: Crear `useIsSolo`**

Create `mobile/features/family/use-is-solo.ts`:

```ts
import { useFamily } from '@/features/family/use-family'
import { isSolo } from '@/features/family/account-kind'

/**
 * Deriva si el espacio del usuario es "solo" (familia invisible de 1).
 * Lee de la misma cache que useFamily (['family', userId]) — sin fetch extra.
 * Mientras la familia carga devuelve false (default seguro = mostrar UI de familia).
 */
export function useIsSolo(userId?: string): boolean {
  const familyQuery = useFamily(userId)
  return isSolo(familyQuery.data?.kind)
}
```

- [ ] **Step 7: Agregar la mutation `useSetFamilyKind`**

En `mobile/features/family/use-family-actions.ts`, agregar al final del archivo (después de `useLeaveCurrentFamily`):

```ts
import type { AccountKind } from '@/features/family/account-kind'

/** Setea families.kind ('solo'|'shared') para la familia del caller
 *  (owner-only en el backend). Usado por el onboarding del modo solo
 *  justo después de bootstrap_family(). Invalida la cache de familia. */
export function useSetFamilyKind(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (kind: AccountKind) => {
      const { data, error } = await supabase.rpc('set_family_kind', { p_kind: kind })
      if (error) throw error
      return (typeof data === 'string' ? data : kind) as AccountKind
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) })
    },
  })
}
```

- [ ] **Step 8: Typecheck + test**

Run: `npm run typecheck && npm run test -- account-kind`
Expected: typecheck PASS; test PASS.

- [ ] **Step 9: Commit**

```bash
git add mobile/features/family/account-kind.ts tests/unit/account-kind.test.ts mobile/features/family/use-is-solo.ts mobile/features/family/use-family.ts mobile/features/family/use-family-actions.ts
git commit -m "feat(family): kind en useFamily + useIsSolo + useSetFamilyKind"
```

---

## Task 3: Onboarding state — `accountKind` en el draft

**Files:**
- Modify: `mobile/features/onboarding/use-onboarding-state.ts`

- [ ] **Step 1: Agregar el campo al draft y la acción**

En `mobile/features/onboarding/use-onboarding-state.ts`:

Importar el tipo arriba:
```ts
import type { AccountKind } from '@/features/family/account-kind'
```

Agregar al `interface OnboardingDraft` (después de `familyMode`, línea 13):
```ts
  /** 'solo' cuando el usuario eligió "Yo solo" en el step 3 (familia
   *  invisible de 1). 'shared' para el flujo familia/pareja. Maneja
   *  el copy del onboarding; la UI interior deriva de families.kind. */
  accountKind: AccountKind
```

Agregar a la unión `Action` (después de la línea de `setFamily`):
```ts
  | { type: 'setAccountKind'; value: AccountKind }
```

En `createInitialDraft()` agregar (después de `familyMode: 'none',`):
```ts
    accountKind: 'shared',
```

En el `reducer`, agregar el case (después del case `'setFamily'`):
```ts
    case 'setAccountKind':
      return { ...state, accountKind: action.value }
```

En `actions` (dentro del `useMemo`), agregar:
```ts
      setAccountKind: (value: AccountKind) =>
        dispatch({ type: 'setAccountKind', value }),
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/features/onboarding/use-onboarding-state.ts
git commit -m "feat(onboarding): accountKind en el draft del wizard"
```

---

## Task 4: Onboarding step-family — elección Solo / Familia

**Files:**
- Modify: `mobile/components/home/onboarding/step-family.tsx`

Hoy `StepFamily` tiene paneles `'root' | 'create' | 'join'`. El panel `'root'` ofrece directamente "Crear nueva" / "Unirme con código". Lo anteponemos con una elección de modo: **Yo solo** / **Con mi familia o pareja**. Si elige solo: bootstrap + `set_family_kind('solo')` y avanza. Si elige familia: muestra el root actual (crear/unirse).

- [ ] **Step 1: Ampliar props y panel**

En `step-family.tsx`, agregar imports:
```ts
import { useBootstrapFamily, usePeekFamilyInvite, useSetFamilyKind, type FamilyPeek } from '@/features/family/use-family-actions'
import type { AccountKind } from '@/features/family/account-kind'
```
(reemplaza el import existente de `use-family-actions`).

En `interface StepFamilyProps` agregar:
```ts
  /** Fija el accountKind en el draft del onboarding (para copy). */
  onAccountKind: (kind: AccountKind) => void
```

Cambiar el tipo `Panel`:
```ts
type Panel = 'mode' | 'root' | 'create' | 'join'
```

- [ ] **Step 2: Estado inicial del panel + mutation**

Dentro del componente, reemplazar la inicialización de `panel` (líneas 50-52) por:
```ts
  const setKind = useSetFamilyKind(userId)
  const [panel, setPanel] = useState<Panel>(() =>
    familyMode === 'created' ? 'create' : familyMode === 'joined' ? 'join' : 'mode',
  )
```

Actualizar `busy`:
```ts
  const busy = bootstrap.isPending || peek.isPending || setKind.isPending
```

- [ ] **Step 3: Handler del modo solo**

Agregar (después de `handleCreate`):
```ts
  const handleSolo = async () => {
    void triggerHaptic('selection')
    try {
      const result = await bootstrap.mutateAsync()
      await setKind.mutateAsync('solo')
      onAccountKind('solo')
      void triggerHaptic('success')
      onFamilyReady('created', result.family_id)
      setPanel('create')
    } catch (error) {
      void triggerHaptic('error')
      Alert.alert('No pudimos crear tu cuenta', getErrorMessage(error, errorMessages.server))
    }
  }
```

En `handleCreate`, fijar el kind compartido — agregar al inicio del `try` (antes de `bootstrap.mutateAsync`): nada extra (default 'shared'); pero setear el draft, agregar después de `onFamilyReady('created', result.family_id)`:
```ts
      onAccountKind('shared')
```

- [ ] **Step 4: Render del panel `mode`**

En el bloque de render, agregar una rama nueva ANTES de `panel === 'root'`. Insertar entre el cierre del bloque `alreadyDone` y `panel === 'root'` (es decir, cambiar `) : panel === 'root' ? (` para que primero evalúe `mode`). Reemplazar la línea `) : panel === 'root' ? (` por:

```tsx
      ) : panel === 'mode' ? (
        <Animated.View
          key="mode"
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(140)}
          layout={LinearTransition.duration(240)}
          style={styles.optionStack}
        >
          <Pressable
            onPress={() => void handleSolo()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Usar la app yo solo"
            style={[styles.optionCard, { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line }]}
          >
            <Text style={styles.optionEmoji}>👤</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Yo solo</Text>
              <Text style={[styles.optionMeta, { color: theme.colors.textMuted }]}>
                Gestiono mi plata solo.
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={theme.colors.textMuted} />
          </Pressable>

          <Pressable
            onPress={() => setPanel('root')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Usar la app con mi familia o pareja"
            style={[styles.optionCard, { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line }]}
          >
            <Text style={styles.optionEmoji}>👨‍👩‍👧</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Con mi familia o pareja</Text>
              <Text style={[styles.optionMeta, { color: theme.colors.textMuted }]}>
                Compartimos los gastos.
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={theme.colors.textMuted} />
          </Pressable>
        </Animated.View>
      ) : panel === 'root' ? (
```

- [ ] **Step 5: "Volver" desde root al selector de modo**

En el panel `'join'`, el botón "Volver" hoy hace `setPanel('root')`. Dejar igual. En el panel `'root'`, no hay botón volver; agregar uno para volver a `'mode'`. Agregar al final del `optionStack` del panel `root` (después del segundo `Pressable`, antes de cerrar el `Animated.View`):
```tsx
          <Pressable
            onPress={() => setPanel('mode')}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            style={[styles.ghostButton, { borderColor: theme.colors.line }]}
          >
            <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>Volver</Text>
          </Pressable>
```

- [ ] **Step 6: Título/subcopy del header del step**

Reemplazar el bloque del título (líneas 93-100) por copy que cubra ambos modos:
```tsx
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {panel === 'mode' ? 'Empecemos' : 'Familia'}
        </Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          {panel === 'mode'
            ? '¿Cómo vas a usar Manifiesto?'
            : closedByOwner
              ? 'Tu hogar anterior fue cerrado. Armemos uno propio o súmate a otro con su código.'
              : isRejoin
                ? 'Puedes empezar un hogar nuevo o sumarte a otro con su código.'
                : 'Empieza una familia o súmate a una existente.'}
        </Text>
```

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS (puede requerir que el caller pase `onAccountKind` — se conecta en Task 5; si typecheck falla por prop faltante, completar Task 5 antes de re-correr).

- [ ] **Step 8: Commit**

```bash
git add mobile/components/home/onboarding/step-family.tsx
git commit -m "feat(onboarding): step 3 con elección Solo/Familia (auto-bootstrap solo)"
```

---

## Task 5: Onboarding screen — pasar `onAccountKind` y copy de pasos

**Files:**
- Modify: `mobile/screens/home/onboarding-screen.tsx:658-669` (renderStep → StepFamily)

- [ ] **Step 1: Pasar el setter de accountKind a StepFamily**

En `renderStep`, en el `case 3` (StepFamily, líneas 660-668), agregar la prop:
```tsx
        <StepFamily
          userId={ctx.userId}
          familyMode={state.familyMode}
          familyId={state.familyId}
          onFamilyReady={actions.setFamily}
          onJoinPeek={actions.setPendingFamily}
          onAccountKind={actions.setAccountKind}
          isRejoin={ctx.isRejoin}
          closedByOwner={ctx.closedByOwner}
        />
```

(`canContinue` step 3 ya funciona para solo: el path solo deja `familyMode='created'` + `familyId` seteado, igual que el creador — ver líneas 164-168. Steps 4/5 del solo reusan el path creador StepIncome/StepSavings, ver líneas 685-694 y 710-726. No requieren cambios.)

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/screens/home/onboarding-screen.tsx
git commit -m "feat(onboarding): conectar accountKind al step de familia"
```

---

## Task 6: Home — ocultar avatares de miembros en modo solo (conservando payday)

**Files:**
- Modify: `mobile/components/home/family-strip.tsx:17-67`
- Modify: `mobile/components/home/home-dashboard.tsx:590-595`

- [ ] **Step 1: Prop `showMembers` en FamilyStrip**

En `family-strip.tsx`, agregar a `FamilyStripProps` (después de `members`):
```ts
  /** Cuando es false (modo solo), oculta avatares y "Miembros · N"
   *  pero conserva el PaydayPill. Default true. */
  showMembers?: boolean
```

En la firma del componente, desestructurar con default:
```ts
export const FamilyStrip = memo(function FamilyStrip({ members, daysUntilPayday, paydayPending, onPaydayPress, showMembers = true }: FamilyStripProps) {
```

Envolver el bloque de avatares + label en el condicional. Reemplazar el `<View style={styles.avatars} ...>...</View>` y el `<Text style={styles.familyLabel}>...` (líneas 33-64) por:
```tsx
        {showMembers ? (
          <>
            <View
              style={styles.avatars}
              accessible
              accessibilityLabel={`Miembros del hogar: ${members.length === 0 ? 'ninguno' : members.map((m) => m.name).join(', ')}.`}
            >
              {visible.map((m, i) => (
                <View key={m.id} style={[styles.avatarSlot, i > 0 && { marginLeft: -8 }]}>
                  {m.avatarSlug ? (
                    <AvatarAnimal slug={m.avatarSlug} size={26} ringColor={theme.colors.ringBg} />
                  ) : (
                    <Avatar name={m.name} color={m.color} size={26} ringColor={theme.colors.ringBg} />
                  )}
                </View>
              ))}
              {overflow > 0 ? (
                <View style={[styles.overflow, { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.ringBg }]}>
                  <Text style={[styles.overflowText, { color: theme.colors.text }]}>+{overflow}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.familyLabel, { color: theme.colors.textMuted }]}>
              Miembros · <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{members.length}</Text>
            </Text>
          </>
        ) : null}
```
(El `<View style={styles.spacer} />` y el `<PaydayPillV2 .../>` quedan como están — el spacer empuja el pill a la derecha; en solo, sin avatares, el pill queda alineado con el spacer ocupando el espacio.)

- [ ] **Step 2: Pasar `showMembers={!isSolo}` en home-dashboard**

En `home-dashboard.tsx`, agregar el import (junto a los otros de family, cerca de la línea 47):
```ts
import { useIsSolo } from '@/features/family/use-is-solo'
```

Dentro del componente, cerca de `const membersQuery = useFamilyMembers(familyId)` (línea 165), agregar — necesitamos el `userId`. Verificar que el componente recibe `userId` en props; si no, derivar de la sesión. Buscar cómo otros hooks acceden al userId en este archivo (grep `userId` en home-dashboard). Agregar:
```ts
  const isSolo = useIsSolo(userId)
```
(Si `userId` no está disponible como prop/var en `home-dashboard.tsx`, obtenerlo del provider de sesión usado en el resto de la app — ver `mobile/components/guards.tsx` que ya expone `userId`; pasar `userId` como prop desde el caller de `HomeDashboard` siguiendo el mismo patrón que `familyId`.)

En el JSX (línea 590), pasar la prop:
```tsx
        <FamilyStrip
          members={familyMembers}
          showMembers={!isSolo}
          daysUntilPayday={days}
          paydayPending={pending}
          onPaydayPress={handleChipConfirmTracked}
        />
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/home/family-strip.tsx mobile/components/home/home-dashboard.tsx
git commit -m "feat(home): ocultar avatares de miembros en modo solo (conserva payday)"
```

---

## Task 7: Settings — ocultar secciones de familia en modo solo

**Files:**
- Modify: `mobile/screens/settings/settings-screen.tsx`

- [ ] **Step 1: Derivar isSolo**

En `settings-screen.tsx`, agregar import:
```ts
import { useIsSolo } from '@/features/family/use-is-solo'
```
Dentro de `SettingsScreen`, cerca de `const roleQuery = useMyFamilyRole(userId, familyId)` (línea 108), agregar:
```ts
  const isSolo = useIsSolo(userId)
```

- [ ] **Step 2: Header — ocultar pill de dueño y ajustar subtítulo en solo**

Reemplazar el subtítulo del hero (líneas 704-708):
```tsx
                <Text style={[styles.heroSub, { color: theme.colors.textMuted }]}>
                  {isSolo
                    ? 'Tu cuenta personal'
                    : totalMembers === 1
                      ? 'Hogar individual'
                      : `Hogar de ${totalMembers} personas`}
                </Text>
```
Reemplazar la condición del pill de dueño (línea 709) `{isOwner ? (` por `{isOwner && !isSolo ? (`.

- [ ] **Step 3: Grupo "Hogar" — relabel en solo**

En el `SettingsGroup title="Hogar"` (línea 770), hacer el título condicional:
```tsx
                title={isSolo ? 'Tu cuenta' : 'Hogar'}
```
Relabel "Mi aporte mensual" (línea 775):
```tsx
                  label={isSolo ? 'Ingreso mensual' : 'Mi aporte mensual'}
```

- [ ] **Step 4: Ocultar el grupo "Familia" en solo**

Envolver el bloque `{/* 4. FAMILIA */}` completo (`<RiseView delay={320}>...</RiseView>`, líneas 830-857+) en un condicional. Cambiar la apertura:
```tsx
            {/* 4. FAMILIA */}
            {!isSolo ? (
            <RiseView delay={320}>
```
y cerrar después del `</RiseView>` correspondiente del grupo Familia:
```tsx
            </RiseView>
            ) : null}
```
(Verificar el balance del JSX: el `</RiseView>` que cierra el grupo Familia es el que está justo antes del siguiente `{/* ... */}` o grupo. Ubicar el cierre exacto leyendo el rango 830-870 antes de editar.)

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/screens/settings/settings-screen.tsx
git commit -m "feat(settings): ocultar invitar/gestionar familia y relabel en modo solo"
```

---

## Task 8: Ruta family-admin — redirigir en modo solo

**Files:**
- Modify: `app/(app)/settings/family-admin.tsx:12-25`

- [ ] **Step 1: Bloquear acceso en solo**

En `family-admin.tsx`, agregar import:
```ts
import { useIsSolo } from '@/features/family/use-is-solo'
```
En `OwnerGuarded`, agregar al inicio (antes de `if (roleQuery.isLoading)`):
```ts
  const isSolo = useIsSolo(userId)
  if (isSolo) {
    return <Redirect href="/(app)/settings" />
  }
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/settings/family-admin.tsx"
git commit -m "feat(settings): redirigir family-admin a settings en modo solo"
```

---

## Task 9: Validación full + QA manual

- [ ] **Step 1: Validación completa**

Run: `npm run validate`
Expected: typecheck + lint + 55 tests (54 + account-kind) + guards PASS. Si `guard:forbidden-copy` falla por alguna palabra del copy nuevo, ajustar el copy según el glosario (`tests/unit/copy-glossary.test.ts` y el guard).

- [ ] **Step 2: QA manual (checklist)**

Levantar la app (`/run` o `npx expo start`) y verificar:
- [ ] Signup nuevo → onboarding step 3 muestra "Yo solo" / "Con mi familia o pareja".
- [ ] "Yo solo" → no muestra crear/unirse; avanza a ingreso → ahorro → Home. Carga un gasto OK.
- [ ] Home en solo: sin avatares ni "Miembros · N"; el pill de cobro (payday) sigue visible y funcional.
- [ ] Settings en solo: sin grupo "Familia" (invitar/gestionar); "Tu cuenta" + "Ingreso mensual"; sin pill "Sos el dueño".
- [ ] `/settings/family-admin` en solo → redirige a settings.
- [ ] "Con mi familia o pareja" → flujo crear/unirse intacto; usuario shared ve todo como antes (regresión cero).

- [ ] **Step 3: Verificar kind en prod tras un signup solo de prueba** (opcional)

Reusar el snippet de Task 1 Step 3 cambiando la query a:
`select id, kind from families order by created_at desc limit 3` → confirmar que el signup solo de prueba quedó `kind='solo'` y los previos `'shared'`.

---

## Task 10: Docs — sync

**Files:**
- Modify: `docs/auditorias/expansion-multisegmento-2026-05-22/README.md`
- Modify: `docs/producto/flujos-y-funcionamiento.md`
- Create: `docs/sistemas/account-kinds.md`
- Modify: `docs/ESTADO-DEL-PROYECTO/...` (nota o nuevo snapshot)

- [ ] **Step 1: Doc del sistema**

Create `docs/sistemas/account-kinds.md` documentando: qué es `families.kind` ('solo'|'shared'), la RPC `set_family_kind`, cómo deriva la UI vía `useIsSolo`, qué se oculta en cada pantalla, y la limitación de v1 (sin conversión solo→compartido).

- [ ] **Step 2: Actualizar flujos y auditoría**

En `docs/producto/flujos-y-funcionamiento.md`: agregar el journey del solo (onboarding sin paso familia). En `docs/auditorias/expansion-multisegmento-2026-05-22/README.md` (§8 roadmap): marcar **Fase 1 — Solteros** como en progreso/hecha, con link a este plan y al spec.

- [ ] **Step 3: Estado del proyecto**

En `docs/ESTADO-DEL-PROYECTO/`: agregar nota en el snapshot vigente (o nuevo snapshot fechado `YYYY-MM-DD-modo-soltero/`) reflejando el modo solo en auth/onboarding + home + settings + DB.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: documentar modo soltero (account-kinds) + sync estado/flujos/auditoría"
```

---

## Self-review (cobertura del spec)

- §2 Modelo de datos → Task 1 ✅ (columna + set_family_kind, deploy + verificación).
- §3 Estado cliente → Task 2 ✅ (useFamily.kind, useIsSolo, account-kind helper).
- §4 Onboarding → Tasks 3-5 ✅ (accountKind, step Solo/Familia, wiring).
- §5 AppEntryGate → sin cambios (confirmado en spec) ✅.
- §6 Home → Task 6 ✅ (showMembers, payday conservado).
- §7 Settings → Task 7 ✅ (ocultar familia, relabel) + Task 8 (family-admin) ✅.
- §8 Copy → cubierto inline en Tasks 4/7 (copy condicional). El helper `account-kind.ts` (Task 2) centraliza la lógica `isSolo`; los strings puntuales viven en sus componentes (no se justifica un mapa separado para ~6 strings reales). **Desviación consciente del spec §8** (YAGNI): no se crea `mobile/lib/copy/account-kind.ts`.
- §9 Testing → Task 2 (unit) + Task 9 (validate + QA) ✅.
- §12 Docs → Task 10 ✅.

**Nota de granularidad:** los cambios de UI (Tasks 4-8) se verifican con typecheck/lint + QA manual en vez de tests de render (el repo no tiene harness de render RN; los tests son de modelos/lógica pura). El helper puro (Task 2) sí va con TDD.
