# Spec — Conversión de tipo de cuenta (Familia ↔ Soltero) · v1

> 🗓️ **2026-05-22** · Diseño aprobado (brainstorming). Fast-follow del [modo soltero](spec-modo-soltero-v1.md): permite cambiar el tipo de cuenta en Settings en ambos sentidos, cuando el usuario quiera. Cierra la "limitación v1" (sin conversión) del modo soltero.

## 1. Objetivo y criterios de éxito

Que cualquier usuario pueda cambiar el tipo de su cuenta desde Settings:

- **Owner de una familia → Soltero:** quita a los demás miembros (que vuelven a onboardear sin familia) y su espacio queda `kind='solo'`. Los gastos/config compartidos quedan con el owner.
- **Soltero → Familia:** el espacio pasa a `kind='shared'` y aparecen los settings de familia (invitar, gestionar). No destructivo.
- **Miembro no-dueño → Soltero:** **flujo existente** — "Salir del hogar" (`leave_current_family`) → re-onboarding → elige "Yo solo". Ya funciona (verificado: `leave_current_family` resetea `onboarding_completed_at`). Esta spec NO lo modifica; solo lo documenta.

**Criterios de éxito (QA):**
- Owner downgrade: los miembros desaparecen de la familia; al reabrir su app caen en onboarding; el owner queda en modo solo sin perder sus gastos/fijos/historial.
- Upgrade solo→familia: aparece el grupo "Familia"; el usuario puede generar un código de invitación.
- Confirmaciones: el downgrade pide confirmación fuerte (es destructivo para los demás); el upgrade, confirmación liviana.
- Un usuario `shared` con varios miembros que NO es owner no ve "Pasar a soltero" (usa "Salir del hogar").

## 2. Backend

### 2.1 RPC nueva `convert_family_to_solo()`
Owner-only, `security definer`, `set search_path = public`. Atómica. Espeja el patrón de `leave_current_family` para el reset de onboarding.

