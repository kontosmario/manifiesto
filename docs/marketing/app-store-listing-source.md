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

> **Una app móvil para entender en qué se te va la plata y ahorrar — sin saber de finanzas. Funciona igual de bien usándola solo o compartida con tu familia.**

Variantes según contexto:
- **Hero del sitio**: "Finanzas familiares simples y compartidas."
- **Tagline corto** (subtítulo App Store): "Gastos claros, ahorro simple."
- **Pitch a un amigo**: "Es la app para entender en qué se te va la plata y empezar a ahorrar de a poco. La podés usar solo o con tu pareja/familia. Pensada para Argentina (pesos + USD, bancos AR, ciclos de cobro reales)."

### Sobre el pivote de posicionamiento (2026-06-10)

El draft inicial del doc giraba alrededor de **"parejas que no se pelean por plata"** (ángulo Splitwise-like). Lo movimos a **"ahorro + claridad sin ser experto"** con familia como **modo opcional**. Razones:
- TAM más grande: incluye solteros, no solo parejas.
- Dolor más universal: "no entiendo mis gastos" + "no sé ahorrar" toca más gente que "no me llevo bien con mi pareja con la plata".
- No nos encasilla en una categoría saturada (split apps).
- El modo familia sigue siendo un diferenciador potente, pero como **superpoder opcional**, no como el pitch principal.

---

## 2 · Target audience

### Primary

- **Personas que quieren entender sus gastos y empezar a ahorrar** sin tener background financiero (25-50 años, AR + LATAM)
- **Solteros / monousuarios** que abandonaron Excel o apps complicadas por fricción
- **Parejas que conviven** y quieren visibilidad mutua sin micromanaging (modo familia)
- **Familias chicas-medianas** con hijos adolescentes o que aportan al pool familiar
- Personas que **tienen ahorros en USD** además de pesos (común en AR)

> 💡 El modo solo y el modo familia conviven en el mismo producto sin fricción. No hay que elegir.

### Secondary

- Padres que quieren enseñar finanzas a hijos jóvenes
- Personas con freelance income variable mes a mes
- Roommates serios que comparten gastos del hogar

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

1. **Ahorrar sin saber de finanzas** — el dolor más universal, el hook principal
2. **Solo o en familia, mismo producto** — no te obliga a elegir un modo
3. **Hecho en Argentina, para Argentina** — entiende devaluaciones, dolar blue, ciclos de cobro AR
4. **Diseño calmo** — la app **no grita** ni te bombardea con notificaciones
5. **OCR de bancos AR** — el único que importa de Galicia, Santander, Macro, etc.
6. **Privacy first** — sin ads, sin tracking, sin AI sobre tus datos

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

> 📈 **Peso de orden**: las primeras keywords pesan más en el ranking de Apple. Por eso `ahorro` y `gastos` van primero — son las búsquedas más alineadas con nuestro nuevo posicionamiento.

### Tier 1 (must-have)

`ahorro, gastos, finanzas, familia, presupuesto, metas, fijos, dinero, simple, facil`

### Tier 2 (high-value)

`pareja, USD, dolar, hogar, suscripciones, mensual, control, organizar`

### Tier 3 (long-tail)

`planilla, excel, app finanzas argentina, gastos compartidos, presupuesto familiar`

### Combinación elegida (91 chars — recomendada)

```
ahorro,gastos,finanzas,familia,presupuesto,metas,fijos,pareja,dinero,simple,hogar,facil,USD
```

(91 chars — entra cómodo, deja 9 chars de buffer si querés sumar una palabra más adelante)

### Variantes para A/B testing post-launch

**Más foco en simplicidad** (97 chars):
```
ahorro,gastos,finanzas,simple,facil,presupuesto,metas,familia,pareja,fijos,dinero,hogar
```

**Más foco en familia/pareja** (95 chars):
```
ahorro,gastos,finanzas,familia,pareja,presupuesto,fijos,metas,compartir,hogar,USD
```

---

## 7 · Drafts finales de los 6 campos (2026-06-10)

> ✅ **Esta es la versión recomendada para pegar en App Store Connect**, ajustada al pivote de posicionamiento "simplicidad + ahorro + modo dual" (solo o familia).

### 7.1 Nombre (10/30)

```
Manifiesto
```

> No agregamos descriptor al nombre. Apple penaliza "keyword stuffing" en este campo, y el subtítulo nos da otros 30 chars para el descriptor.

### 7.2 Subtítulo (30 chars máx)

Opciones evaluadas:

| Opción | Chars | Nota |
|---|---|---|
| `Gastos claros, ahorro simple` | 28 | ✅ **Recomendada** — captura ambos pilares |
| `Ahorrá sin ser experto` | 22 | Foco 100% en ahorro |
| `Ahorrá, solo o en familia` | 25 | Foco en el modo dual |

**Recomendación final**: **`Gastos claros, ahorro simple`** (28 chars).

### 7.3 Descripción (~2.100/4000)

