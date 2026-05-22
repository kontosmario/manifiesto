# Conversión de tipo de cuenta (Familia ↔ Soltero) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Permitir cambiar el tipo de cuenta desde Settings — owner: Familia→Soltero (destructivo); Soltero→Familia (no destructivo) — reutilizando el flujo existente de "Salir del hogar" para el caso miembro→soltero.

**Architecture:** RPC nueva `convert_family_to_solo()` (owner-only, atómica) que quita a los demás miembros (reseteando su onboarding), invalida invites y deja la familia en `kind='solo'`; el trigger `recompute_family_income()` ajusta el ingreso. El upgrade reusa `set_family_kind('shared')`. La UI de Settings deriva de `isSolo`/`isOwner`.

**Tech Stack:** Expo + React Native + TypeScript + Supabase (Postgres/RPC) + React Query v5 + Vitest.

**Spec:** [spec-conversion-cuenta-v1.md](spec-conversion-cuenta-v1.md)

**Convenciones:** tests `tests/unit/*.test.ts` (`npm run test`); deploy de migración `./node_modules/.bin/supabase db push --password "$(grep SUPABASE_DB_PASSWORD .env.supabase | cut -d= -f2)" --yes` (sin Docker/psql local); actualizar `docs/` en el mismo commit. Branch actual: `feat/modo-soltero-v1` (la conversión se construye sobre el modo soltero).

> **Nota pre-existente (no romper, no arreglar acá):** `npm run validate` ya falla por deuda pre-existente (`guard:motion-tokens` en `fijos-proximos-card`/`cycle-wrapped-modal`/`achievements-gallery-screen`; 3 suites de test rotas: `copy-glossary`, `skeleton-layouts`, `use-unbounded-loop-animation`). Verificar con typecheck + lint + guard:forbidden-copy + el test propio, NO con `validate` completo.

---

## Task 1: DB — RPC `convert_family_to_solo`

**Files:**
- Create: `supabase/migrations/20260522030000_convert_family_to_solo.sql`

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/20260522030000_convert_family_to_solo.sql`:

```sql
-- Conversión Familia → Soltero (owner-only).
-- Quita a los demás miembros (reseteando su onboarding para que vuelvan a
-- configurar su cuenta), invalida invites pendientes y deja la familia en
-- kind='solo'. El trigger recompute_family_income() ajusta family_finance.
-- Ver docs/auditorias/expansion-multisegmento-2026-05-22/spec-conversion-cuenta-v1.md

