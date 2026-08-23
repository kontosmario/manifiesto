package expo.modules.preferredrefreshrate

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Fija la tasa de refresco PREFERIDA de la ventana de la Activity.
 *
 * Existe por el tier de pintura de gama baja (mobile/theme/paint-tier.ts):
 * en esos devices el usuario puede tener el panel clavado a 90/120Hz
 * (medido en un moto g20 a 90Hz forzado: presupuesto de 11.1ms por frame
 * que el SoC no puede cumplir → 124 vsyncs perdidos por sesión de
 * scroll). Preferir 60Hz les devuelve un 50% de presupuesto por frame
 * sin tocar la configuración del usuario y sin afectar a otras apps.
 *
 * `preferredRefreshRate` es un HINT al DisplayManager: elige el modo
 * soportado más cercano y el sistema puede ignorarlo (p. ej. si otra
 * capa vota más alto). En paneles de un solo modo es un no-op inocuo.
 */
class PreferredRefreshRateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PreferredRefreshRate")

    AsyncFunction("setPreferredRefreshRate") { rate: Float ->
      val activity = appContext.currentActivity ?: return@AsyncFunction
      activity.runOnUiThread {
        val window = activity.window ?: return@runOnUiThread
        val attributes = window.attributes
        attributes.preferredRefreshRate = rate
        window.attributes = attributes
      }
    }
  }
}
