// Backwards-compat re-export. Helpers moved to mobile/lib/telemetry-session.ts
// to break the home ↔ telemetry import cycle. New code should import
// from '@/lib/telemetry-session' directly.
export {
  newSessionId,
  isReopenInSession,
  REOPEN_THRESHOLD_MS,
} from '@/lib/telemetry-session'
