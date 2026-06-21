-- Consolidación anti-spam: zombies (suscripciones sin usar) en 1 digest >2.
--
-- Antes: cron_detect_zombies hacía un loop per-fijo con un emit_notification
-- por cada zombie → familia con 4 subs sin uso = 4 push el lunes. Ahora: si
-- una familia tiene >2 zombies → 1 sola notif digest; 1-2 → individuales.
--
-- Mantiene los mismos filtros de elegibilidad (active, periodic, sin uso
-- 60d+, ≥2 pagos) y el dedup de 14d (por-fijo para individuales, family-wide
-- para el digest). Único cambio funcional: la consolidación.
--
-- Plan: docs/superpowers/plans/2026-06-21-push-notification-consolidation.md

create or replace function public.cron_detect_zombies()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fam record;
  v_zombie record;
begin
  -- Una fila por familia con sus zombies elegibles agregados.
  for v_fam in
    with elig as (
      select
        fe.family_id, fe.id, fe.name, fe.amount,
        row_number() over (
          partition by fe.family_id
          order by fe.amount desc nulls last
        ) as rn
      from public.fixed_expenses fe
      where coalesce(fe.status, 'active') = 'active'
        and coalesce(fe.kind, 'periodic') = 'periodic'
        and (fe.last_used_at is null or fe.last_used_at < now() - interval '60 days')
        and (
          select count(*) from public.fixed_expense_payments fep
          where fep.fixed_expense_id = fe.id
        ) >= 2
    )
    select
      e.family_id,
      count(*) as cnt,
      sum(coalesce(e.amount, 0)) as total,
      string_agg(
        case when e.rn <= 3 then coalesce(nullif(btrim(e.name), ''), 'Compromiso') end,
        ', ' order by e.rn
      ) as top_names
    from elig e
    group by e.family_id
  loop
    begin
      if v_fam.cnt > 2 then
        -- >2 → DIGEST family-wide. Dedup: no hubo digest en 14d.
        if exists (
          select 1 from public.notifications n
          where n.family_id = v_fam.family_id
            and n.kind = 'zombie_alert'
            and (n.metadata ->> 'digest') = 'true'
            and n.created_at >= now() - interval '14 days'
        ) then
          continue;
        end if;

        perform public.emit_notification(
          v_fam.family_id,
          null,
          'Suscripciones sin usar',
          'Tenés ' || v_fam.cnt || ' suscripciones sin movimiento hace 60+ días · '
            || v_fam.top_names
            || (case when v_fam.cnt > 3 then ' y ' || (v_fam.cnt - 3) || ' más' else '' end)
            || ' · $' || to_char(round(v_fam.total), 'FM999,999,999') || '/mes',
          'zombie_alert',
          'warning',
          null,
          jsonb_build_object(
            'route', '/fixed-expenses',
            'digest', true,
            'count', v_fam.cnt,
            'total', v_fam.total
          )
        );
      else
        -- 1-2 → individual (loop por fijo, dedup por-fijo 14d).
        for v_zombie in
          select fe.id, fe.name, fe.amount
          from public.fixed_expenses fe
          where fe.family_id = v_fam.family_id
            and coalesce(fe.status, 'active') = 'active'
            and coalesce(fe.kind, 'periodic') = 'periodic'
            and (fe.last_used_at is null or fe.last_used_at < now() - interval '60 days')
            and (
              select count(*) from public.fixed_expense_payments fep
              where fep.fixed_expense_id = fe.id
            ) >= 2
        loop
          if exists (
            select 1 from public.notifications n
            where n.family_id = v_fam.family_id
              and n.kind = 'zombie_alert'
              and (n.metadata ->> 'fixed_expense_id') = v_zombie.id::text
              and n.created_at >= now() - interval '14 days'
          ) then
            continue;
          end if;

          perform public.emit_notification(
            v_fam.family_id,
            null,
            'Suscripción sin usar',
            coalesce(nullif(btrim(v_zombie.name), ''), 'Compromiso')
              || ' · $' || to_char(round(coalesce(v_zombie.amount, 0)), 'FM999,999,999')
              || ' sin movimiento hace 60+ días.',
            'zombie_alert',
            'warning',
            null,
            jsonb_build_object(
              'route', '/fixed-expenses',
              'fixed_expense_id', v_zombie.id,
              'name', v_zombie.name,
              'amount', v_zombie.amount
            )
          );
        end loop;
      end if;
    exception when others then
      raise notice 'cron_detect_zombies family %: %', v_fam.family_id, sqlerrm;
    end;
  end loop;
exception when others then
  raise notice 'cron_detect_zombies: %', sqlerrm;
end;
$$;

revoke all on function public.cron_detect_zombies() from public;
grant execute on function public.cron_detect_zombies() to service_role;
grant execute on function public.cron_detect_zombies() to authenticated;
