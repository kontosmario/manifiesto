# Manifiesto

## Flujos y Funcionamiento de la App

Documento funcional detallado del comportamiento actual de `Manifiesto Mobile`, basado en el código vigente.

---

## 1. Objetivo de este documento

Este documento existe para describir:

- cómo entra un usuario a la app,
- qué rutas y estados determinan su navegación,
- cómo se comportan los módulos principales,
- cómo se relacionan los datos entre sí,
- y qué flujos reales componen el producto hoy.

No es una spec teórica. Es una síntesis funcional de la implementación actual.

---

## 2. Vista general del sistema

La app está organizada alrededor de una lógica central:

- un `usuario` se autentica,
- pertenece a una sola `familia`,
- y opera dentro de un espacio compartido de gastos, categorías, compromisos, reglas financieras y notificaciones.

El producto autenticado se apoya sobre tres pilares:

- `registro`: gastos y compromisos,
- `lectura`: home, historial y timeline,
- `interpretación`: control, presupuesto diario y proyecciones.

---

## 3. Modelo de navegación actual

### 3.1 Shell raíz

El layout raíz monta:

- providers globales,
- splash de lanzamiento,
- bridge de notificaciones,
- y stack principal de Expo Router.

### 3.2 Gate de entrada

El punto de entrada real es `AppEntryGate`.

Su lógica es:

1. carga sesión,
2. si hay usuario, carga familia,
3. si no hay sesión, redirige a login,
4. si hay sesión pero no familia, redirige a join,
5. si hay sesión y familia, redirige a home.

### 3.3 Guards

La app usa dos guards principales:

- `RequireAuth`: protege rutas autenticadas y exige sesión + familia.
- `RequireGuest`: protege rutas públicas y evita que un usuario ya listo vuelva a login.

### 3.4 Organización de rutas

#### Grupo auth

- `/(auth)/login`
- `/(auth)/join`
- `/(auth)/filament-spike`

#### Grupo app

- `/(app)/(tabs)/home`
- `/(app)/(tabs)/expenses`
- `/(app)/(tabs)/add`
- `/(app)/(tabs)/fixed-expenses`
- `/(app)/(tabs)/insights`
- `/(app)/add-expense`
- `/(app)/notifications`
- `/(app)/settings`

### 3.5 Tabs principales

La navegación principal autenticada usa cinco tabs:

- `Inicio`
- `Gastos`
- `Agregar`
- `Gastos Fijos`
- `Control`

El tab `Agregar` funciona como FAB central y redirige a la ruta `/(app)/add-expense`.

---

## 4. Entidades de negocio y relación entre sí

### 4.1 Families

Representa el hogar compartido.

Campos principales:

- `id`
- `code`
- `created_at`

### 4.2 Family members

Vincula usuarios con una familia.

Restricción importante:

- cada usuario puede pertenecer a una sola familia activa.

### 4.3 Profiles

Perfil mínimo del usuario autenticado.

Campo principal:

- `display_name`

### 4.4 Categories

Clasificación de gastos variables dentro de la familia.

Campos relevantes:

- `name`
- `color`

### 4.5 Expenses

Movimiento económico cargado por un usuario.

Campos relevantes:

- `category_id`
- `description`
- `price`
- `created_by`
- `created_at`
- `commitment_id` opcional

Un gasto puede ser:

- variable normal,
- o un pago asociado a un compromiso fijo.

### 4.6 Family finance

Parámetros financieros estructurales del hogar.

Campos relevantes:

- `monthly_income`
- `savings_goal`
- `usd_exchange_rate`
- `salary_payment_day`
- `last_salary_confirmed_at`
- `daily_budget_buffer_mode`
- `daily_budget_buffer_value`
- `daily_budget_nudges_enabled`
- `daily_budget_checkin_hour`

### 4.7 Fixed expenses

Compromisos estructurales del hogar.

Tipos actuales:

- `recurring`
- `periodic`
- `installment`
- `debt`

Estados:

- `active`
- `paused`
- `completed`
- `archived`

### 4.8 Notifications

Eventos persistidos para la familia.

Se usan como feed/timeline y además como base de invalidación realtime.

### 4.9 Push subscriptions

Endpoints de push del usuario para la familia.

Soporta:

- `web`
- `expo`

---

## 5. Flujo 1: apertura de la app

### Objetivo del flujo

Determinar rápidamente a qué parte del producto debe ir el usuario.

### Secuencia

