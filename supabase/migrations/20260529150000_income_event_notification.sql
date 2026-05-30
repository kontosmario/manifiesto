-- Trigger AFTER INSERT en income_events para emitir notificación
-- 'income_logged' al feed compartido. Mismo molde que
-- notify_expense_change() para expenses (kind 'expense_logged' /
-- 'fixed_paid'), así el feed de notificaciones cubre los dos lados del
-- flujo de plata: lo que sale (expense) y lo que entra (income).

create or replace function public.notify_income_event_change()
returns trigger
language plpgsql
as $$
begin
  perform public.emit_notification(
    new.family_id,
    null,
    'Nuevo ingreso registrado',
    concat(
      coalesce(
        nullif(btrim(new.description), ''),
        case new.kind
          when 'transfer' then 'Transferencia'
          when 'bonus' then 'Bono'
          when 'gift' then 'Regalo'
          else 'Ingreso'
        end
      ),
      ' · +$',
      coalesce(new.amount, 0)::text
    ),
    'income_logged',
    'success',
    new.created_by,
    jsonb_build_object(
      'route', '/home',
      'income_id', new.id,
      'amount', new.amount,
      'kind', new.kind
    )
  );
  return new;
exception when others then return new;
end;
$$;

drop trigger if exists trg_income_notification on public.income_events;

create trigger trg_income_notification
  after insert on public.income_events
  for each row execute function public.notify_income_event_change();
