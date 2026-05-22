# Manifiesto

> 🗓️ **Doc de producto — sincronizado contra código el 2026-05-22.** Conserva la visión/intención de producto. Para el **estado REAL y actual** (cada vista, componente, servicio) la fuente de verdad es el [snapshot ESTADO-DEL-PROYECTO](../ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md).

## Brief para Diseñador UI/UX

Documento de handoff para diseño de producto, UX y UI, basado en el estado real del código actual.

---

## 1. Para qué sirve este brief

Este documento está pensado para que una persona de UI/UX pueda entrar al proyecto con contexto suficiente para diseñar con criterio, sin depender solo de capturas sueltas o de una explicación oral.

Debe leerse junto con:

- [DOCUMENTO_INSTITUCIONAL_TECNICO.md](documento-institucional-tecnico.md)
- [BRANDING.md](branding.md)
- [CODE_RULES.md](../arquitectura/code-rules.md)

Rol de cada documento:

- `DOCUMENTO_INSTITUCIONAL_TECNICO.md`: explica qué es el producto, para quién existe y cuál es su core.
- `BRANDING.md`: define el lenguaje visual y el criterio estético.
- `CODE_RULES.md`: fija restricciones funcionales, UX mobile, estados, accesibilidad y arquitectura UI.
- `Este brief`: traduce todo eso a una guía práctica para diseño.

---

## 2. Qué es Manifiesto

`Manifiesto` es una app mobile-first para la gestión de gastos familiares compartidos.

No es solo una app para “anotar gastos”. Su objetivo es darle a un hogar una lectura compartida, práctica y accionable de su situación financiera cotidiana.

El producto busca responder preguntas concretas:

- cuánto hay disponible ahora,
- cuánto conviene gastar hoy,
- qué compromisos fijos están empujando el ciclo,
- qué hábitos o categorías están desordenando el cierre,
- y qué debería hacer el usuario a continuación.

---

## 3. Para quién está diseñada

### Usuario principal

El usuario central no es un analista financiero ni una persona obsesionada con planillas. Es alguien que:

- usa el teléfono como dispositivo principal,
- comparte gastos con otra persona o con su hogar,
- necesita claridad más que profundidad técnica,
- y toma decisiones rápidas en contexto cotidiano.

### Segmentos naturales

- parejas que administran gastos en conjunto,
- hogares que necesitan un sistema común,
- personas que quieren control sin complejidad contable,
- usuarios que necesitan una interfaz clara, guiada y operativa.

### Implicancia para diseño

Diseñar para `Manifiesto` no es diseñar para un usuario experto que disfruta métricas densas. Es diseñar para alguien que necesita orientación rápida, lenguaje claro y buena jerarquía de decisiones.

---

## 4. Qué problema resuelve

El problema que resuelve la app no es solo el registro.

Resuelve esta combinación:

- la economía del hogar está repartida entre personas y canales,
- los gastos variables y los compromisos fijos se mezclan,
- el hogar no sabe leer el impacto real del ciclo,
- y las decisiones diarias se toman sin contexto.

`Manifiesto` transforma eso en una experiencia donde el hogar ve una sola verdad compartida.

---

## 5. Qué tiene que transmitir la experiencia

La experiencia de producto debe comunicar:

- `orden`
- `control`
- `calma`
- `claridad`
- `toma de decisión`

No debe sentirse como:

- fintech genérica,
- planilla maquillada,
- app contable técnica,
- dashboard recargado de KPIs,
- o sistema corporativo frío.

### Tono correcto

La app debe sentirse:

- financiera,
- humana,
- premium sin ostentación,
- práctica,
- clara,
- y con criterio editorial.

---

## 6. Qué tiene que entender rápido el diseñador

Hay dos mundos visuales claramente diferenciados:

### 6.1 Auth / onboarding

Este mundo puede ser más expresivo, más teatral y más “marca”.

Incluye:

- splash,
- login,
- signup,
- acceso biométrico,
- entrada al producto.

### 6.2 App operativa

Este es el corazón del producto autenticado.

Incluye:

- Inicio,
- Gastos,
- Agregar,
- Fijos,
- Control,
- Notificaciones,
- Ajustes.

Este mundo debe priorizar:

- legibilidad,
- estructura,
- jerarquía,
- foco en números clave,
- y decisiones concretas.

Los recursos visuales del mundo `auth` no deben contaminar la app operativa.

---

## 7. Mapa de navegación actual

### 7.1 Gate principal

Al abrir la app:

1. Si no hay sesión, el usuario va a `Login`.
2. Si hay sesión pero no familia, va a `Join/Create Family`.
3. Si hay sesión y familia, entra a `Home`.

### 7.2 Tabs principales

La app autenticada se organiza en cinco tabs:

- `Inicio`
- `Gastos`
- `Agregar`
- `Fijos`
- `Control`

### 7.3 Rutas secundarias

Además de los tabs, hay pantallas stack:

- `Agregar gasto` como ruta/pantalla modal desde el FAB central.
- `Notificaciones`
- `Ajustes`
- `Historial de gastos` como pantalla dedicada cuando aplica.

### 7.4 Implicancia UX

La navegación principal ya está bastante definida. El trabajo de diseño no debería reinventar la estructura sin una razón fuerte; debería mejorar claridad, densidad, priorización y continuidad visual.

---

## 8. Qué quiere resolver el usuario en cada pantalla

### 8.1 Login

Pregunta principal:

`¿Cómo entro rápido y sin fricción?`

Debe priorizar:

- confianza,
- claridad de acceso,
- feedback inmediato,
- y transición suave al mundo del producto.

### 8.2 Join / Create Family

Pregunta principal:

`¿Cómo entro al hogar correcto o creo uno nuevo?`

Debe ser extremadamente claro que hay dos caminos:

- unirme con código,
- crear mi familia.

### 8.3 Inicio

Pregunta principal:

`¿Cómo está el hogar ahora mismo?`

Debe mostrar:

- disponible actual,
- presión del ciclo,
- carga fija,
- ahorro,
- actividad reciente.

### 8.4 Gastos

Pregunta principal:

`¿En qué gastamos y cómo encuentro o corrijo un movimiento?`

Debe facilitar:

- lectura del historial,
- filtrado,
- búsqueda,
- edición,
- borrado,
- y gestión básica de categorías.

### 8.5 Agregar gasto

Pregunta principal:

`¿Cómo cargo un gasto en segundos y con poco esfuerzo?`

Debe sentirse:

- rápido,
- táctil,
- con sugerencias inteligentes,
- y con consecuencia clara sobre el presupuesto.

### 8.6 Fijos

Pregunta principal:

`¿Qué compromisos del hogar tengo activos y cómo los administro?`

Debe ayudar a distinguir:

- recurrentes,
- periódicos,
- cuotas,
- deuda.

### 8.7 Control

Pregunta principal:

`¿Qué debería mirar o hacer hoy para cerrar mejor el ciclo?`

Esta es la pantalla más “producto” del sistema. No es solo reporting. Es síntesis, criterio y orientación.

### 8.8 Notificaciones

Pregunta principal:

`¿Qué pasó recientemente en el hogar?`

Debe sentirse como timeline clara, escaneable y confiable.

### 8.9 Ajustes

Pregunta principal:

`¿Cómo administro mi identidad, las reglas del hogar y las preferencias clave?`

Debe sentirse ordenada, clara y parecida a una pantalla de ajustes del sistema, pero con personalidad de producto.

---

## 9. Entidades de negocio que impactan diseño

Estas son las piezas del dominio que más afectan IA, copy, estructura y UX:

- `Familia`: unidad compartida principal.
- `Miembro`: usuario dentro de una familia.
- `Categoría`: agrupador de gasto variable.
- `Gasto`: movimiento variable registrado por un miembro.
- `Gasto fijo`: compromiso estructural del hogar.
- `Ciclo de cobro`: período sobre el que se calcula la economía del hogar.
- `Ingreso mensual`: base del ciclo.
- `Ahorro objetivo`: porción reservada.
- `Colchón / buffer`: margen defensivo para el presupuesto diario.
- `Disponible`: dinero operativo restante.