create or replace function public.convert_family_to_solo()
returns table (family_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id and fm.role = 'owner';

  if v_family_id is null then
    raise exception 'Solo el dueño puede pasar la cuenta a individual.';
  end if;

  -- Los demás miembros vuelven a onboardear. previously_onboarded queda
  -- intacto (true) para el copy de reingreso.
  update public.profiles p
  set onboarding_completed_at = null
  where p.id in (
    select fm.user_id from public.family_members fm
    where fm.family_id = v_family_id and fm.user_id <> v_user_id
  );

  delete from public.push_subscriptions ps
  where ps.family_id = v_family_id and ps.user_id <> v_user_id;

  delete from public.family_members fm
  where fm.family_id = v_family_id and fm.user_id <> v_user_id;

  delete from public.family_invites fi
  where fi.family_id = v_family_id and fi.consumed_at is null;

  update public.families set kind = 'solo' where id = v_family_id;

  family_id := v_family_id;
  return next;
end;
$$;

revoke all on function public.convert_family_to_solo() from public;
grant execute on function public.convert_family_to_solo() to authenticated;
```

- [ ] **Step 2: Deploy**

Run: `./node_modules/.bin/supabase db push --password "$(grep SUPABASE_DB_PASSWORD .env.supabase | cut -d= -f2)" --yes`
Expected: `Applying migration 20260522030000_convert_family_to_solo.sql...` + `Finished supabase db push.` sin errores.

- [ ] **Step 3: Verificar la RPC en prod**

Run:
```bash
mkdir -p /tmp/pgv && npm --prefix /tmp/pgv i pg >/dev/null 2>&1 && PGPW="$(grep SUPABASE_DB_PASSWORD .env.supabase | cut -d= -f2)" node -e '
import("/tmp/pgv/node_modules/pg/lib/index.js").then(async ({default:pg})=>{
  const c=new pg.Client({host:"aws-1-us-east-1.pooler.supabase.com",port:5432,user:"postgres.xaquigyhylzvuyfslkqq",password:process.env.PGPW,database:"postgres",ssl:{rejectUnauthorized:false}});
  await c.connect();
  const fn=await c.query("select proname, pg_get_function_arguments(oid) as args from pg_proc where proname=\x27convert_family_to_solo\x27");
  console.log("fn:", JSON.stringify(fn.rows));
  await c.end();
});' ; rm -rf /tmp/pgv
```
Expected: `fn: [{"proname":"convert_family_to_solo","args":""}]`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522030000_convert_family_to_solo.sql
git commit -m "feat(db): convert_family_to_solo RPC (familia→soltero) · deploy a prod"
```

---

## Task 2: Cliente — hooks `useConvertToSolo` y `useConvertToFamily`

**Files:**
- Modify: `mobile/features/family/use-family-actions.ts`

- [ ] **Step 1: Agregar imports de query keys**

En `mobile/features/family/use-family-actions.ts`, agregar a los imports del tope (junto a los existentes):
```ts
import { familyMembersKey } from '@/features/family/use-family-members'
import { familyMembersDetailKey } from '@/features/family/use-family-members-detail'
import { familyAdminMemberStatsQueryKey } from '@/features/family/use-family-admin'
import { homeSnapshotQueryKey } from '@/features/home/use-home-snapshot'
import type { AccountKind } from '@/features/family/account-kind'
```
(Si `AccountKind` ya está importado por `useSetFamilyKind`, no duplicar.)

- [ ] **Step 2: Agregar `useConvertToSolo`**

Al final del archivo:
```ts
/** Owner-only: convierte la familia a modo solo (familia invisible de 1).
 *  Quita a los demás miembros en el backend (vuelven a onboardear) y deja
 *  kind='solo'. El owner CONSERVA sus datos — por eso solo invalidamos
 *  (no removeQueries) lo que cambió: tipo de cuenta, miembros, ingreso. */
export function useConvertToSolo(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('convert_family_to_solo')
      if (error) throw error
      return pickRpcResult(data)
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: familyMembersKey(result.family_id) }),
        queryClient.invalidateQueries({ queryKey: familyMembersDetailKey(result.family_id) }),
        queryClient.invalidateQueries({ queryKey: familyAdminMemberStatsQueryKey }),
        queryClient.invalidateQueries({ queryKey: familyFinanceQueryKey(result.family_id) }),
        queryClient.invalidateQueries({ queryKey: homeSnapshotQueryKey(userId) }),
      ])
    },
  })
}
```
(`pickRpcResult`, `familyQueryKey`, `familyFinanceQueryKey`, `useMutation`, `useQueryClient`, `supabase` ya existen en el archivo.)

- [ ] **Step 3: Agregar `useConvertToFamily`**

```ts
/** Soltero → Familia: pasa el espacio a kind='shared' (no destructivo).
 *  Reusa la RPC set_family_kind. Invalida tipo de cuenta + home snapshot
 *  para que aparezca la UI de familia. */
export function useConvertToFamily(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('set_family_kind', { p_kind: 'shared' as AccountKind })
      if (error) throw error
      return (typeof data === 'string' ? data : 'shared') as AccountKind
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: homeSnapshotQueryKey(userId) }),
      ])
    },
  })
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. (Si hay import circular con `use-home-snapshot`, verificar: `use-home-snapshot` NO importa `use-family-actions`, así que no debería haberlo.)

- [ ] **Step 5: Commit**

```bash
git add mobile/features/family/use-family-actions.ts
git commit -m "feat(family): useConvertToSolo + useConvertToFamily"
```

---

## Task 3: Settings — sección "Tipo de cuenta" + confirmaciones

**Files:**
- Modify: `mobile/screens/settings/settings-screen.tsx`

Contexto: el grupo "Familia" ya está envuelto en `{!isSolo ? (<RiseView delay={320}>...</RiseView>) : null}`. Vamos a (a) agregar un handler de confirmación para cada dirección, (b) agregar la fila destructiva "Pasar a cuenta individual" dentro del grupo Familia (owner), y (c) reemplazar el `: null` por un grupo "Tipo de cuenta" con la fila de upgrade (solo).

- [ ] **Step 1: Importar los hooks**

Junto a los imports de `@/features/family/use-family-actions` (que ya importa `useLeaveCurrentFamily`), agregar `useConvertToSolo` y `useConvertToFamily` a esa lista de import.

- [ ] **Step 2: Instanciar mutations + handlers**

Cerca de `const leaveFamilyMutation = useLeaveCurrentFamily(userId)` (línea ~129), agregar:
```ts
  const convertToSolo = useConvertToSolo(userId)
  const convertToFamily = useConvertToFamily(userId)
```
Cerca de `handleConfirmLeave` (buscar su definición; usa `Alert.alert`), agregar dos handlers con el mismo estilo (`useCallback`, `showError` ya existe en el archivo):
```ts
  const handleConfirmConvertToSolo = useCallback(() => {
    Alert.alert(
      'Pasar a cuenta individual',
      'Se quitará a los demás miembros y tendrán que volver a configurar su cuenta. Los gastos y la configuración compartida quedan con vos. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Pasar a individual',
          style: 'destructive',
          onPress: () =>
            convertToSolo.mutate(undefined, {
              onError: (error) => showError(error, 'No pudimos cambiar el tipo de cuenta.'),
            }),
        },
      ],
    )
  }, [convertToSolo, showError])

  const handleConfirmConvertToFamily = useCallback(() => {
    Alert.alert(
      'Compartir con tu familia',
      'Tu cuenta pasa a modo familiar. Vas a poder invitar a otras personas y compartir los gastos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Activar',
          onPress: () =>
            convertToFamily.mutate(undefined, {
              onError: (error) => showError(error, 'No pudimos cambiar el tipo de cuenta.'),
            }),
        },
      ],
    )
  }, [convertToFamily, showError])