```sql
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
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select fm.family_id into v_family_id
  from public.family_members fm
  where fm.user_id = v_user_id and fm.role = 'owner';

  if v_family_id is null then
    raise exception 'Solo el dueño puede pasar la cuenta a individual.';
  end if;

  -- Los demás miembros vuelven a onboardear (previously_onboarded queda true
  -- para el copy de reingreso — no se toca esa columna).
  update public.profiles p
  set onboarding_completed_at = null
  where p.id in (
    select fm.user_id from public.family_members fm
    where fm.family_id = v_family_id and fm.user_id <> v_user_id
  );

  delete from public.push_subscriptions ps
  where ps.family_id = v_family_id and ps.user_id <> v_user_id;

  -- Quita a todos los no-owner (incluidos blocked). El trigger
  -- recompute_family_income() recalcula family_finance.monthly_income.
  delete from public.family_members fm
  where fm.family_id = v_family_id and fm.user_id <> v_user_id;

  -- Invalida invites pendientes (no consumidos).
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

Notas:
- **Caso borde** (familia `shared` con solo el owner): los `delete` no afectan filas; solo se hace el flip a `solo`. Correcto.
- **Datos:** los gastos/fijos/historial quedan en la familia (con el owner). Los miembros removidos arrancan de cero al re-onboardear (igual que hoy con `family_remove_member` + el reset de onboarding que agregamos).
- **Ingreso:** tras el downgrade, `monthly_income` refleja solo el aporte del owner (recalculado por el trigger). Ajustable en Settings.
- La migración debe verificar el nombre/columnas reales de `family_invites` (`consumed_at`) — confirmado en `20260507000200_family_invites.sql`.

### 2.2 Upgrade Soltero → Familia
Reusa la RPC existente **`set_family_kind('shared')`** (ya creada en el modo soltero). No requiere RPC nueva.

## 3. Cliente

- **`useConvertToSolo(userId)`** (en `mobile/features/family/use-family-actions.ts`): mutation que llama `convert_family_to_solo` e invalida las caches relevantes (familia, gastos, finance, fixed-expenses, notifications, push) — reusar el set de invalidaciones de `useLeaveCurrentFamily` como referencia.
- **`useConvertToFamily(userId)`**: envuelve `set_family_kind('shared')` (o reusar `useSetFamilyKind`) + invalida la cache de familia. Puede ser un thin wrapper o usar `useSetFamilyKind` directo desde la screen.

## 4. UX — Settings

Nueva sección **"Tipo de cuenta"** (o filas dentro de los grupos existentes), derivada de `isSolo` + `isOwner`:

- **Soltero:** fila "Compartir con mi familia o pareja" → confirmación liviana (Alert simple) → `convertToFamily` → invalida caches; aparece el grupo "Familia". Opcional: abrir el sheet de invitar al terminar.
- **Familia + owner:** fila destructiva (roja) "Pasar a cuenta individual" → **Alert de confirmación fuerte** explicando: "Se quitará a los demás miembros y tendrán que volver a configurar su cuenta. Los gastos y la configuración compartida quedan con vos. Esta acción no se puede deshacer." → `convertToSolo` → la app queda en modo solo (el grupo "Familia" desaparece, hero pasa a "Tu cuenta", etc.).
- **Familia + NO owner:** no muestra "Pasar a soltero". Mantiene "Salir del hogar" (existente, sin cambios). Un helper aclaratorio ("podés volver a empezar como cuenta individual") es **opcional** y queda fuera de v1 (YAGNI).

Placement sugerido: para soltero, una fila en el grupo "Tu cuenta"; para familia-owner, la fila va en el grupo "Familia" (junto a invitar/gestionar) o en una sección propia "Tipo de cuenta". A definir en el plan según el layout real.

## 5. Consecuencias / edge cases

- Miembros removidos detectan el cambio en su próxima apertura/refetch → onboarding (sin kick en tiempo real obligatorio para v1; consistente con `family_remove_member`).
- Invites pendientes se borran en el downgrade.
- No hay pérdida de datos para el owner (conserva todo el espacio).

## 6. Fuera de alcance (v1)

- Kick en tiempo real de miembros removidos (verán el cambio al reabrir).
- Notificación push a los miembros removidos avisando que la familia se disolvió (se puede agregar después; opcional).
- Pymes/negocio.

## 7. Testing

- **RPC:** verificar en prod tras deploy (consulta a `pg_proc`/comportamiento con una familia de prueba), como se hizo con `set_family_kind`.
- **Cliente:** unit donde aplique (las mutations son thin; el grueso es la RPC). 
- **QA manual:** (a) crear familia con 2 cuentas, owner hace downgrade → verificar que el miembro cae en onboarding y el owner queda solo; (b) soltero → upgrade → invitar; (c) miembro → "Salir del hogar" → onboarding → elegir Solo.

## 8. Docs a actualizar (mismo commit)

- `docs/sistemas/account-kinds.md`: sección "Conversión de tipo de cuenta" (reemplaza la limitación "sin conversión").
- `docs/auditorias/expansion-multisegmento-2026-05-22/README.md`: quitar la conversión de "pendiente fast-follow".
- Este spec.

## 9. Archivos afectados (resumen)

| Capa | Archivo | Cambio |
|---|---|---|
| DB | `supabase/migrations/20260522030000_convert_family_to_solo.sql` (nuevo) | RPC `convert_family_to_solo` |
| Cliente | `mobile/features/family/use-family-actions.ts` | `useConvertToSolo` (+ `useConvertToFamily` o reuso de `useSetFamilyKind`) |
| Cliente | `mobile/screens/settings/settings-screen.tsx` | sección "Tipo de cuenta": filas + confirmaciones por estado (solo / owner / miembro) |
| Docs | ver §8 | sync |

<!-- Spec aprobado en brainstorming 2026-05-22; pendiente review del owner antes de writing-plans -->
