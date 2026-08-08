import Foundation
import UserNotifications

/// Persistencia de las capturas de Apple Pay y la notificación local que
/// avisa al usuario.
///
/// Usa `UserDefaults.standard` (no un App Group) porque el App Intent vive
/// en el target principal y corre en el proceso de la app. Si Apple algún
/// día lo moviera a un proceso de extensión, haría falta un App Group con
/// su entitlement.
///
/// ⚠️ Este archivo se COMPILA DOS VECES a propósito, y no es un descuido:
///
///  - acá, dentro del Pod `ApplePayCapture` (el módulo Expo), que es quien
///    LEE las capturas y las expone a JS;
///  - y dentro del target principal `Manifiesto`, adonde lo copia
///    `plugins/with-apple-pay-intent.cjs`, porque ahí vive el App Intent
///    que ESCRIBE (los App Intents tienen que estar en el target principal
///    para que el extractor de metadata de Apple los indexe).
///
/// Swift no cruza módulos hacia arriba: un Pod no puede importar el módulo
/// de la app, así que el módulo Expo no podría "ver" una copia que viviera
/// sólo en el target principal. Duplicar el binario es barato; duplicar el
/// ARCHIVO no lo es (las claves se desincronizan y la feature se rompe en
/// silencio), por eso en disco hay uno solo y el config plugin lo copia.
///
/// Todo queda `internal`: si fuera `public`, el target principal vería dos
/// `ManifiestoCaptureStore` (el suyo y el del Pod, que importa vía
/// `ExpoModulesProvider.swift`) y el nombre quedaría ambiguo.
enum ManifiestoCaptureStore {
  static let capturesKey = "manifiesto.applePay.pendingCaptures"
  static let copyKey = "manifiesto.applePay.notificationCopy"
  static let enabledKey = "manifiesto.applePay.enabled"
  /// Tope para que la lista no crezca sin límite si el usuario nunca
  /// abre la app. Se descartan las más viejas.
  static let maxEntries = 50

  /// El flag que el usuario controla desde Ajustes. Lo espeja el lado JS
  /// (keychain → acá) en cada arranque y en cada toque del switch.
  ///
  /// El default de `bool(forKey:)` cuando la clave no existe es `false`, y
  /// es justo lo que queremos: apagado hasta que el usuario lo prenda. Sin
  /// este gate el intent guardaba y notificaba con la captura APAGADA, y la
  /// notificación quedaba huérfana — nadie la drena, porque el host de JS
  /// no se monta.
  static func isEnabled() -> Bool {
    return UserDefaults.standard.bool(forKey: enabledKey)
  }

  static func setEnabled(_ enabled: Bool) {
    UserDefaults.standard.set(enabled, forKey: enabledKey)
  }

  static func read() -> [[String: String]] {
    guard let json = UserDefaults.standard.string(forKey: capturesKey),
          let data = json.data(using: .utf8),
          let list = try? JSONSerialization.jsonObject(with: data) as? [[String: String]]
    else { return [] }
    return list
  }

  static func write(_ list: [[String: String]]) {
    guard let data = try? JSONSerialization.data(withJSONObject: list),
          let json = String(data: data, encoding: .utf8)
    else { return }
    UserDefaults.standard.set(json, forKey: capturesKey)
  }

  static func append(merchantRaw: String, amountRaw: String) {
    var list = read()
    // ISO-8601 en UTC. El lado JS lo pasa a día local, así que no hace
    // falta estampar la zona del teléfono acá.
    let formatter = ISO8601DateFormatter()
    list.append([
      "id": UUID().uuidString,
      "merchantRaw": merchantRaw,
      "amountRaw": amountRaw,
      "capturedAt": formatter.string(from: Date()),
    ])
    if list.count > maxEntries {
      list.removeFirst(list.count - maxEntries)
    }
    write(list)
  }

  /// El copy lo escribe el lado JS desde los archivos de i18n, así el
  /// idioma de la notificación sigue al de la app y no queda castellano
  /// hardcodeado en Swift. Si todavía no se escribió, no notificamos:
  /// la captura igual quedó guardada y se drena al abrir la app.
  static func notify(merchant: String, amount: String) {
    guard let raw = UserDefaults.standard.string(forKey: copyKey),
          let data = raw.data(using: .utf8),
          let copy = try? JSONSerialization.jsonObject(with: data) as? [String: String],
          let title = copy["title"],
          let template = copy["bodyTemplate"]
    else { return }

    let content = UNMutableNotificationContent()
    content.title = title
    content.body = template
      .replacingOccurrences(of: "{amount}", with: amount)
      .replacingOccurrences(of: "{merchant}", with: merchant)
    content.sound = .default
    // Lo lee `NotificationRouterBridge`: trae la app al frente en Gastos.
    // El drenaje y la apertura del sheet los hace el host en foreground.
    content.userInfo = ["url": "/(app)/(tabs)/expenses"]

    let request = UNNotificationRequest(
      identifier: UUID().uuidString,
      content: content,
      trigger: nil
    )
    UNUserNotificationCenter.current().add(request)
  }
}
