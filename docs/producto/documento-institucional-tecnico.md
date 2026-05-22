# Manifiesto

> 🗓️ **Doc de producto — sincronizado contra código el 2026-05-22.** Conserva la visión/intención de producto. Para el **estado REAL y actual** (cada vista, componente, servicio) la fuente de verdad es el [snapshot ESTADO-DEL-PROYECTO](../ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md).

## Documento Institucional Técnico

Versión basada en el estado actual del código de `Manifiesto Mobile`.

---

## 1. Resumen ejecutivo

`Manifiesto` es una aplicación mobile-first para la gestión de gastos familiares compartidos. Su propósito es ayudar a un hogar a registrar, entender y anticipar su situación financiera cotidiana sin exigir conocimiento técnico ni financiero avanzado.

La app no está pensada como una planilla ni como un dashboard frío de métricas. Está diseñada para traducir información dispersa del hogar en decisiones operativas simples:

- cuánto hay disponible ahora,
- cuánto conviene gastar hoy,
- qué compromisos fijos están presionando el ciclo,
- qué categorías o hábitos están desviando el cierre del mes,
- y qué acción concreta debería tomar el usuario.

En términos de producto, `Manifiesto` combina registro transaccional, coordinación familiar y lectura financiera práctica en una misma experiencia móvil.

---

## 2. Naturaleza del producto

`Manifiesto` es una app de finanzas compartidas orientada a hogares, parejas o grupos familiares que administran gastos en común.

Su unidad principal no es la persona aislada, sino la `familia` como espacio operativo compartido. Cada usuario pertenece a una sola familia activa dentro del modelo actual y opera sobre una misma base de gastos, categorías, compromisos y parámetros financieros.

El sistema fue concebido para:

- centralizar gastos del hogar,
- sincronizar la información entre integrantes,
- ordenar el seguimiento del ciclo de cobro,
- separar gastos variables de compromisos fijos,
- y ofrecer una capa de interpretación financiera accionable.

---

## 3. Público objetivo

La aplicación está dirigida principalmente a:

- parejas que comparten gastos del hogar,
- familias que necesitan una visión única de ingresos, gastos y compromisos,
- personas que administran un presupuesto doméstico conjunto,
- usuarios no expertos en finanzas que necesitan claridad operativa más que terminología técnica.

El diseño del producto asume que el usuario principal:

- usa el teléfono como dispositivo principal,
- necesita resolver tareas rápidas con una mano,
- no quiere navegar tablas complejas ni reportes extensos,
- y necesita respuestas concretas antes que indicadores abstractos.

---

## 4. Problema que resuelve

En la administración cotidiana del hogar suelen coexistir cuatro problemas:

1. La información financiera está fragmentada entre personas, chats, notas o memoria.
2. Los gastos variables y los compromisos fijos se mezclan sin una lectura clara del impacto real.
3. El hogar sabe cuánto gastó, pero no necesariamente entiende cómo llega al cierre del ciclo.
4. La toma de decisión diaria se hace sin contexto: no queda claro cuánto se puede gastar hoy ni qué rubros están tensionando el presupuesto.

`Manifiesto` resuelve ese problema transformando la economía del hogar en un sistema compartido, persistente y legible.

---

## 5. Intención del producto

La intención central de `Manifiesto` es convertir datos financieros domésticos en `criterio de acción`.

Eso se expresa en cuatro objetivos concretos:

- dar una foto rápida del hogar en el momento presente,
- sostener un registro simple y confiable de gastos,
- anticipar desvíos antes de que se conviertan en un problema de cierre,
- y ordenar conversaciones familiares sobre dinero con una fuente común de verdad.

No busca reemplazar una contabilidad formal ni una herramienta corporativa. Busca ser un sistema práctico de control financiero cotidiano para un hogar real.

---

## 6. Propuesta de valor

La propuesta de valor de `Manifiesto` se apoya en estos diferenciales:

