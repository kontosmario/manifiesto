# App Store Listing — Source Doc

> **Para qué**: documento fuente para completar los 6 campos de copy en App Store Connect (listing).
> **Cuándo usarlo**: cuando vayas a completar la página del app en App Store Connect → app → Distribución → Versión 1.0.
> **Actualizar cuando**: cambien features mayores del producto, cambie el target de la app, o salga competencia que nos obligue a ajustar posicionamiento.

---

## 0 · Los 6 campos a completar en App Store Connect

| # | Campo | Largo máx | Localizable | Editable post-submit |
|---|---|---|---|---|
| 1 | **Nombre** | 30 chars | Sí (por país) | Solo en nueva versión |
| 2 | **Subtítulo** | 30 chars | Sí | Solo en nueva versión |
| 3 | **Descripción** | 4000 chars | Sí | Solo en nueva versión |
| 4 | **Palabras clave** | 100 chars total | Sí | Solo en nueva versión |
| 5 | **Texto promocional** | 170 chars | Sí | **Sí**, sin re-submit |
| 6 | **Qué hay nuevo** | 4000 chars | Sí | Por versión |

**Estrategia de localización**: arrancamos en es-MX (Spanish Mexico) que cubre LATAM amplio y permite tildes/eñes con vocabulario neutro pero con sabor argentino. Inglés v1.1 si vemos tracción fuera de AR/MX.

---

## 1 · Qué es Manifiesto (en 1 frase)

> **Una app móvil para parejas y familias argentinas que quieren manejar sus finanzas compartidas con claridad, sin planillas y sin pelearse.**

Variantes según contexto:
- **Hero del sitio**: "Finanzas familiares simples y compartidas."
- **Tagline corto** (subtítulo App Store): "Finanzas familiares sin discusiones."
- **Pitch a un amigo**: "Es como Splitwise + YNAB pero hecho para una pareja argentina que tiene pesos, dólares, gastos fijos y quiere ahorrar."

---

## 2 · Target audience

### Primary

- **Parejas argentinas que conviven** (25-45 años)
- **Familias chicas-medianas** con hijos adolescentes o que aportan al pool familiar
- **Roommates serios** que comparten gastos del hogar
- Personas que **tienen ahorros en USD** además de pesos (común en AR)
- Personas que **probaron Excel/Google Sheets** y abandonaron por fricción

### Secondary

- Solteros con control financiero personal (single-mode también soportado)
- Padres que quieren enseñar finanzas a hijos jóvenes
- Personas con freelance income variable mes a mes

### NOT target (de momento)

- Empresas / pymes → Sprint posterior, no v1.0
- Inversores activos (no es brokerage)
- Gente que necesita facturación / impuestos

---

## 3 · Features principales (qué hace la app)

### 3.1 Control mensual claro

- **Hero card** en home: saldo del día, lo que llevás gastado este mes vs lo planificado
- **Plan/budget** por familia (ingresos – gastos fijos – ahorro objetivo)
- **Reserva** ("rainy day fund") separada del balance del mes
- **Cierre de mes** con decisión sobre el sobrante: meta, reserva, ciclo siguiente o skip

### 3.2 Gastos compartidos

- **Carga rápida** (4 taps desde home)
- **Categorías** custom + 12 presets (Comida, Transporte, Salud, etc.)
- **Gastos variables** (un evento puntual)
- **Gastos fijos** (servicios, suscripciones, alquiler — recurren cada mes)
- **OCR para importar** de bancos (8 soportados: Galicia, Santander, Macro, BBVA, Mercado Pago, Modo, Ualá, Naranja X)
- **Filtros**: por mes, por categoría, por persona, por monto
- **Cronología visual** + calendario mensual

### 3.3 Metas de ahorro

- **Wizard** de 4 pasos para crear meta (nombre + emoji, monto, plazo, resumen)
- **Progreso visual** con vault animado
- **Aportes manuales** desde la reserva o desde el sobrante del mes
- **Pausar / reactivar** sin perder progreso

### 3.4 Familia compartida en tiempo real

- **Código de invitación** para sumar a tu pareja / familia
- **Roles**: dueño (owner) + miembros
- **Splits proporcionales** al ingreso de cada uno (opcional)
- **Visibilidad compartida** de gastos en tiempo real (lo que carga tu pareja lo ves al instante)

### 3.5 USD-aware (único en LATAM)

- **Tipo de cambio ARS/USD** configurable por familia
- **Tracking dual** de gastos y ahorro en ambas monedas
- Aware del contexto argentino (devaluaciones, blue, oficial, MEP)

