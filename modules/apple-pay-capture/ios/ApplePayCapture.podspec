Pod::Spec.new do |s|
  s.name           = 'ApplePayCapture'
  s.version        = '1.0.0'
  s.summary        = 'Lectura de las capturas de Apple Pay que deja el App Intent.'
  s.description    = 'Modulo Expo local: expone a JS las capturas guardadas por la accion de Atajos.'
  s.license        = { :type => 'MIT' }
  s.author         = 'Manifiesto'
  s.homepage       = 'https://manifiestoapp.com'
  s.platforms      = { :ios => '15.5' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # Incluye `ManifiestoCaptureStore.swift`, que ADEMAS se copia al target
  # principal desde `plugins/with-apple-pay-intent.cjs` (ver el comentario
  # largo dentro de ese archivo: un Pod no puede importar el modulo Swift
  # de la app, asi que cada lado compila su copia del mismo fuente).
  s.source_files = '**/*.{h,m,swift}'
end