```
Manifiesto es la app para entender en qué se te va la plata y ahorrar, sin necesidad de saber de finanzas. Funciona igual de bien si la usás solo o con tu familia.

VER TUS GASTOS, SIN VUELTAS

Cargás un gasto en 4 taps y listo. Nada de planillas, fórmulas ni términos raros: abrís el home y ves cuánto gastaste este mes y cuánto te queda.

¿Te llegan los resúmenes del banco? Importalos por OCR desde 8 bancos argentinos: Galicia, Santander, Macro, BBVA, Mercado Pago, Modo, Ualá y Naranja X.

AHORRAR, PASO A PASO

- Definí cuánto querés guardar este mes, aunque sea poco.
- Armá una meta (un viaje, el auto, un colchón de emergencia), ponele plazo y mirá el progreso cada vez que aportás.
- Al cerrar el mes decidís qué hacer con el sobrante: meta, reserva o empezar fresco.

Sin promesas mágicas: una meta a la vez.

SOLO O EN FAMILIA

Usala para tus finanzas personales, o invitá a tu pareja o familia con un código. Todo lo que carga el otro lo ves al instante, sin pasarse capturas ni discutir quién pagó qué.

GASTOS FIJOS BAJO CONTROL

Cargá el alquiler, los servicios y las suscripciones una sola vez. Te avisamos antes de que venzan.

PESOS Y DÓLARES, JUNTOS

Configurás tu cotización ARS/USD y la app convierte automáticamente. Ideal si ahorrás en dólares como tantos en Argentina.

EL WRAPPED DE FIN DE MES

Al cerrar cada mes te mostramos un resumen visual: en qué gastaste más, cuál fue tu compra del mes, cuánto pudiste guardar.

PRIVACIDAD COMO PRINCIPIO

Tus datos financieros no se venden, no se cruzan con otras apps para publicidad y no se usan para entrenar inteligencia artificial.

Podés eliminar tu cuenta cuando quieras desde la app (con 30 días para arrepentirte). Política completa en manifiestoapp.com/privacy

QUÉ NO SOMOS

- No procesamos pagos ni movemos plata por vos.
- No damos asesoramiento financiero.
- No es una billetera virtual ni un banco.

Hecho por una persona, en Argentina. ¿Bugs, ideas o un hola? soporte@manifiestoapp.com

manifiestoapp.com
```

### 7.4 Palabras clave (91/100)

```
ahorro,gastos,finanzas,familia,presupuesto,metas,fijos,pareja,dinero,simple,hogar,facil,USD
```

> `ahorro` primero (peso de orden en ASO). Sumamos `simple` y `facil` por el nuevo posicionamiento. Sacamos `compartir` y `planificar` (baja intención de búsqueda con el pivote a usuario menos sofisticado).

### 7.5 Texto promocional (143/170)

```
Recién lanzamos la versión 1.0. Si la probás y te ayuda a ordenar tus gastos, contanos. Si algo no funciona, también: soporte@manifiestoapp.com
```

### 7.6 Qué hay nuevo (release notes v1.0)

```
Esta es la versión inicial de Manifiesto.

Lo que podés hacer desde el día 1:
- Ver tus gastos del mes de un vistazo, sin planillas
- Armar metas de ahorro con plazo y progreso visual
- Cargar gastos fijos y recibir aviso antes del vencimiento
- Importar resúmenes de 8 bancos argentinos por OCR
- Usarla solo, o compartir todo con tu pareja o familia en tiempo real
- Trackear ahorro en pesos y dólares al mismo tiempo
- Ver el Wrapped al cierre de cada mes
- Login con Apple, Face ID o Touch ID

Gracias por probar Manifiesto. Si encontrás algo que mejorar, escribinos: soporte@manifiestoapp.com
```

---

## 7.bis · Cambios clave entre el draft inicial y el final

| Sección | Draft inicial (descartado) | Draft final (recomendado) |
|---|---|---|
| Hook de descripción | "parejas y familias argentinas… sin discusiones" | "entender en qué se te va la plata y ahorrar, sin necesidad de saber de finanzas" |
| Orden de secciones | Gastos → Plan → Metas → Familia → ... | Gastos → **Ahorrar** → **Solo o en familia** → Fijos → ... |
| Subtítulo | "Plata clara con tu pareja" | "Gastos claros, ahorro simple" |
| Keyword peso 1 | `pareja` | `ahorro` |
| Single-mode | Secondary audience (enterrado) | Sección propia "SOLO O EN FAMILIA" |
| Tono | "pareja que no se pelea" | "principiante que quiere ahorrar" |

---

## 8 · Checklist al cargar en App Store Connect

Cuando vayas a App Store Connect → app → Distribución → Versión 1.0:

- [ ] Nombre = `Manifiesto`
- [ ] Subtítulo = `Gastos claros, ahorro simple` (28 chars)
- [ ] Descripción = pegada del draft 7.3
- [ ] Palabras clave = `ahorro,gastos,finanzas,familia,presupuesto,metas,fijos,pareja,dinero,simple,hogar,facil,USD` (91 chars)
- [ ] Texto promocional = draft 7.5 (143 chars)
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