### 3.6 Wrapped mensual (engagement único)

- **Cycle Wrapped** al cierre de mes — resumen cinematográfico estilo Spotify Wrapped
- 5-6 escenas: veredicto del mes, top categoría, top gasto, etc.
- **Decisión integrada** sobre el sobrante en la última escena
- Disparado solo 1 vez al mes — no satura

### 3.7 Asistente (Coach Mode)

- **Insights** automáticos sobre patrones de gasto
- **Detección de subscripciones zombie** (suscripciones que no usás)
- **Día sin gasto** con confetti motivacional
- **Sugerencias contextuales** ("estás gastando 30% más en delivery este mes")
- 100% heurístico hoy (sin LLM — privacidad first)

### 3.8 Streaks (gamificación sutil)

- Cargás gastos seguidos → mantenés tu racha
- **Personales**, no competitivos (sin leaderboards)
- **Día sin gasto** suma a la racha (no la rompe)

### 3.9 Notificaciones inteligentes

- Push de gasto fijo próximo a vencer (3 días antes)
- Recordatorios suaves de carga si pasaron varios días
- Cierre de mes con CTA al Wrapped
- **Control granular** desde Settings

### 3.10 Seguridad

- **PIN lock** + biométrica (Face ID / Touch ID)
- **Re-auth en acciones destructivas** (eliminar cuenta, salir de familia)
- **Sign in with Apple** además de email + password
- **Cifrado** end-to-end con TLS + at-rest en Supabase
- **Row Level Security** multi-tenant
- **Auditoría** de cambios sensibles

### 3.11 Privacidad como diferenciador

- **Sin ads**
- **Sin tracking cross-app**
- **Sin AI training** con tus datos financieros
- **Eliminación de cuenta** con 30 días de gracia (reversible)
- **Datos almacenados en Supabase (EE.UU.)** con cifrado at-rest

---

## 4 · Diferenciadores vs competencia

| Competidor | Lo que les falta y nosotros tenemos |
|---|---|
| **Splitwise** | UX argentina + USD-aware + categorías de hogar + metas + cierre de mes |
| **YNAB** | En español + multi-tenant familia + sin paywall agresivo |
| **Wallet by BudgetBakers** | Diseño calmo + Wrapped + OCR bancos AR |
| **Mint (US)** | No funciona en LATAM + no es multi-tenant |
| **Excel / Google Sheets** | Tiempo real + mobile-first + sin fricción de mantener formulas |

### Ángulos para destacar

1. **Hecho en Argentina, para Argentina** — entiende devaluaciones, dolar blue, ciclos de cobro AR
2. **Para parejas que no quieren pelearse por plata** — visibilidad mutua sin micromanaging
3. **Diseño calmo** — la app **no grita** ni te bombardea con notificaciones
4. **OCR de bancos AR** — el único que importa de Galicia, Santander, Macro, etc.
5. **Privacy first** — sin ads, sin tracking, sin AI sobre tus datos

---

## 5 · Tono de voz / brand voice

### Hacelo

- ✅ Conversacional, vos a vos (no "usted")
- ✅ Argentino sin chocar a otros LATAMs (evitar "che" repetido pero usar "vos")
- ✅ Concreto y específico ("la cuota de Netflix" mejor que "una suscripción")
- ✅ Honesto sobre limitaciones (no exageres features)
- ✅ Editorial vs corporate (frases cortas, ritmo)

### Evitá

- ❌ Superlatives sin contexto: "la mejor app", "increíble", "revoluciona"
- ❌ Marketing-speak: "empoderar", "transformar tu vida financiera"
- ❌ Buzzwords AI cuando no es: "inteligencia artificial" cuando es heurística
- ❌ Promesas que no podés cumplir: "Te garantiza ahorrar X%"
- ❌ Emoji spam: 1-2 emojis en toda la descripción está OK; 1 por línea está terrible

### Referencias de tono

- **Sitio web**: https://manifiestoapp.com (mismo tono)
- **Privacy Policy**: https://manifiestoapp.com/privacy/ (conversacional, transparente)
- **Apps con tono similar**: Linear, Things, Reeder (calmas y profesionales sin ser corporativas)

---

## 6 · Pool de keywords

App Store Connect tiene 100 chars total separados por coma. Apple **ya indexa el nombre del app + subtítulo** así que no hace falta repetir "manifiesto" en keywords.

### Tier 1 (must-have)

`finanzas, gastos, pareja, familia, ahorro, presupuesto, dinero, control, planificar, mensual`