1. La app monta providers y splash inicial.
2. Se ejecuta `AppEntryGate`.
3. Se consulta sesión.
4. Si existe `userId`, se consulta membresía familiar.
5. Según resultado:
   - sin sesión -> `login`
   - con sesión y sin familia -> `join`
   - con sesión y familia -> `home`

### Resultado UX esperado

El usuario no debería decidir manualmente “dónde entrar”. El sistema lo ubica solo.

---

## 6. Flujo 2: autenticación

### 6.1 Sign in

#### Datos

- email
- contraseña

#### Comportamiento

1. se validan los campos,
2. se llama a password sign-in,
3. si es exitoso, se dispara feedback háptico,
4. se intentan persistir credenciales para biometría,
5. el usuario vuelve al gate principal y la app lo redirige.

### 6.2 Sign up

#### Datos

- nombre visible
- email
- contraseña
- decisión de flujo posterior:
  - unirme a familia existente,
  - crear familia nueva.

#### Comportamiento

1. se validan datos,
2. se ejecuta sign-up,
3. si Supabase devuelve sesión inmediata:
   - se persisten credenciales biométricas,
   - se navega a `join` o `join?autoCreate=1`.
4. si Supabase requiere confirmación por email:
   - se muestra mensaje informativo,
   - el usuario vuelve a modo sign-in.

### 6.3 Callback de autenticación

La ruta `auth/callback` procesa:

- `code`
- `access_token`
- `refresh_token`

Si el callback se completa correctamente, el usuario vuelve a `/` y el gate resuelve el siguiente paso.

---

## 7. Flujo 3: crear o unirse a una familia

### 7.1 Crear familia

#### Mecanismo

Usa RPC `bootstrap_family`.

#### Secuencia

1. usuario autenticado entra a `Join`.
2. toca `Crear mi familia`.
3. se ejecuta RPC con código sugerido.
4. si la familia se crea bien:
   - se seedéan categorías por defecto si no existen,
   - se invalidan queries relevantes,
   - se vuelve a `/`,
   - el gate ahora redirige a Home.

### 7.2 Unirse con código

#### Mecanismo

Usa RPC `join_family_by_code`.

#### Secuencia

1. usuario escribe código,
2. se normaliza a uppercase,
3. se ejecuta RPC,
4. si la unión es correcta:
   - se invalidan queries de familia, categorías y gastos,
   - se vuelve a `/`,
   - el gate resuelve Home.

### 7.3 Autocreate post signup

Si el signup fue con intención de crear familia, el usuario llega a:

`/(auth)/join?autoCreate=1`

Ese parámetro dispara automáticamente la creación sin necesidad de otro tap.

---

## 8. Flujo 4: Home / panorama del hogar

### Objetivo

Dar una lectura inmediata del estado financiero del hogar.

### Inputs del módulo

Home compone:

- `profile`
- `family dashboard`
- `categories`
- `recent expenses`
- `family finance mutation` para confirmar cobro

### Qué muestra

- saludo personalizado,
- disponible actual,
- información del próximo cobro,
- ahorro remanente,
- gasto variable del ciclo,
- carga de compromisos fijos,
- actividad reciente.

### Comportamiento especial: confirmación de cobro

Si el sistema detecta que:

- ya llegó la fecha de cobro del mes,
- pero `last_salary_confirmed_at` no cubre ese cobro,

entonces marca el estado como `salary pending confirmation`.

Desde Home el usuario puede confirmar el cobro, lo que actualiza `last_salary_confirmed_at` y reestructura el ciclo.

### Estados

- loading del dashboard,
- error del dashboard,
- actividad reciente loading/error,
- content completo.

---

## 9. Flujo 5: agregar gasto

### Objetivo

Permitir la carga más rápida posible de un gasto variable.

### Entrada al flujo

Se accede desde:

- tab central `Agregar`,
- o ruta `/(app)/add-expense`.

### Inputs del flujo

- categorías de la familia,
- gastos previos,
- snapshot financiero del hogar.

### Comportamiento

1. se resuelve categoría activa por default,
2. el usuario completa:
   - descripción,
   - monto,
   - categoría.
3. el sistema ofrece:
   - sugerencias rápidas de descripción según historial y seeds,
   - montos sugeridos,
   - helper contextual con impacto después del gasto.

### Validaciones

- debe existir categoría,
- descripción no vacía,
- monto mayor a cero.

### Persistencia

Se usa `useCreateExpense`.

Al guardar:

- se crea el gasto,
- se invalidan snapshots de presupuesto y pantallas relacionadas,
- se puede enviar push familiar,
- se limpia el formulario,
- se navega de vuelta a `Gastos`.

