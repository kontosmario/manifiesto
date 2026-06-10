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

> **Una app móvil para entender en qué se te va la plata y ahorrar — sin saber de finanzas. Funciona igual de bien por tu cuenta, en pareja o en familia.**

Variantes según contexto:
- **Hero del sitio**: "Finanzas familiares simples y compartidas."
- **Tagline corto** (subtítulo App Store): "Gastos claros, ahorro simple."
- **Pitch a alguien**: "Es la app para entender en qué se te va la plata y empezar a ahorrar de a poco. La podés usar por tu cuenta, en pareja o en familia. Pensada para Argentina (pesos + USD, bancos AR, ciclos de cobro reales)."

### Sobre el pivote de posicionamiento (2026-06-10)

El draft inicial del doc giraba alrededor de **"parejas que no se pelean por plata"** (ángulo Splitwise-like). Lo movimos a **"ahorro + claridad sin ser experto"** con familia como **modo opcional**. Razones:
- TAM más grande: incluye solteros, no solo parejas.
- Dolor más universal: "no entiendo mis gastos" + "no sé ahorrar" toca más gente que "no me llevo bien con mi pareja con la plata".
- No nos encasilla en una categoría saturada (split apps).
- El modo familia sigue siendo un diferenciador potente, pero como **superpoder opcional**, no como el pitch principal.

---

## 2 · Target audience

### Primary

- **Personas que quieren entender sus gastos y empezar a ahorrar** sin tener background financiero (18-50 años, AR + LATAM)
- **Primeros años de independencia financiera**: primer sueldo, primer alquiler, primera convivencia. Segmento con alta adopción orgánica de finanzas + alta compartibilidad de Wrapped en redes sociales
- **Quienes manejan sus finanzas por su cuenta** y abandonaron Excel o apps complicadas por fricción
- **Parejas que conviven** y quieren visibilidad mutua sin micromanaging
- **Familias chicas-medianas** con hijos adolescentes o que aportan al pool familiar
- **Hogares no-nucleares**: roommates, hermanos que conviven, madre/padre soltero con hijos que aportan, parejas no convivientes que comparten algunos gastos
- Personas que **tienen ahorros en USD** además de pesos (común en LATAM)

> 💡 El modo individual y el modo compartido conviven en el mismo producto sin fricción. No hay que elegir. El modelo de "familia" en la app es abstracto: lo que importa es **quiénes comparten gastos**, no la estructura legal del hogar.

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
2. **Anti-shame**: "una app que te acompaña, no que te reta" — diferencia clave vs YNAB / Mint / Wallet, que se posicionan en "disciplina". Manifiesto se posiciona en "compañía calma"
3. **Por tu cuenta o en familia, mismo producto** — no te obliga a elegir un modo
4. **Hecho en Argentina, para Argentina** — entiende devaluaciones, dolar blue, ciclos de cobro AR (relevante para el AR storefront principalmente)
5. **Diseño calmo** — la app **no grita** ni te bombardea con notificaciones
6. **OCR de bancos** — importa de Galicia, Santander, Macro, BBVA, Mercado Pago, Modo, Ualá, Naranja X
7. **Privacy first** — sin ads, sin tracking, sin AI sobre tus datos

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

### 7.3 Descripción (~2.250/4000)

```
Manifiesto es la app para entender en qué se te va la plata y ahorrar, sin necesidad de saber de finanzas. Funciona igual de bien por tu cuenta, en pareja o en familia.

Sin culpa, sin sermones: una app que te acompaña, no que te juzga.

VER TUS GASTOS, SIN VUELTAS

Cargás un gasto en 4 taps y listo. Nada de planillas, fórmulas ni términos raros: abrís el home y ves cuánto gastaste este mes y cuánto te queda.

AHORRAR, PASO A PASO

- Definí cuánto querés guardar este mes, aunque sea poco.
- Armá una meta (un viaje, el auto, un colchón de emergencia), ponele plazo y mirá el progreso cada vez que aportás.
- Al cerrar el mes decidís qué hacer con el sobrante: meta, reserva o empezar fresco.

Sin promesas mágicas: una meta a la vez.

POR TU CUENTA O EN FAMILIA

Usala para tus finanzas personales, o sumá a las personas con las que compartís gastos: tu pareja, tu familia, o con quien convivas. Todo lo que cargan los demás lo ves al instante, sin pasarse capturas ni discutir quién pagó qué.

GASTOS FIJOS BAJO CONTROL

Cargá el alquiler, los servicios y las suscripciones una sola vez. Te avisamos antes de que venzan.

IMPORTAR DEL BANCO

¿Te llegan los resúmenes del banco al mail? Importalos por OCR. Soportamos 8: Galicia, Santander, Macro, BBVA, Mercado Pago, Modo, Ualá y Naranja X.

PESOS Y DÓLARES, JUNTOS

Configurás tu cotización ARS/USD y la app convierte automáticamente. Ideal si ahorrás en dólares.

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
- Importar resúmenes de tu banco por OCR (8 bancos soportados)
- Usarla por tu cuenta, o compartir todo con tu pareja, familia o con quien convivas
- Trackear ahorro en pesos y dólares al mismo tiempo
- Ver el Wrapped al cierre de cada mes
- Login con Apple, Face ID o Touch ID

Gracias por probar Manifiesto. Si encontrás algo que mejorar, escribinos: soporte@manifiestoapp.com
```