### Tier 2 (high-value)

`fijos, suscripciones, USD, dolar, metas, hogar, casa, compartir, juntos, splitwise`

### Tier 3 (long-tail)

`organizar, planilla, excel, app finanzas argentina, gastos compartidos, presupuesto familiar, pareja dinero`

### Combinación sugerida (100 chars, ~14 palabras)

```
finanzas,pareja,familia,gastos,ahorro,presupuesto,fijos,dolar,metas,compartir,hogar,planificar,argentina
```

(110 chars exactos — necesita un trim. Si pasamos al final, mostrate que entre.)

### Combinación alternativa (más enfocada en pareja)

```
pareja,finanzas,gastos,familia,ahorro,presupuesto,compartir,fijos,metas,dinero
```

(95 chars — entra cómodo)

---

## 7 · Draft de los 6 campos

### 7.1 Nombre (30 chars máx)

**Sugerencia A** (literal): `Manifiesto` (10 chars)

**Sugerencia B** (con subtítulo embebido — Apple permite hasta 30 chars): `Manifiesto: Finanzas Familia` (28 chars)

**Recomendación**: Apple penaliza títulos con dos palabras clave embebidas como keyword stuffing. **Mantené solo "Manifiesto"** (10 chars). El subtítulo te da otros 30 chars para el descriptor.

### 7.2 Subtítulo (30 chars máx)

Opciones, elegí la que más suene:

| Opción | Largo | Tono |
|---|---|---|
| `Finanzas para tu familia` | 24 | Directo, claro |
| `Plata clara con tu pareja` | 25 | Argentino + conversacional |
| `Gastos compartidos sin discutir` | 31 ⚠️ | Pasa el límite por 1 char |
| `Tu plan con tu pareja, claro` | 28 | Editorial |
| `Finanzas familiares simples` | 27 | Mismo del sitio |

**Recomendación**: `Plata clara con tu pareja` (25 chars) — argentino, concreto, captura la idea central.

### 7.3 Descripción (4000 chars máx)

```
Manifiesto es la app de finanzas pensada para parejas y familias argentinas que quieren tener visibilidad clara del mes sin planillas ni discusiones.

CARGÁS TUS GASTOS EN SEGUNDOS

Suma un gasto en 4 taps. Categorías a medida, descripciones rápidas, y todo lo que cargás aparece al instante en el celular de tu pareja.

¿Importás resúmenes de tu banco? Sumamos OCR para 8 bancos argentinos: Galicia, Santander, Macro, BBVA, Mercado Pago, Modo, Ualá y Naranja X.

UN PLAN PARA EL MES, COMPARTIDO

- Cargá los gastos fijos (alquiler, servicios, suscripciones) y te avisamos antes de que venzan.
- Definí cuánto querés guardar de tu sueldo este mes.
- Mirá tu saldo del día en el home: ¿cuánto te queda para llegar a fin de mes?

METAS DE AHORRO REALES

Armá una meta (un viaje, el alquiler, el auto), ponele un plazo, y mirá tu progreso visualmente cada vez que aportás. Sin promesas mágicas: una meta a la vez, paso a paso.

PESOS Y DÓLARES, JUNTOS

Manifiesto entiende el contexto argentino. Configurás tu cotización ARS/USD y la app convierte automáticamente. Ideal si ahorrás en dólares como tantos en Argentina.

EL WRAPPED DE FIN DE MES

Al cerrar cada mes te mostramos un resumen cinematográfico: en qué gastaste más, cuál fue tu compra del mes, cuánto pudiste guardar. Después decidís qué hacer con el sobrante (si hay): aportar a tu meta, sumar a la reserva, o empezar fresco el mes siguiente.

PRIVACIDAD COMO PRINCIPIO

Tus datos financieros nunca se venden, no se cruzan con otras apps para publicidad y no se usan para entrenar inteligencia artificial. Solo los usamos para que Manifiesto funcione.

Podés eliminar tu cuenta en cualquier momento desde la app (con 30 días para arrepentirte). Política completa en manifiestoapp.com/privacy

CUIDADO CON LA EXPERIENCIA

- Diseño calmo. La app no grita ni te bombardea con notificaciones.
- Pensado en iOS: Sign in with Apple, Face ID/Touch ID, Widgets próximamente.
- Funciona en pesos argentinos o en cualquier otra moneda.

QUÉ NO SOMOS

- No procesamos pagos. Manifiesto te ayuda a organizarte, no mueve plata por vos.
- No damos asesoramiento financiero. Si necesitás un asesor, buscá uno.
- No es una billetera virtual ni un banco.

EQUIPO Y CONTACTO

Hecho por una persona, en Argentina. Si encontrás un bug, tenés una idea, o solo querés decir hola: soporte@manifiestoapp.com

manifiestoapp.com
```