---

## 10. Flujo 6: historial de gastos

### Objetivo

Permitir lectura, búsqueda, filtrado y corrección de movimientos.

### Entrada al flujo

Puede verse como:

- tab `Gastos`,
- o pantalla `Historial`.

### Capacidades actuales

- ver total filtrado,
- ver breakdown visual,
- agrupar movimientos,
- buscar por texto,
- filtrar por período,
- filtrar por categoría,
- editar gasto,
- borrar gasto,
- administrar categorías.

### Snapshot funcional del historial

El historial arma una snapshot derivada con:

- gastos filtrados,
- grouping,
- total filtrado,
- subtítulo hero,
- breakdown por categoría/período,
- estados de filtros.

### Edición de gasto

Desde una fila:

1. se abre modal de edición,
2. se actualiza descripción/monto,
3. se invalida data relevante,
4. se cierra el modal.

### Borrado de gasto

Desde una fila:

1. se abre confirmación,
2. si se confirma, se borra el gasto,
3. se refrescan snapshots relacionados.

---

## 11. Flujo 7: administración de categorías

### Objetivo

Mantener ordenado el sistema de clasificación del gasto variable.

### Operaciones actuales

- crear categoría,
- renombrar categoría,
- borrar categoría sin gastos,
- seleccionar categoría para filtro,
- seleccionar categoría para administración.

### Restricción importante

Una categoría con gastos cargados no se puede borrar.

### Comportamiento

El modal de categorías muestra:

- categoría seleccionada,
- cantidad de gastos asociados,
- advertencia si no puede borrarse,
- acciones de crear, renombrar y borrar.

---

## 12. Flujo 8: gastos fijos

### Objetivo

Modelar compromisos estructurales del hogar y su impacto sobre el ciclo.

### Tipos de compromiso

- recurrente
- periódico
- cuotas
- deuda

### Qué permite la pantalla

- ver resumen de presión del ciclo,
- segmentar compromisos por sección,
- crear nuevos,
- editar,
- pausar o reactivar,
- registrar pago,
- borrar.

### Comportamiento del editor

El editor está desacoplado como componente presentacional y controlado por un controller de feature.

El flujo de alta/edición resuelve:

- tipo,
- nombre,
- categoría,
- monto,
- fecha próxima,
- frecuencia,
- cuotas totales/pagadas cuando aplica,
- saldo restante y acreedor en deudas,
- fecha de fin opcional,
- notas,
- estado en edición.

### Registro de pago

El sistema usa `record_fixed_expense_payment`.

Esto permite reflejar pagos concretos del compromiso, con impacto posterior en snapshots y lectura del ciclo.

---

## 13. Flujo 9: Control / insights

### Objetivo

Convertir datos del hogar en criterio de acción.

### Estructura

La pantalla se divide en tres secciones:

- `Hoy`
- `Plan`
- `Meses`

### Base de cálculo

`useControlSnapshot` combina:

- dashboard familiar,
- categorías,
- gastos variables,
- daily budget summary,
- analytics de gasto,
- métricas hero,
- acciones sugeridas,
- foco por categoría,
- histórico mensual.

### 13.1 Sección Hoy

Responde:

`¿Cómo viene el día y qué margen tengo ahora?`

Incluye:

- presupuesto diario,
- gasto de hoy,
- margen restante,
- estado de presión,
- acciones sugeridas del día.

### 13.2 Sección Plan

Responde:

`¿Qué me conviene ajustar para no desordenar el cierre?`

Incluye:

- proyección del cierre,
- focos detectados,
- métricas de inteligencia,
- sugerencias accionables.

### 13.3 Sección Meses

Responde:

`¿Cómo se comportó el hogar en el tiempo?`

Incluye:

- ribbon/historia mensual,
- presión del ciclo,
- evolución de balance,
- limpieza total del historial cuando se necesita resetear data.

---

## 14. Flujo 10: notificaciones y timeline

### Objetivo

Mostrar actividad reciente del hogar y responder a eventos push.

### Feed interno

La pantalla `Notificaciones` consulta la tabla `notifications` y muestra hasta 60 eventos.

### Realtime

Existe una suscripción realtime sobre inserts en `notifications`.

Cuando entra un nuevo evento:

- se invalida la query de familia,
- la timeline se refresca.

### Push mobile

El sistema soporta:

- registro de Expo Push Token,
- persistencia en `push_subscriptions`,
- envío desde Edge Function `send-family-push`.

