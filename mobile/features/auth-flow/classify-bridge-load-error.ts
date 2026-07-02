export type BridgeLoadErrorKind = 'network' | 'timeout' | 'unknown'

// Errores de TRANSPORTE: el request no completó (DNS, TCP, TLS, abort,
// timeout). RN fetch los reporta como TypeError("Network request failed"),
// NSURLSession como "Could not connect" / "timed out" / "connection abort".
const TRANSPORT_ERROR = /network|fetch|abort|timeout|timed out|offline|socket|connect/i

/**
 * Clasifica el error de carga post-login (home_snapshot) para el fallback
 * del bridge. `reachable` es el resultado de la verificación ACTIVA de
 * internet (round-trip real vía `verifyInternetReachable`), no NetInfo.
 *
 * Regla central: "Sin conexión a internet" solo puede aparecer cuando la
 * verificación activa confirmó que NO hay internet. Con internet real, un
 * error de transporte contra el backend se reporta como demora ('timeout',
 * "La conexión está demorando") — acusar "sin conexión" ahí es FALSO y fue
 * exactamente el rechazo 2.1(a) de Apple sobre 1.0(11): un blip transitorio
 * post-login mostró "No internet connection" con la conexión activa.
 */
export function classifyBridgeLoadError(
  message: string | undefined,
  reachable: boolean,
): BridgeLoadErrorKind {
  if (!reachable) return 'network'
  return TRANSPORT_ERROR.test(message ?? '') ? 'timeout' : 'unknown'
}