- `Unidad familiar compartida`: todos operan sobre la misma estructura de datos.
- `Visión operativa`: la app prioriza disponibilidad, presión del ciclo y decisiones del día.
- `Modelo híbrido`: combina gastos cargados manualmente con compromisos fijos estructurados.
- `Lectura anticipatoria`: no solo muestra el pasado; proyecta el cierre y sugiere ajustes.
- `Experiencia mobile-first`: pensada desde el teléfono, no adaptada desde web.
- `Lenguaje simple`: la interfaz traduce conceptos financieros a copy entendible para usuarios no especializados.

---

## 7. Alcance funcional actual

### 7.1 Acceso y autenticación

La app permite:

- inicio de sesión con email y contraseña,
- registro de nuevas cuentas,
- confirmación por email cuando la sesión no se crea inmediatamente,
- persistencia de credenciales biométricas para accesos posteriores,
- manejo de deep links para callback de autenticación.

El acceso se organiza en dos estados:

- usuario sin sesión,
- usuario autenticado pero todavía sin familia asociada.

### 7.2 Creación o unión a familia

Una vez autenticado, el usuario puede:

- crear una familia nueva,
- o unirse a una familia existente mediante código.

La familia es el contenedor central del producto. Al crear una familia se generan categorías iniciales por defecto y se habilita el espacio compartido de operación.

### 7.3 Home / panorama del hogar

La pantalla principal ofrece una lectura inmediata del estado del hogar:

- disponible actual,
- fecha o proximidad del próximo cobro,
- ahorro remanente,
- gasto variable del ciclo,
- carga de gastos fijos,
- y actividad reciente.

También incorpora la confirmación de cobro cuando el ciclo salarial cambió y todavía no fue validado por el usuario.

### 7.4 Carga de gastos

La app permite registrar gastos variables con:

- descripción,
- monto,
- categoría,
- sugerencias rápidas de texto,
- y montos sugeridos para acelerar la carga.

Cuando se crea un gasto, el sistema invalida los snapshots relevantes y puede disparar notificaciones push para el grupo familiar.

### 7.5 Historial y administración de categorías

El historial permite:

- consultar gastos por período,
- filtrar por categoría,
- buscar por texto,
- editar gastos existentes,
- eliminar gastos,
- crear categorías,
- renombrarlas,
- y gestionar su uso dentro del filtro actual.

### 7.6 Gastos fijos y compromisos

El dominio de gastos fijos estructura compromisos del hogar en cuatro clases:

- `recurrentes`,
- `periódicos`,
- `cuotas`,
- `deuda`.

Cada compromiso puede tener frecuencia, estado, próxima fecha, notas, categoría asociada y, según el tipo, datos específicos como cuotas o saldo restante.

La pantalla de gastos fijos permite:

- crear nuevos compromisos,
- editarlos,
- pausarlos o reactivarlos,
- registrar pagos,
- y eliminar registros cuando corresponde.

### 7.7 Control / insights

La sección `Control` es la capa de inteligencia operativa del producto. No se limita a mostrar números: intenta responder qué debería mirar o hacer el usuario.

Se organiza en tres vistas:

- `Hoy`: presupuesto diario, margen disponible y presión inmediata.
- `Plan`: focos concretos, proyección del cierre y sugerencias.
- `Meses`: historia del comportamiento reciente y presión del ciclo.

### 7.8 Notificaciones

La app contempla notificaciones familiares y push mobile:

- feed de notificaciones persistidas en base,
- actualización en tiempo real para nuevas notificaciones,
- y envío de push mediante Expo Push / Supabase Edge Function.

### 7.9 Ajustes

La pantalla de ajustes concentra:

- identidad básica del usuario,
- preferencia visual,
- métricas financieras del hogar,
- activación de notificaciones push,
- acceso al código de familia,
- y cierre de sesión.

---

## 8. Núcleo conceptual del dominio

El núcleo funcional de `Manifiesto` se organiza alrededor de estas entidades:

- `families`: representa el hogar compartido.
- `family_members`: vincula usuarios con una familia.
- `profiles`: almacena identidad mínima del usuario.
- `categories`: clasifica gastos dentro de la familia.
- `expenses`: registra gastos variables o pagos asociados a compromisos.
- `family_finance`: guarda los parámetros estructurales del hogar.
- `fixed_expenses`: modela compromisos fijos, cuotas y deudas.
- `notifications`: persiste eventos comunicables al grupo.
- `push_subscriptions`: registra endpoints de notificación push.