(~2400 chars — bien por debajo del límite, deja espacio para iterar)

### 7.4 Palabras clave (100 chars máx)

```
pareja,finanzas,gastos,familia,ahorro,presupuesto,compartir,fijos,metas,dinero,hogar,USD
```

(99 chars — entra justo)

### 7.5 Texto promocional (170 chars máx)

**Funciona como banner editable**. Casos de uso típicos:
- Lanzamiento: "Recién lanzamos. Probala gratis y contanos qué te parece."
- Update mayor: "Versión 1.2: ahora con widgets en el lock screen."
- Estacional: "Plan de gastos para fin de año listo en 10 minutos."

**Draft de lanzamiento** (158 chars):

```
Recién lanzamos la versión 1.0. Si la probás y te ayuda, contanos qué te resultó útil. Si algo no funciona, también: soporte@manifiestoapp.com
```

### 7.6 Qué hay nuevo (release notes, 4000 chars máx)

Para v1.0:

```
Esta es la versión inicial de Manifiesto.

Lo que podés hacer desde el día 1:
- Cargar gastos del mes con categorías a medida
- Sumar gastos fijos y recibir aviso antes del vencimiento
- Importar resúmenes de 8 bancos argentinos por OCR
- Compartir todo con tu pareja o familia en tiempo real
- Armar metas de ahorro con plazo y progreso visual
- Trackear ahorro en pesos y dólares al mismo tiempo
- Ver el Wrapped al cierre de cada mes con resumen cinematográfico
- Login con Apple, Face ID o Touch ID

Gracias por probar Manifiesto. Si encontrás algo que mejorar, escribinos: soporte@manifiestoapp.com
```

---

## 8 · Checklist al cargar en App Store Connect

Cuando vayas a App Store Connect → app → Distribución → Versión 1.0:

- [ ] Nombre = `Manifiesto`
- [ ] Subtítulo = `Plata clara con tu pareja` (o variante elegida)
- [ ] Descripción = pegada del draft 7.3 (ajustada si querés)
- [ ] Palabras clave = `pareja,finanzas,gastos,familia,ahorro,presupuesto,compartir,fijos,metas,dinero,hogar,USD`
- [ ] Texto promocional = draft 7.5
- [ ] Qué hay nuevo = draft 7.6
- [ ] **Idioma principal**: Español (México) — el campo de localización
- [ ] Verificá que **no hay typos** antes de submit (Apple no rechaza por eso pero es feo)
- [ ] Verificá que **no mencionás competidores por nombre** (Splitwise, YNAB, Mint — Apple rechaza)

---

## 9 · Cosas a evitar al redactar copy de App Store

Lista de cosas que Apple **rechaza** al review:

1. ❌ Mencionar nombres de competidores ("better than Splitwise")
2. ❌ Mencionar otras plataformas ("disponible también en Android")
3. ❌ Mencionar features no disponibles ("coming soon" en la descripción de v1.0)
4. ❌ Claims financieros sin disclaimer ("ahorrá 30% en 3 meses")
5. ❌ Mencionar precios en la descripción (Apple ya los muestra)
6. ❌ Keyword stuffing en el nombre o subtítulo
7. ❌ Pedir reviews / ratings en la descripción (hacé eso in-app con `SKStoreReviewController`)
8. ❌ Links a no ser que sean a tu propio sitio (soporte / política de privacidad)
9. ❌ Emojis excesivos o inapropiados

---

## 10 · Iteración post-launch

Una vez que la app está en App Store:

- **A/B testing nativo** (Apple Product Page Optimization) — disponible solo después de algunos miles de visits/mes
- **Texto promocional** se puede editar sin re-submit — usalo para campañas
- **Subtítulo y descripción** requieren nueva versión para cambiar — bumpear versión menor está OK

**Métricas a mirar** (App Store Connect → Analytics):
- Product Page Views
- Conversion Rate (views → installs)
- Search appearances (¿qué keywords te traen tráfico?)

---

## Referencias

- App Store Connect Help: https://help.apple.com/app-store-connect/
- ASO best practices 2026: TBD
- Manifiesto Privacy Policy: https://manifiestoapp.com/privacy/
- Manifiesto Terms: https://manifiestoapp.com/terms/
- Sitio público: https://manifiestoapp.com
