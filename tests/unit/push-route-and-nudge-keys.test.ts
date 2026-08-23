import { describe, expect, it } from 'vitest'
import { normalizeAppRoute } from '@/utils/routes'
import {
  buildThresholdNudgeKey,
  LEGACY_CHECKIN_DATA_KEY,
} from '@/hooks/daily-budget-nudge-keys'

/**
 * Regresiones del incidente de producción 2026-08-23 (cuenta aye.tello18):
 * spam del nudge "Cierra tu día" + pantalla en blanco al tocar un push.
 */

/** El charset que expo-secure-store acepta (build/SecureStore.js): cualquier
 *  otra cosa tira "Invalid key provided to SecureStore" y persistent-kv se
 *  traga la excepción → el dedup NUNCA persiste (así nació el spam). */
const SECURE_STORE_KEY = /^[\w.-]+$/

describe('nudge "Cierra tu día" — la clave de dedup tiene que ser válida para SecureStore', () => {
  it('la clave del umbral usa sólo [A-Za-z0-9_.-] (sin ":")', () => {
    const key = buildThresholdNudgeKey('7e08c620-f6ab-4203-8821-1a70ec0149ae', '2026-08-23')
    expect(key).toMatch(SECURE_STORE_KEY)
    expect(key).not.toContain(':')
  })
  it('la clave es única por familia y por día', () => {
    const a = buildThresholdNudgeKey('fam-a', '2026-08-23')
    expect(a).not.toBe(buildThresholdNudgeKey('fam-b', '2026-08-23'))
    expect(a).not.toBe(buildThresholdNudgeKey('fam-a', '2026-08-24'))
  })
  it('el matcher del checkin legacy retirado NO cambia (tiene que seguir matcheando lo agendado viejo)', () => {
    // Es data de la notificación (no SecureStore): el ":" viejo es correcto
    // acá — cambiarlo dejaría sin cancelar lo que quedó agendado en installs
    // previos.
    expect(LEGACY_CHECKIN_DATA_KEY).toBe('daily-budget-checkin')
  })
})

describe('normalizeAppRoute — ningún push puede aterrizar en una ruta muerta', () => {
  it("'/(app)/(tabs)/control' (payload server legacy) remapea a la tab insights", () => {
    // La tab se renombró a `insights` en el rediseño; 4 kinds del server
    // (cycle_close, assistant_dormant, racha del jardín, checkins viejos)
    // todavía mandan la ruta vieja. Sin este remapeo, expo-router pushea
    // una ruta inexistente → pantalla en blanco (no hay +not-found).
    expect(normalizeAppRoute('/(app)/(tabs)/control')).toBe('/(app)/(tabs)/insights')
  })
  it("'/control' y 'control' también van a insights", () => {
    expect(normalizeAppRoute('/control')).toBe('/(app)/(tabs)/insights')
    expect(normalizeAppRoute('control')).toBe('/(app)/(tabs)/insights')
  })
  it('las rutas del allowlist siguen pasando tal cual', () => {
    expect(normalizeAppRoute('/(app)/(tabs)/expenses')).toBe('/(app)/(tabs)/expenses')
    expect(normalizeAppRoute('/(app)/notifications')).toBe('/(app)/notifications')
  })
  it('lo desconocido cae a home', () => {
    expect(normalizeAppRoute('/(app)/settings/dev')).toBe('/(app)/(tabs)/home')
    expect(normalizeAppRoute(null)).toBe('/(app)/(tabs)/home')
  })
})
