# Manifiesto Branding

> 🗓️ **Vigente** — guía normativa de referencia. El estado actual del código está en el [snapshot ESTADO-DEL-PROYECTO](../ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md).

## Proposito
La `Home Screen` es la fuente de verdad visual del proyecto. Su lenguaje de interfaz define el branding base de `Manifiesto` y debe reutilizarse en todas las pantallas nuevas y en cualquier refactor visual futuro.

Este documento no describe una pantalla puntual. Define reglas generales de implementacion para mantener una identidad consistente en toda la app.

## Source Of Truth
Archivos de referencia:

- `mobile/screens/home/home-screen.tsx`
- `mobile/components/ui/screen.tsx`
- `mobile/components/ui/icon-button.tsx`
- `mobile/theme/palette.ts`

Si una nueva pantalla necesita una decision visual, primero debe alinearse con estas referencias antes de inventar un patron nuevo.

## Identidad Visual
- La app debe sentirse financiera, premium, clara y moderna.
- El lenguaje visual no es plano. Siempre debe existir profundidad, jerarquia y contraste.
- El look general combina superficies limpias con acentos verdes, glass suave, gradientes controlados y bordes redondeados amplios.
- La interfaz debe transmitir orden, calma y control, no agresividad visual ni ruido.

## Reglas Base

### 1. La Home manda
- Toda pantalla nueva debe derivar del sistema visual de Home.
- Si una pantalla tiene hero, tarjetas, header o bloques de data, debe compartir el mismo ADN visual.
- No crear pantallas con estilos aislados o con una identidad paralela.

### 2. Dark Mode y Light Mode tienen el mismo sistema
- Ambos modos deben sentirse parte del mismo producto.
- `Dark mode` no es una version distinta: es la misma UI con otra luminosidad.
- `Light mode` no puede quedar lavado ni plano.
- `Dark mode` no puede perder legibilidad por exceso de glow o contraste insuficiente.

### 3. Siempre debe haber separacion de planos
- El fondo, las cards y los elementos internos no pueden mezclarse entre si.
- En `light mode`, si el fondo y las cards son demasiado blancos, hay que reforzar:
  - borde
  - sombra
  - variacion tonal de la superficie
  - reduccion de glows de fondo
- En `dark mode`, la separacion se logra con:
  - superficies profundas
  - bordes oscuros definidos
  - brillos y glows muy controlados

## Fondo y Canvas General
- El fondo general debe ser sutil y atmosferico.
- Se permiten glows decorativos grandes y suaves, pero nunca deben competir con el contenido.
- Los glows del fondo existen para dar ambiente, no para robar protagonismo.
- El contenido principal siempre debe leerse primero que la decoracion.
- En `light mode`, el canvas debe quedar un poco mas frio o mas gris/verde que las cards para que estas se distingan.

## Superficies y Cards
- Las cards son el elemento principal del branding.
- Deben usar radios amplios, bordes suaves y cierta elevacion.
- Evitar cajas planas sin profundidad.
- Las cards principales pueden usar gradientes suaves y decoracion interna.
- Las cards secundarias deben seguir el mismo sistema, aunque con menor intensidad.

Reglas concretas:
- `Hero cards`: mayor presencia, mejor gradiente, glow interno o decoracion sutil, sombra mas fuerte.
- `Section cards`: misma familia visual, pero mas contenidas.
- `Accent cards`: usar el mismo sistema con acento cromatico puntual, sin romper el branding.

## Gradientes
- Los gradientes deben ser suaves, amplios y limpios.
- No usar cambios bruscos ni saturacion excesiva.
- El verde es el acento principal de marca.
- Los tonos de warning y danger se usan solo para estados, alertas o señales funcionales.
- Los gradientes deben ayudar a construir superficie, no parecer ilustracion.

## Bordes
- Los bordes existen para separar planos.
- En `light mode`, el borde debe tener suficiente presencia para despegar la card del fondo.
- En `dark mode`, el borde debe apoyar la estructura sin verse duro ni gris por defecto.
- Evitar bordes completamente invisibles.

## Sombras
- Las sombras son obligatorias cuando ayudan a separar planos.
- En `light mode`, las cards necesitan sombra real, aunque suave.
- En `dark mode`, las sombras deben ser mas discretas y apoyarse mas en superficie y glow.
- No usar sombras negras duras o artificiales.