```
(Verificá la firma real de `showError` en el archivo — se usa como `showError(error, 'mensaje')`. Si difiere, adaptá la llamada.)

- [ ] **Step 3: Fila de downgrade en el grupo Familia (owner)**

Dentro del `<SettingsGroup title="Familia">`, después de la fila "Gestionar miembros" (la que hace `router.push('/settings/family-admin' …)`, gateada por `isOwner`), agregar:
```tsx
                {isOwner ? (
                  <SettingsRow
                    destructive
                    icon="person-remove"
                    label="Pasar a cuenta individual"
                    helper="Quita a los demás miembros y deja la cuenta solo para vos."
                    onPress={handleConfirmConvertToSolo}
                  />
                ) : null}
```
(No tocar la fila "Salir del hogar" que sigue; mantiene su `isLast`.)

- [ ] **Step 4: Grupo "Tipo de cuenta" para solteros**

Reemplazar el cierre del bloque Familia `) : null}` por un grupo de upgrade:
```tsx
            ) : (
              <RiseView delay={320}>
                <SettingsGroup title="Tipo de cuenta">
                  <SettingsRow
                    icon="group-add"
                    isLast
                    label="Compartir con mi familia o pareja"
                    helper="Activá el modo familiar para invitar y compartir gastos."
                    onPress={handleConfirmConvertToFamily}
                  />
                </SettingsGroup>
              </RiseView>
            )}