---

## 7.bis · Cambios clave entre el draft inicial y el draft con pivote (2026-06-10)

| Sección | Draft inicial (descartado) | Draft pivoteado |
|---|---|---|
| Hook de descripción | "parejas y familias argentinas… sin discusiones" | "entender en qué se te va la plata y ahorrar, sin necesidad de saber de finanzas" |
| Orden de secciones | Gastos → Plan → Metas → Familia → ... | Gastos → **Ahorrar** → **Solo o en familia** → Fijos → ... |
| Subtítulo | "Plata clara con tu pareja" | "Gastos claros, ahorro simple" |
| Keyword peso 1 | `pareja` | `ahorro` |
| Single-mode | Secondary audience (enterrado) | Sección propia "SOLO O EN FAMILIA" |
| Tono | "pareja que no se pelea" | "principiante que quiere ahorrar" |

---

## 7.ter · Pulido por lenguaje inclusivo (2026-06-10, post-pivote)

Una vez aplicado el pivote a "ahorro + simplicidad + modo dual", una segunda lectura detectó que el copy seguía usando **masculino singular por default** ("solo") y un frame implícito de **hogar nuclear** ("tu pareja", "el otro"). Audiencia primaria de finanzas de hogar en LATAM es fuertemente femenina (las mujeres suelen administrar el presupuesto en la mayoría de los estudios), por lo que dejar el masculino default cuesta engagement real, no solo "se ve mal".

**Principio del fix**: neutralizar **sin caer en lenguaje inclusivo militante** (sería "todes" / "amigues" / etc.) y **sin listar exhaustivamente configuraciones de hogar** (sonaría a corporate checklist y rompería el tono editorial calmo definido en §5).

### Cambios aplicados

| Lugar | Antes | Después |
|---|---|---|
| Hook descripción + sección 1 | "si la usás solo o con tu familia" | "por tu cuenta, en pareja o en familia" |
| Título de sección | `SOLO O EN FAMILIA` | `POR TU CUENTA O EN FAMILIA` |
| Cuerpo de sección | "Usala para tus finanzas personales, o invitá a tu pareja o familia con un código. Todo lo que carga **el otro** lo ves al instante" | "Usala para tus finanzas personales, o sumá a **las personas con las que compartís gastos: tu pareja, tu familia, o con quien convivas**. Todo lo que cargan **los demás** lo ves al instante" |
| Release notes | "Usarla solo, o compartir todo con tu pareja o familia" | "Usarla por tu cuenta, o compartir todo con tu pareja, familia o con quien convivas" |
| Target audience §2 | "Solteros / monousuarios" | "Quienes manejan sus finanzas por su cuenta" |
| Target audience §2 | (no había mención de hogares no-nucleares) | + bullet explícito: "Hogares no-nucleares: roommates, hermanos que conviven, madre/padre soltero con hijos que aportan, parejas no convivientes que comparten algunos gastos" |
| Pitch a alguien §1 | "Pitch a un amigo" | "Pitch a alguien" |

### Cosas que NO se cambiaron (deliberado)

