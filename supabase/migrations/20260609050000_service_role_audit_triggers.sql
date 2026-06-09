-- supabase/migrations/20260609050000_service_role_audit_triggers.sql
--
-- Sprint B · B5 — Audit log automático para writes hechos con service_role.
--
-- Por qué:
--   Edge functions (delete-account processor, push sender, eventual
--   cron processors, etc.) corren con service_role y pueden mutar
--   datos sin pasar por las RPCs SECURITY DEFINER del cliente. Hoy
--   esos writes son invisibles en cualquier audit trail — si una
--   edge function quema datos por bug, no sabemos hasta que el user
--   se queja.
--
--   Este trigger captura TODOS los INSERT/UPDATE/DELETE en tablas
--   críticas cuando el actor es service_role, y los escribe a
--   audit_log con shape consistente.
--
-- Tablas cubiertas (críticas = "si esto cambia y no era intencional,
--                              quiero saber"):
--   • family_finance
--   • savings_goals
--   • expenses
--   • family_members
--   • month_close_decisions
--   • monthly_summaries
--
-- Comportamiento bajo `authenticated`:
--   El trigger detecta `auth.role() = 'service_role'` y solo escribe
--   en ese caso. Writes del user normal NO se loggean (el audit log
--   se bloatearía masivamente).
--
-- Performance:
--   El trigger es AFTER FOR EACH ROW — el costo es un INSERT extra
--   en audit_log SOLO cuando el actor es service_role. Writes del
--   cliente normal pasan por el IF y retornan sin tocar audit_log.
--   No usamos statement-level triggers porque queremos el id por row.
--
-- ID extraction:
--   No todas las tablas tienen columna `id` (family_finance tiene PK
--   = family_id, family_members tiene PK compuesto). Usamos
--   `to_jsonb(NEW)->>'id'` que retorna NULL safely para tablas sin id.
--   El audit_log.target_id es nullable; cuando es NULL, el payload
--   carga las claves de identificación alternativas.

create or replace function public.audit_service_role_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_target_id uuid;
  v_payload jsonb;
begin
  -- Cheap exit: si no es service_role no hacemos nada.
  if auth.role() is distinct from 'service_role' then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  v_row := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;

  -- Intentar extraer `id` (tablas sin esa columna devuelven NULL).
  begin
    v_target_id := (v_row->>'id')::uuid;
  exception when others then
    v_target_id := null;
  end;

  v_payload := jsonb_build_object(
    'op', TG_OP,
    'family_id', v_row->>'family_id',
    'user_id', v_row->>'user_id'
  );

  insert into public.audit_log (
    user_id, family_id, action, target_table, target_id, payload
  ) values (
    null,                                       -- service-role: no user_id
    nullif(v_row->>'family_id', '')::uuid,      -- best-effort family scoping
    'service_role_' || TG_OP || '_' || TG_TABLE_NAME,
    TG_TABLE_NAME::text,
    v_target_id,
    v_payload
  );

  return case when TG_OP = 'DELETE' then OLD else NEW end;
exception when others then
  -- Defensive: NUNCA bloquear el write original por un fail en el audit.
  -- Si la insertion en audit_log falla, log y seguir.
  raise warning 'audit_service_role_write failed on %.% op=%: %',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, sqlerrm;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

-- service_role necesita execute para que los triggers se disparen
-- cuando el actor es la edge function.
grant execute on function public.audit_service_role_write() to service_role;

-- ════════════════════════════════════════════════════════════════════
-- Triggers en tablas críticas
-- ════════════════════════════════════════════════════════════════════
-- Patrón: drop-then-create para que la migración sea re-runable.

drop trigger if exists audit_family_finance_service_role
  on public.family_finance;
create trigger audit_family_finance_service_role
  after insert or update or delete on public.family_finance
  for each row execute function public.audit_service_role_write();

drop trigger if exists audit_savings_goals_service_role
  on public.savings_goals;
create trigger audit_savings_goals_service_role
  after insert or update or delete on public.savings_goals
  for each row execute function public.audit_service_role_write();

drop trigger if exists audit_expenses_service_role
  on public.expenses;
create trigger audit_expenses_service_role
  after insert or update or delete on public.expenses
  for each row execute function public.audit_service_role_write();

drop trigger if exists audit_family_members_service_role
  on public.family_members;
create trigger audit_family_members_service_role
  after insert or update or delete on public.family_members
  for each row execute function public.audit_service_role_write();

drop trigger if exists audit_month_close_decisions_service_role
  on public.month_close_decisions;
create trigger audit_month_close_decisions_service_role
  after insert or update or delete on public.month_close_decisions
  for each row execute function public.audit_service_role_write();

drop trigger if exists audit_monthly_summaries_service_role
  on public.monthly_summaries;
create trigger audit_monthly_summaries_service_role
  after insert or update or delete on public.monthly_summaries
  for each row execute function public.audit_service_role_write();