Desde negocio, estas entidades responden a una idea simple:

`una familia comparte una sola lectura financiera operativa, construida desde gastos reales, compromisos fijos y reglas del ciclo de cobro`.

---

## 9. Lógica financiera central

La app no funciona solo como registro de egresos. Tiene una capa explícita de modelado financiero.

### 9.1 Ciclo de cobro

El sistema calcula el ciclo vigente a partir de:

- `salary_payment_day`,
- fecha actual,
- y `last_salary_confirmed_at`.

Si llegó el nuevo cobro pero todavía no fue confirmado, la app trata ese evento como pendiente y ajusta la lectura del ciclo para no abrir uno nuevo prematuramente.

### 9.2 Snapshot financiero familiar

El snapshot principal del hogar combina:

- ingreso mensual,
- objetivo de ahorro,
- gastos variables del ciclo,
- presión de compromisos fijos,
- pagos asociados a compromisos,
- y disponibilidad total.

Esto permite construir una visión operativa consistente para Home, Control, Settings y otras pantallas sin recalcular lógicas divergentes.

### 9.3 Presupuesto diario

La app calcula un `daily budget` en base a:

- ingreso,
- ahorro objetivo,
- carga fija del ciclo,
- días del ciclo,
- gasto acumulado,
- y un colchón opcional (`buffer`) fijo o porcentual.

El resultado no es solo un número: se convierte en estado, sugerencias y margen diario interpretable.

### 9.4 Analítica y proyección

Sobre los gastos variables, el sistema calcula:

- ritmo de gasto,
- diferencia respecto de semanas previas,
- categoría dominante,
- señales recurrentes,
- gasto proyectado al cierre,
- disponible proyectado,
- y tope diario recomendado.

Esta información alimenta la sección de `Control` y convierte historial en proyección.

### 9.5 Compromisos fijos

Los gastos fijos no se tratan como simples etiquetas. La app distingue tipos de compromiso, su frecuencia, su estado y su impacto sobre el ciclo. Además, permite registrar pagos concretos que pueden generar gastos asociados en el historial.

---

## 10. Flujos principales de usuario

Los flujos troncales actuales son:

1. Crear cuenta o iniciar sesión.
2. Crear familia o unirse con código.
3. Configurar ingreso, ahorro, dólar y día de cobro.
4. Registrar gastos variables del hogar.
5. Definir compromisos fijos, cuotas o deuda.
6. Consultar Home para ver disponibilidad y actividad reciente.
7. Consultar Control para decidir cómo sigue el ciclo.
8. Recibir notificaciones o alertas cuando hay actividad del grupo.

---

## 11. Arquitectura funcional y técnica

La app sigue una arquitectura por capas orientada a mobile:

- `app/`: rutas delgadas con Expo Router.
- `mobile/screens/`: orquestación de pantallas.
- `mobile/features/`: lógica de aplicación y dominio por módulo.
- `mobile/components/`: componentes UI y componentes presentacionales de dominio.
- `mobile/lib/`: infraestructura compartida.
- `mobile/utils/`: helpers puros transversales.

### Stack principal

- `Expo + React Native + TypeScript`
- `Expo Router`
- `TanStack React Query`
- `Supabase`
- `Expo Notifications`
- `Edge Functions en Supabase`

### Principios técnicos vigentes

- pantallas delgadas,
- reglas de negocio fuera de las screens,
- queries y mutations encapsuladas en features,
- snapshots derivados reutilizables,
- server state gestionado con React Query,
- y experiencia optimizada para teléfono.

---

## 12. Backend y persistencia

El backend de `Manifiesto` está montado sobre `Supabase` e incluye:

- autenticación,
- base PostgreSQL,
- políticas RLS,
- funciones RPC,
- y Edge Functions.

### RPCs relevantes