Diseñar sin entender estos conceptos produce UI bonita pero equivocada.

---

## 10. Reglas UX que no se deberían romper

Estas reglas no son sugerencias blandas: son criterios base del producto.

### 10.1 Mobile-first real

- La app se piensa para teléfono, no para desktop ni responsive web.
- Las acciones frecuentes deben quedar en zonas cómodas del pulgar.
- Los flows principales deben poder resolverse rápido.

### 10.2 Una pregunta por pantalla

Cada pantalla tiene que responder una pregunta clara.

Si una propuesta de rediseño mezcla demasiados objetivos en una sola pantalla, probablemente empeora el producto.

### 10.3 La acción importa más que la decoración

Los números deben llevar a interpretación y a una acción.

### 10.4 Feedback táctil y visual

- Estado pressed visible en iOS.
- Ripple nativo en Android.
- Haptics consistentes donde corresponda.

### 10.5 Estados completos

Toda pantalla remota debe contemplar:

- loading,
- error,
- empty,
- content,
- stale/refetch cuando sea relevante.

### 10.6 Accesibilidad y claridad

- labels y roles coherentes,
- targets táctiles reales,
- orden de foco lógico,
- reduced motion respetado,
- color nunca como único indicador.

---

## 11. Qué materiales visuales ya son fuente de verdad

Para cualquier exploración de UI, estas referencias son las más importantes:

- [mobile/screens/home/home-screen.tsx](../../mobile/screens/home/home-screen.tsx)
- [mobile/components/ui/screen.tsx](../../mobile/components/ui/screen.tsx)
- [mobile/components/ui/icon-button.tsx](../../mobile/components/ui/icon-button.tsx)
- [mobile/theme/palette.ts](../../mobile/theme/palette.ts)

La Home actual es la referencia visual principal del producto.

---

## 12. Qué debería producir diseño

Según el alcance del trabajo, un diseñador UI/UX podría entregar:

- revisión heurística de la app,
- propuesta de mejora de flujos,
- redesign de pantallas específicas,
- sistema de estados y componentes,
- lineamientos de copy UX,
- mejora de navegación o jerarquía,
- y especificaciones de comportamiento para mobile.

### Entregables ideales

- mapa de navegación,
- user flows,
- wireframes,
- pantallas en alta,
- estados edge,
- especificación de componentes reutilizables,
- y notas explícitas de comportamiento mobile.

---

## 13. Qué no debería asumir diseño sin validarlo

- que la app es solo un tracker simple,
- que el foco está en reportes históricos largos,
- que el usuario quiere profundidad financiera técnica,
- que se puede romper la lógica de familia compartida,
- que el flujo principal es individual y no compartido,
- que la estructura de tabs debe cambiar de entrada,
- o que los compromisos fijos son equivalentes a categorías.

---

## 14. Qué debería mirar sí o sí antes de proponer cambios

- el contexto de producto,
- el branding actual,
- las reglas de UX mobile,
- la Home como pantalla de referencia,
- la diferencia entre gastos variables y compromisos fijos,
- la lógica del ciclo de cobro,
- y los estados de error / empty / loading.

---

## 15. Recomendación de uso de este brief

El uso ideal es:

1. leer este brief,
2. leer [DOCUMENTO_INSTITUCIONAL_TECNICO.md](documento-institucional-tecnico.md),
3. revisar [BRANDING.md](branding.md),
4. revisar [CODE_RULES.md](../arquitectura/code-rules.md),
5. ver el anexo [FLUJOS_Y_FUNCIONAMIENTO_APP.md](flujos-y-funcionamiento.md),
6. recién después empezar exploración de rediseño o propuesta.

---

## 16. Resumen corto para diseño

Si hubiera que condensar `Manifiesto` en una sola idea para diseño, sería esta:

> Diseñar una app que ayude a un hogar a entender su plata compartida y decidir mejor, desde el teléfono, con claridad, calma y dirección operativa.

<!-- ✓ Contrastado contra código el 2026-05-22 -->

