-- Document a known caveat in home_snapshot until the next time the
-- function is rewritten. Currently the function does
-- `select family_id from family_members ... limit 1` with no
-- order by. With the per-user "1 family" invariant this is fine, but
-- multi-segmento rollout will allow 2 active memberships (solo +
-- family); during transition the snapshot would be non-deterministic.
--
-- Resolution path: when home_snapshot is next touched (e.g. for
-- multi-segmento), change the membership pick to
-- `order by created_at asc limit 1` (or pick by an explicit
-- "active_segment" flag once that ships).
--
-- See P1 #10 of 2026-05-31 code review.

comment on function public.home_snapshot() is
  'Returns the user home dashboard snapshot. CAVEAT: family membership pick uses LIMIT 1 with no ORDER BY — non-deterministic if a user ever has multiple active rows. Multi-segmento rollout MUST fix this before allowing dual memberships.';