### Push por eventos

Cuando se crea un gasto, la app puede disparar una notificación push al grupo familiar con:

- título,
- cuerpo,
- tipo de evento,
- y URL interna.

### Apertura desde notificación

`NotificationRouterBridge` escucha respuestas a notificaciones y normaliza la ruta interna.

Ejemplos de destino:

- `/home`
- `/expenses`
- `/fixed-expenses`
- `/notifications`
- `/settings`

---

## 15. Flujo 11: nudges de presupuesto diario

### Objetivo

Generar recordatorios locales útiles según el estado del presupuesto diario.

### Condiciones

Solo corre si:

- el dispositivo soporta push nativo,
- el usuario tiene permisos concedidos,
- hay familia activa,
- y los nudges están habilitados.

### Tipos actuales

#### Check-in diario

Se agenda una notificación local para la hora configurada en:

- `daily_budget_checkin_hour`

El mensaje comunica con cuánto arranca el día.

#### Threshold warning

Si el gasto del día supera aproximadamente el 70% del presupuesto de apertura antes de la tarde:

- se programa una notificación inmediata,
- se registra una marca persistente,
- y no se repite varias veces el mismo día.

### Destino

Ambos nudges apuntan a la zona de gastos.

---

## 16. Flujo 12: ajustes

### Objetivo

Centralizar configuración personal y parámetros estructurales del hogar.

### Submódulos actuales

- resumen del hogar,
- perfil,
- apariencia,
- métricas financieras,
- familia,
- cuenta.

### 16.1 Perfil

Permite actualizar `display_name`.

### 16.2 Apariencia

Permite modificar preferencia visual.

### 16.3 Métricas financieras

Permite editar:

- ingreso mensual,
- ahorro objetivo,
- dólar,
- día de cobro,
- buffer del presupuesto diario,
- nudges,
- hora de check-in.

### 16.4 Familia

Permite:

- copiar código familiar,
- activar push,
- navegar a Control,
- abrir la spike técnica de Filament.

### 16.5 Cuenta

Permite cerrar sesión.

---

## 17. Reglas de datos y recálculo

### 17.1 Snapshot central

Muchas pantallas dependen de `useFamilyDashboard`.

Ese hook combina:

- finanzas familiares,
- gastos fijos,
- gastos,
- y produce un snapshot derivado común.

### 17.2 Razón de esta decisión

Esto evita:

- que cada pantalla calcule su propia versión del hogar,
- inconsistencias entre Home, Control y Settings,
- y fetches duplicados de data ya disponible.

### 17.3 Invalidaciones relevantes

Cuando cambia algo importante:

- gastos,
- categorías,
- finanzas,
- compromisos,
- notificaciones,

se invalidan queries específicas para recomponer la app.

---

## 18. Estados de UI por módulo

El producto actual contempla, de forma explícita, estados de:

- loading,
- error,
- empty,
- content.

Pantallas y módulos principales ya tienen `ErrorState`, `LoadingBlock` y `EmptyState` donde aplica.

### Implicancia funcional

El comportamiento de la app no depende de que “haya data”. Está preparada para:

- usuario nuevo,
- data vacía,
- error de red,
- error de permisos,
- datos parciales,
- refetch manual.

---

## 19. Resumen de journeys principales

### Journey A: usuario nuevo que crea hogar

1. abre la app,
2. se registra,
3. confirma acceso o entra directo,
4. llega a join con `autoCreate`,
5. se crea la familia,
6. entra a Home,
7. configura parámetros base,
8. empieza a cargar gastos.

### Journey B: usuario que se une a hogar existente

1. se registra o loguea,
2. entra a Join,
3. ingresa código,
4. queda asociado a la familia,
5. entra a Home,
6. ya ve el contexto compartido.

### Journey C: uso cotidiano

1. abre Home,
2. lee disponibilidad y actividad,
3. carga un gasto,
4. revisa historial o Control,
5. consulta compromisos fijos,
6. recibe timeline/push si hay movimientos.

---

## 20. Qué debe recordar cualquiera que trabaje sobre la app

- La unidad principal es la familia, no el usuario aislado.
- Home no es solo dashboard; es lectura operativa del hogar.
- Control no es reporting; es orientación para decidir.
- Agregar gasto debe seguir siendo rapidísimo.
- Gastos fijos y gastos variables son dominios distintos.
- El ciclo de cobro define gran parte del comportamiento financiero.
- Push, nudges y timeline no son accesorios; son parte de la experiencia de seguimiento.