- `bootstrap_family`: crea la familia inicial del usuario autenticado.
- `create_family_invite`: genera un código de invitación de un solo uso.
- `peek_family_invite`: previsualiza la familia asociada a un código de invitación.
- `consume_family_invite`: incorpora al usuario a una familia existente mediante código.
- `record_fixed_expense_payment`: registra el pago de un compromiso fijo.
- `home_snapshot`: bundlea en una sola RPC el snapshot principal del hogar.
- `gastos_snapshot`: bundlea datos del módulo de gastos en una sola RPC.

### Persistencia y sincronización

La app usa React Query para:

- cachear consultas,
- invalidar datos de forma granular,
- recomponer pantallas desde snapshots compartidos,
- y evitar fetches redundantes.

Para notificaciones, además, existe escucha realtime sobre inserciones en la tabla `notifications`.

---

## 13. Integraciones y capacidades complementarias

### 13.1 Push mobile

La app soporta push notifications mediante:

- `Expo Push Tokens`,
- almacenamiento en `push_subscriptions`,
- y una Edge Function (`send-family-push`) que resuelve el envío.

### 13.2 Biometría

La autenticación contempla guardado de credenciales para acceso biométrico en dispositivos compatibles.

### 13.3 Deep linking

La app usa el esquema:

`manifiesto://`

El callback de autenticación entra por:

`manifiesto://auth/callback`

---

## 14. Criterio de UX y diseño de producto

`Manifiesto` está pensado como producto `touch-first` y `thumb-friendly`.

Sus decisiones de UX responden a estos criterios:

- una pantalla debe responder una pregunta clara,
- la información debe bajar a una acción,
- el lenguaje debe ser operativo y no académico,
- el usuario debe entender si va bien o mal sin interpretar métricas abstractas,
- y la app debe ser usable por personas no expertas en finanzas.

En diseño visual, el producto separa claramente:

- una capa más expresiva de `auth/onboarding`,
- y una capa operativa, clara y orientada a decisión para la app autenticada.

---

## 15. Estado actual del producto

El alcance mobile implementado cubre de forma principal:

- autenticación,
- creación o unión a familia,
- dashboard del hogar,
- registro e historial de gastos,
- categorías,
- gastos fijos,
- insights operativos,
- notificaciones,
- ajustes,
- dark mode,
- y push mobile vía Expo.

El código web heredado (`legacy-web-src/`) fue eliminado del repositorio el 2026-05-22 junto con el resto del dead code. No forma parte del build ni del historial activo del producto.

---

## 16. Lectura institucional del proyecto

Desde una mirada institucional, `Manifiesto` puede definirse como:

> una plataforma móvil de coordinación financiera doméstica que convierte el movimiento económico del hogar en una lectura compartida, accionable y continua.

Su valor no reside únicamente en registrar gastos, sino en ofrecer una estructura común para que un hogar:

- vea lo mismo,
- interprete lo mismo,
- y actúe sobre una base común.

En otras palabras, `Manifiesto` no es solo un expense tracker. Es un sistema de control operativo para la economía cotidiana del hogar.

---

## 17. Fuentes técnicas relevadas para este documento

Este documento fue redactado a partir de la revisión directa del código y la documentación actual del repositorio, especialmente:

- `README.md`
- `docs/producto/branding.md`
- `app/`
- `mobile/screens/`
- `mobile/features/`
- `mobile/hooks/use-family-dashboard.ts`
- `sql/supabase.sql`
- `supabase/functions/send-family-push/index.ts`

---

## 18. Documentos complementarios

Este documento se complementa con:

- [BRIEF_UI_UX_MANIFIESTO.md](brief-ui-ux.md): brief de handoff para diseño UI/UX.
- [FLUJOS_Y_FUNCIONAMIENTO_APP.md](flujos-y-funcionamiento.md): detalle funcional de journeys, rutas y comportamiento real de la app.
- [BRANDING.md](branding.md): lineamientos visuales y criterio de identidad.
- [CODE_RULES.md](../arquitectura/code-rules.md): reglas de arquitectura, UX mobile, accesibilidad y calidad de implementación.

<!-- ✓ Contrastado contra código el 2026-05-22 -->
