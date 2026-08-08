import AppIntents
import Foundation

/// Acción de Atajos "Registrar gasto".
///
/// Vive en el TARGET PRINCIPAL, no en el módulo Expo: los módulos Expo
/// compilan como Pod (librería estática) y un App Intent dentro de una
/// librería estática puede no ser indexado por el `appintentsmetadataprocessor`
/// de Apple, con lo cual la acción nunca aparecería en Atajos. El config
/// plugin `plugins/with-apple-pay-intent.cjs` copia este archivo a
/// `ios/<App>/` y lo suma al build phase de Sources en cada prebuild.
///
/// El monto NO se parsea acá: viaja como `String` crudo hasta JS, que sabe
/// distinguir `$4.500,00` de `$4,500.00` según la locale. Swift no tiene
/// forma de saber con qué formato lo entregó el disparador.
@available(iOS 16.0, *)
struct ManifiestoLogExpenseIntent: AppIntent {
  static var title: LocalizedStringResource = "Registrar gasto"
  static var description = IntentDescription(
    "Guarda un pago de Apple Pay para confirmarlo en Manifiesto."
  )
  // No abre la app: corre en background al pagar.
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Monto")
  var amount: String

  @Parameter(title: "Comercio")
  var merchant: String

  static var parameterSummary: some ParameterSummary {
    Summary("Registrar \(\.$amount) en \(\.$merchant)")
  }

  func perform() async throws -> some IntentResult {
    ManifiestoCaptureStore.append(merchantRaw: merchant, amountRaw: amount)
    ManifiestoCaptureStore.notify(merchant: merchant, amount: amount)
    return .result()
  }
}
