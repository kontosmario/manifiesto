do $do$
declare
  v_src text;
begin
  v_src := pg_get_functiondef('public.list_pending_notifications(text)'::regprocedure);

  -- (1) Ventana fixed_upcoming: solapada (2-3 avisos) -> un solo dia por gasto
  -- con created-aware.
  v_src := regexp_replace(
    v_src,
    'where fe\.next_due_on between m\.today_local and m\.today_local \+ 1\s+or \(coalesce\(fe\.notify_days_before, 0\) > 1 and fe\.next_due_on = m\.today_local \+ coalesce\(fe\.notify_days_before, 0\)\)',
    'where m.today_local = least(greatest(fe.next_due_on - greatest(coalesce(fe.notify_days_before, 1), 0), (fe.created_at at time zone m.user_tz)::date + 1), fe.next_due_on)',
    'g'
  );

  -- (2) dedup_key per-gasto: por fecha (today_local) -> por OCURRENCIA (due_on).
  v_src := replace(
    v_src,
    '''fixed_upcoming:'' || d.id::text || '':'' || d.user_id::text || '':'' || d.today_local::text as dedup_key',
    '''fixed_upcoming:'' || d.id::text || '':'' || d.next_due_on::text || '':'' || d.user_id::text as dedup_key'
  );

  -- Guard: si algun patron no matcheo, abortar en vez de aplicar el fix a medias.
  if position('(fe.created_at at time zone m.user_tz)::date + 1' in v_src) = 0
     or position('d.next_due_on::text || '':'' || d.user_id::text as dedup_key' in v_src) = 0 then
    raise exception 'fix fixed_upcoming: los substrings no matchearon la definicion viva';
  end if;

  execute v_src;
end
$do$;