## Header
- El header define tono de pantalla y debe sentirse premium.
- El saludo o titulo principal debe poder variar dinamicamente segun `theme`.
- Los iconos del header deben variar dinamicamente segun `theme`.
- Los botones del header deben compartir forma, tamano y presencia visual.
- El header nunca debe parecer un bloque generico de sistema operativo.

Reglas del header:
- Titulos grandes, fuertes y con alta jerarquia.
- Color adaptado a `light` y `dark`.
- Botones circulares con borde, fondo y color de icono consistentes con el modo.
- Estados especiales, como notificaciones, deben usar color funcional claro.

## Notificaciones
- Cuando existan notificaciones, la campana debe comunicarlo explicitamente.
- El indicador debe ser rojo, chico, claro y visible.
- No depender de un badge negro o ambiguo.
- La señal debe leerse de inmediato tanto en `light mode` como en `dark mode`.

## Tipografia
- La jerarquia tipografica debe ser fuerte.
- Los titulos principales usan peso alto y tracking apretado.
- Los subtitulos y helpers deben ser claros pero secundarios.
- El texto auxiliar nunca debe competir con los totales o valores financieros.
- Las pantallas deben evitar exceso de texto visible si no aporta.

## Color
- Verde = direccion principal de marca.
- Azul, amarillo y rojo pueden convivir dentro del lenguaje de datos, especialmente en visualizaciones financieras.
- Danger debe reservarse para error, alerta o notificacion.
- Warning debe reservarse para friccion o atencion.
- El color nunca debe usarse como decoracion arbitraria.

## Data Visualization
- Los graficos deben sentirse parte del producto, no un widget pegado.
- Las visualizaciones de Home marcan la referencia de calidad:
  - centro claro
  - anillo o barra con color fuerte
  - leyendas integradas a la superficie
  - profundidad mediante glow controlado
  - buena lectura en ambos modos
- Toda visualizacion futura debe respetar esta misma calidad visual.

## Layout y Espaciado
- El layout debe respirar, pero no desperdiciar espacio.
- La separacion entre bloques debe ser consistente.
- Dentro de una misma card, la distancia entre titulo, valor, visualizacion y leyenda debe sentirse intencional.
- Evitar gaps grandes sin razon.
- Evitar bloques tan comprimidos que pierdan aire.

## Botones e Iconografia
- Los iconos no son ornamentales: deben guiar.
- Los botones circulares del header son una pieza de marca y deben mantenerse.
- La iconografia debe verse nitida y con contraste correcto segun el modo.
- Si un icono cambia de significado por estado, el cambio debe ser explicito.

## Tono de UI
- La app no debe verse corporativa fria ni fintech generica.
- Tampoco debe verse juguetona o demasiado experimental.
- El tono correcto es:
  - limpio
  - preciso
  - financiero
  - amigable
  - con personalidad visual

## Lo Que No Se Debe Hacer
- No usar pantallas blancas con cards blancas sin separacion.
- No inventar otra familia de radios, bordes o sombras.
- No mezclar estilos glass fuertes con pantallas planas sin criterio.
- No usar un `light mode` neutro que pierda la identidad lograda en `dark mode`.
- No introducir componentes que parezcan externos al producto.
- No crear headers que ignoren el sistema de Home.
- No usar badges oscuros para estados de alerta si el estado debe llamar la atencion.

## Checklist de Implementacion
Cada pantalla nueva debe validar esto antes de considerarse terminada:

- Usa el mismo sistema de fondo/superficie que Home.
- Mantiene consistencia entre `light mode` y `dark mode`.
- Tiene cards con suficiente separacion respecto del fondo.
- Respeta el sistema de bordes, gradientes y sombras.
- Usa tipografia con jerarquia clara.
- Mantiene header, iconos y acciones dentro del mismo lenguaje.
- Si hay estados importantes, se comunican con color funcional claro.
- Si hay visualizaciones, se integran al branding y no se ven ajenas.
- No introduce un patron visual que contradiga Home.

## Regla Final
Si una decision visual genera duda, la respuesta por defecto es:

`seguir el criterio de Home y adaptar desde ahi`

La Home ya define el branding del proyecto. El resto de la app debe expandir ese sistema, no reemplazarlo.

<!-- ✓ Contrastado contra código el 2026-05-22 -->