- **`pareja` sigue en keywords** y como ejemplo concreto en la descripción. Es la configuración más común en el target y sirve como anchor cognitivo. Sacarlo por neutralidad sería overcorrect.
- **`familia`** sigue siendo el término dominante. Funciona como paraguas semántico amplio (no necesariamente nuclear).
- **`Hecho por una persona, en Argentina`** ya es neutro.
- **No agregamos "roommates" / "amigos" a las keywords**: volumen de búsqueda en español es muy bajo y tenemos solo 9 chars de buffer en el campo.
- **No reescribimos el sitio web** (`manifiestoapp.com`) — esto era para listing copy. El sitio puede hacer el mismo pass después como follow-up.

---

## 7.quater · Ampliar atractivo sin diluir el posicionamiento (2026-06-10, post-pulido)

Una tercera lectura del doc detectó que el copy estaba bien para el target pero **filtraba activamente** segmentos del storefront es-MX que no eran AR. La trampa a evitar: "atractivo para todo el mundo" es **un anti-pattern de posicionamiento** — el copy que le habla a todos no le habla a nadie. La meta correcta no es "todos" sino **"que nadie del target se sienta excluido del primer scan"**.

### El principio

> Si vos mismo definiste un NOT target en §2 (pymes, inversores, facturación), está bien que el copy filtre. Lo que NO está bien es que el copy filtre **personas que sí son del target** por accidente lingüístico o estructural.

### Cambios aplicados

| Lugar | Antes | Después | Por qué |
|---|---|---|---|
| Hook (§7.3) | Solo el párrafo del producto | Sumamos línea anti-shame: "Sin culpa, sin gritos, sin promesas mágicas: una app que te acompaña, no que te reta." | Diferencia visceral vs YNAB/Mint/Wallet (postura "disciplina"); funciona en todo LATAM |
| Banco mención (§7.3) | "Importalos por OCR desde 8 bancos **argentinos**" en la 2ª sección del cuerpo | Movido a una sección propia ("IMPORTAR DEL BANCO") más abajo, sin el adjetivo "argentinos" | El user de CDMX no se topa con "esto no es para mí" en los primeros 200 chars. Los nombres de bancos son anchor suficiente para argentinos |
| Pesos/dólares (§7.3) | "Ideal si ahorrás en dólares como tantos en Argentina" | "Ideal si ahorrás en dólares" | Dolarización ahorro es dolor LATAM, no solo AR |
| Edad target (§2) | "(25-50 años, AR + LATAM)" | "(18-50 años, AR + LATAM)" + bullet explícito sobre primer-sueldo / primera-convivencia | 18-25 = mayor adopción orgánica de finanzas + mayor compartibilidad de Wrapped en redes |
| USD line target | "común en AR" | "común en LATAM" | Coherencia con storefront es-MX |
| Ángulos (§4) | 6 puntos | Sumado anti-shame como #2 + nota sobre AR-specific como relevante para AR storefront | Diferenciador real vs competencia, no estaba capitalizado |

### Cosas que NO se cambiaron (deliberado, pushback recibido y aceptado)

Mantuvimos así por **disciplina de posicionamiento** (no por inercia):

- **Subtítulo** `Gastos claros, ahorro simple` — ya universal, no necesita ajuste.
- **Keywords** — es-MX las indexa para toda la región. Cambiar nada.
- **`QUÉ NO SOMOS`** — la honestidad atrae al target real y filtra ruido. No es excluyente, es honesta.
- **`Hecho por una persona, en Argentina`** al final de la descripción — pasa de ser "limitación" a "diferenciador de autenticidad" cuando aparece después de toda la propuesta de valor. No al principio (donde sería filtro), sí al final (donde es firma).

### Pendiente para v1.1

**Per-storefront localization**. App Store soporta copy distinto por país. En la versión actual usamos un solo es-MX para toda LATAM, pero el copy ideal sería:

- **AR storefront**: amplificá el "Hecho en Argentina", banco list al inicio, "dólares como tantos en Argentina" funciona ahí
- **MX/CO/CL/etc. storefronts**: keep current versión (AR-specific movido abajo)

Esto requiere setup adicional en App Store Connect (cargar copy por país) — bajo prioridad para v1.0, considerar para v1.1 cuando tengamos datos de qué storefronts traen instalación.

---

## 7.quinquies · Polish final + ship-it stance (2026-06-10)

Cuarta y **última** pasada del doc antes de submit. 6 catches de consistencia + 1 data update:

| # | Catch | Fix |
|---|---|---|
| 1 | "retar" en AR = regañar; en MX/LATAM = desafiar — cambia el sentido | Hook: "no que te reta" → "no que te juzga" + "sin gritos" → "sin sermones" (universal LATAM) |
| 2 | Specs de screenshots desactualizados — Apple unificó en 2024 | §11 actualizado: solo 1 set en 6.9" (1320×2868), Apple auto-escala a tamaños menores. Ya NO requiere subir 6.7" + 5.5" como antes |
| 3 | "Solo o con tu familia" en caption screenshot 5 — regresión del pass inclusivo | "Por tu cuenta o en familia" |
| 4 | "Solo o en familia, mismo producto" en §4 ángulo 3 — misma regresión | "Por tu cuenta o en familia, mismo producto" |
| 5 | "8 bancos argentinos" en release notes (§7.6) — regresión del pivote storefront | "Importar resúmenes de tu banco por OCR (8 bancos soportados)" |
| 6 | Checklist §8 no incluía screenshots | Sumadas 2 líneas para screenshots + App Preview video |
| 7 | "Sin promesas mágicas" aparecía 3 veces (hook + AHORRAR + screenshot 3) | Removida del hook (reemplazada por la línea anti-shame). Quedan 2 ocurrencias = aceptable |

### Ship-it stance

Después de 4 iteraciones (inicial → pivote → inclusivo → ampliar sin diluir → polish), los catches encontrados son **de consistencia y data updates, NO de posicionamiento**. Señal clásica de rendimientos decrecientes en doc work.

**El próximo aprendizaje real no va a salir de otra lectura del doc** sino de:
- Conversion rate de la página del App Store (Apple Analytics)
- Storefront breakdown post-launch
- Qué keywords traen tráfico (Search appearances)

**Decisión**: este es el último pass del doc antes de submit. Si después de tener data Apple Analytics encontramos que algo no convierte, iteramos basados en evidencia real, no en una quinta lectura del mismo texto.

---

## 8 · Checklist al cargar en App Store Connect

Cuando vayas a App Store Connect → app → Distribución → Versión 1.0:

- [ ] Nombre = `Manifiesto`
- [ ] Subtítulo = `Gastos claros, ahorro simple` (28 chars)
- [ ] Descripción = pegada del draft 7.3
- [ ] Palabras clave = `ahorro,gastos,finanzas,familia,presupuesto,metas,fijos,pareja,dinero,simple,hogar,facil,USD` (91 chars)
- [ ] Texto promocional = draft 7.5 (143 chars)
- [ ] Qué hay nuevo = draft 7.6
- [ ] **Screenshots**: 3-5 en 1320×2868 (6.9"), orden según §11
- [ ] **App Preview video** (opcional): 15-30s según §11
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
- **Per-storefront localization** (ver 7.quater "pendiente para v1.1") — copy distinto por país, soportado nativamente por App Store Connect

**Métricas a mirar** (App Store Connect → Analytics):
- Product Page Views
- Conversion Rate (views → installs)
- Search appearances (¿qué keywords te traen tráfico?)
- **Storefront breakdown**: ¿desde qué países viene tráfico? Si Chile o Colombia traen volumen, validar per-storefront copy

---

## 11 · Screenshots & App Preview (item H3 del ready-pendientes)

> **El 70% de la decisión de instalar pasa por screenshots y App Preview video, no por el copy.** Esta sección no entra en App Store Connect como texto (los screenshots son imágenes), pero las decisiones de qué mostrar y en qué orden son tan importantes como el listing copy. Documentar acá para alinear con el resto del posicionamiento.

### Requisitos técnicos (Apple, post-cambio 2024)

| Asset | Cantidad | Tamaño primario obligatorio | Notas |
|---|---|---|---|
| **Screenshots iPhone** | 1-10 (recomendado 3-5) | **6.9" — 1320×2868 px** (iPhone 16 Pro Max portrait) | Apple **auto-escala a tamaños menores** (6.5", 5.5", etc.) — ya NO requiere subir múltiples sets como antes |
| **App Preview video** | 0-3 | Mismo tamaño que screenshots | Opcional |

> ⚠️ Cambio importante: hasta principios de 2024, Apple obligaba a subir screenshots en múltiples tamaños (6.7" + 5.5" mínimo). Desde el cambio, **basta con el tamaño más grande** y Apple se encarga del resto. Dimensiones exactas: un solo pixel de diferencia rechaza el upload.

> ⚠️ Apple muestra solo los **primeros 3 screenshots** en la página de búsqueda. Los siguientes 7 los ve quien hace scroll en la página del producto. **Los 3 primeros se llevan el peso de la decisión de install**.

### Orden recomendado para v1.0

Los 3 primeros tienen que vender la propuesta de valor del hook (entender gastos + ahorrar + sin saber de finanzas). Los siguientes amplían features.

| # | Pantalla | Por qué |
|---|---|---|
| 1 | **Home con hero card** mostrando el saldo del día con valores claros | Comunica "ver tus gastos sin vueltas" — primer feature del hook |
| 2 | **Wrapped scene del veredicto** (positiva, con números) | El asset más compartible. Diferenciador único. Le habla al 18-30 que comparte en redes |
| 3 | **Meta de ahorro con progreso visual** | Cierra el hook: "ahorrar paso a paso" |
| 4 | Calendar/Cronología visual de gastos | Demuestra densidad de info sin sobrecargar — refuerza "calmo" |
| 5 | Settings con "Compartir con familia" o code de invitación | Comunica el "modo dual" (por tu cuenta o con otros) |
| 6 | Modal de OCR / Importar del banco | Para el segmento argentino, alta intención |
| 7 | Privacy / Eliminar cuenta | Para el segmento privacy-aware. Marketing diferente |

### Estilo visual

- **Mantener el branding del wrapped** (forest-deep + cream + lime accent) para coherencia entre App Store y la app real.
- **Captions cortos sobre cada screenshot** (App Store permite agregar texto descriptivo over-the-image). Para Manifiesto, sugerencia:
  - Screenshot 1: "Ver en qué se te va la plata"
  - Screenshot 2: "Tu Wrapped al cierre del mes"
  - Screenshot 3: "Una meta por vez. Sin promesas mágicas."
  - Screenshot 4: "Cargás un gasto en 4 taps"
  - Screenshot 5: "Por tu cuenta o en familia"
- **Sin device frames decorativos** (Apple muestra el frame del iPhone automáticamente cuando el screenshot es nativo).

### App Preview video (opcional pero recomendado)

| Característica | Recomendación |
|---|---|
| Duración | 15-30 segundos |
| Contenido | Demo rápida del flow más visceral: cargar gasto → ver hero card → wrapped al cierre |
| Música | Opcional, calma — coherente con tono editorial |
| Audio | Sin voz humana (Apple muestra video muteado por default; subtítulos clave en pantalla) |
| Sin call-to-actions hacia URLs | Apple rechaza videos que dirijan fuera del App Store |

### Cómo armar los screenshots

| Opción | Tiempo | Costo | Calidad |
|---|---|---|---|
| **Simulator de Xcode** con cuenta poblada | 2-4 h | USD 0 | Buena, pero vacíos los datos si no se pueblan a mano |
| **Device físico real** (tu iPhone con la cuenta del owner que ya tiene Manifiesto en TestFlight con datos reales del owner) | 2-3 h | USD 0 | Excelente — son datos reales del producto en acción |
| **Mockup tools** (Shotsnapp, Screely, etc.) sobre screenshots crudos | 4-6 h | USD 0-50 | Profesional pero requiere diseño |
| **Contratar designer** que arme screenshots con device frames + captions + variantes | 1-2 días | USD 100-400 | Top — se ve "ready for prime time" |

**Recomendación para v1.0**: arrancar con device físico real (opción 2) — vos ya tenés TestFlight con datos reales, sacar screenshots desde ahí da el mejor balance time/quality para una app indie. Si después la conversion no es buena, iterar contratando designer (opción 4) en v1.0.x.

### Fuente: por qué screenshots > copy

Studies de App Store Optimization (Sensor Tower 2024, Apptopia 2025) coinciden: **screenshots y preview video explican entre 65-75% de la decisión de install** en sesiones de browsing del App Store. El copy explica ~15-20%. Las reviews/ratings explican otro 10-15%.

Implicación: si tenés bandwidth limitado, invertir 1 día en screenshots cuidados rinde más que 1 día puliendo copy.

---

## Referencias

- App Store Connect Help: https://help.apple.com/app-store-connect/
- Apple HIG screenshots & previews: https://developer.apple.com/design/human-interface-guidelines/app-store-marketing-and-promotion
- ASO best practices 2026: TBD
- Manifiesto Privacy Policy: https://manifiestoapp.com/privacy/
- Manifiesto Terms: https://manifiestoapp.com/terms/
- Sitio público: https://manifiestoapp.com
