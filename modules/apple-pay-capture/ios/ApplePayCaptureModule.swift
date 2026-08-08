import ExpoModulesCore
import Foundation

// Puente de LECTURA nada más. El App Intent no vive acá a propósito:
// los módulos Expo compilan como Pod y un App Intent dentro de una
// librería estática puede no ser indexado por Apple. Ver
// `plugins/apple-pay-intent/ManifiestoLogExpenseIntent.swift`.
public class ApplePayCaptureModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ApplePayCapture")

    Function("getPendingCaptures") { () -> [[String: String]] in
      return ManifiestoCaptureStore.read()
    }

    Function("clearCaptures") { (ids: [String]) -> Void in
      // Borrado por id, no un clear() ciego: una captura que entre
      // entre la lectura y el borrado tiene que sobrevivir.
      let removing = Set(ids)
      let remaining = ManifiestoCaptureStore.read().filter { entry in
        guard let id = entry["id"] else { return false }
        return !removing.contains(id)
      }
      ManifiestoCaptureStore.write(remaining)
    }

    Function("setNotificationCopy") { (copy: [String: String]) -> Void in
      guard let data = try? JSONSerialization.data(withJSONObject: copy),
            let json = String(data: data, encoding: .utf8)
      else { return }
      UserDefaults.standard.set(json, forKey: ManifiestoCaptureStore.copyKey)
    }

    // Espejo del flag de Ajustes: JS lo guarda en el keychain y lo baja
    // acá para que el App Intent, que corre sin JS vivo, sepa si tiene
    // que capturar.
    Function("setCaptureEnabled") { (enabled: Bool) -> Void in
      ManifiestoCaptureStore.setEnabled(enabled)
    }
  }
}
