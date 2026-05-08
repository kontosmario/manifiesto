// tests/integration/notifications-bulk.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, isSupabaseLocalReachable } from './_helpers/supabase-test-client';
import { seedMinimalFamily, cleanupFamily, SeededFamily } from './_helpers/seed';

const supabaseUp = await isSupabaseLocalReachable();
const describeIfLive = supabaseUp ? describe : describe.skip;

describeIfLive('notifications bulk helpers', () => {
  let family: SeededFamily;

  beforeAll(async () => {
    family = await seedMinimalFamily('-bulk');
  }, 30_000);

  afterAll(async () => {
    await cleanupFamily(family);
  }, 30_000);

  it('list_pending_notifications(\'morning_checkins\') returns family member candidates', async () => {
    const admin = adminClient();
    const { data, error } = await admin.rpc('list_pending_notifications', {
      p_kind: 'morning_checkins',
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    const found = (data as any[]).find(r => r.family_id === family.familyId);
    expect(found).toBeDefined();
    expect(found.user_id).toBe(family.ownerId);
    expect(found.dedup_key).toBeTruthy();
  });

  it('emit_notifications_bulk inserts rows and dedups via dedup_key', async () => {
    const admin = adminClient();
    const rows = [
      {
        family_id: family.familyId,
        user_id: family.ownerId,
        title: 'Test',
        body: '...',
        kind: 'checkin_morning',
        severity: 'info',
        metadata: { route: '/' },
        dedup_key: `checkin_morning:${family.familyId}:${family.ownerId}:2026-05-08`,
      },
    ];

    const { data: r1 } = await admin.rpc('emit_notifications_bulk', { p_rows: rows });
    expect(r1).toBe(1);

    // Re-emit same dedup_key → 0 inserted
    const { data: r2 } = await admin.rpc('emit_notifications_bulk', { p_rows: rows });
    expect(r2).toBe(0);
  });
});