```
(Es decir, el bloque pasa de `{!isSolo ? (<Familia/>) : null}` a `{!isSolo ? (<Familia/>) : (<TipoDeCuenta/>)}`.)

- [ ] **Step 5: Typecheck + lint + guard de copy**

Run: `npm run typecheck && npm run lint && npm run guard:forbidden-copy`
Expected: los tres exit 0. (Si `MaterialIcons` no tiene `person-remove`/`group-add`, usar un icono válido equivalente, p. ej. `person-off` / `group` — verificá contra los iconos ya usados en el archivo.)

- [ ] **Step 6: Commit**

```bash
git add mobile/screens/settings/settings-screen.tsx
git commit -m "feat(settings): sección Tipo de cuenta (pasar a individual / a familiar)"
```

---

## Task 4: Validación + QA

- [ ] **Step 1: Checks automáticos**

Run:
```bash
npm run typecheck; echo "tc: $?"
npm run lint; echo "lint: $?"
npm run guard:forbidden-copy; echo "copy: $?"
npm run test -- account-kind; echo "test: $?"
```
Expected: todos exit 0. (No correr `validate` completo por la deuda pre-existente documentada arriba.)

- [ ] **Step 2: QA manual (checklist)**

Con dos cuentas de prueba (email/pass):
- [ ] Crear familia (cuenta A owner) + unir cuenta B con código.
- [ ] En A → Settings → "Familia" → "Pasar a cuenta individual" → confirmar. Verificar: A queda en modo solo (grupo Familia desaparece, hero "Tu cuenta"), conserva gastos/fijos. B, al reabrir, cae en onboarding.
- [ ] Crear cuenta solo (C) → Settings → "Tipo de cuenta" → "Compartir con mi familia o pareja" → confirmar. Verificar: aparece el grupo "Familia"; se puede generar código de invitación.
- [ ] Miembro (cuenta B en otra familia) → "Salir del hogar" → cae en onboarding → elige "Yo solo" → queda solo. (flujo existente)

- [ ] **Step 3: Verificar kind en prod tras downgrade de prueba** (opcional)

Reusar el snippet de pg de Task 1 cambiando la query a `select id, kind from families order by created_at desc limit 5` y a `select count(*) from family_members where family_id = '<id>'` para confirmar que quedó 1 miembro y `kind='solo'`.

---

## Task 5: Docs — sync

**Files:**
- Modify: `docs/sistemas/account-kinds.md`
- Modify: `docs/auditorias/expansion-multisegmento-2026-05-22/README.md`

- [ ] **Step 1: Marcar la conversión como implementada**

En `docs/sistemas/account-kinds.md`, en la sección "Conversión de tipo de cuenta", cambiar la nota de estado de "especificado/planificado" a "✅ implementado (2026-05-22)" y agregar el nombre de la RPC/hook reales (`convert_family_to_solo`, `useConvertToSolo`, `useConvertToFamily`).

- [ ] **Step 2: Auditoría**

En `docs/auditorias/expansion-multisegmento-2026-05-22/README.md` (Fase 1), quitar "conversión solo→compartido" de los pendientes fast-follow (ya está hecha), dejando como pendiente solo lo que siga abierto (validar asistente/logros en contexto de 1 persona; QA manual).

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: marcar conversión de tipo de cuenta como implementada"
```

---

## Self-review (cobertura del spec)

- §2.1 RPC `convert_family_to_solo` → Task 1 ✅ (incluye reset de onboarding, borrado de miembros/push/invites, flip a solo; trigger recompute_family_income ajusta ingreso).
- §2.2 Upgrade reusa `set_family_kind('shared')` → Task 2 `useConvertToFamily` ✅.
- §3 Hooks `useConvertToSolo`/`useConvertToFamily` → Task 2 ✅ (invalidaciones targeted; el owner conserva datos, sin removeQueries).
- §4 UX por estado: owner downgrade (destructivo, confirm fuerte) + solo upgrade (confirm liviano) → Task 3 ✅. Miembro no-owner → usa "Salir del hogar" existente (sin cambio); el helper opcional de aclaración NO se agrega (YAGNI — la fila ya existe y es clara). **Desviación consciente del spec §4** (el helper para no-owner queda fuera).
- §5 Edge cases (invites borrados, sin kick en tiempo real) → cubiertos por la RPC + comportamiento existente.
- §8 Docs → Task 5 ✅.

**Granularidad:** las mutations y la UI se verifican con typecheck/lint/guard + QA manual (no hay harness de render RN; el grueso de la lógica vive en la RPC, verificada en prod). No se agregan tests unitarios nuevos porque no hay lógica pura nueva del lado cliente (las mutations son thin wrappers).
