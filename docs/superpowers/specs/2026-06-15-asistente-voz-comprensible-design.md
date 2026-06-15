# Voz comprensible del Asistente Financiero — estándar + plan

> 2026-06-15 · branch `feature/asistente-preferencias`. Surge de la auditoría
> multi-agente de comprensibilidad (veredicto: BAJA). El motor heurístico
> está bien; el problema es la CAPA DE PRESENTACIÓN. Causa raíz centralizable:
> ~4 puntos de palanca (prompt del LLM + moldes de copy + FAMILY_LABELS)
> gobiernan cientos de señales.

## CORE
Cualquier persona que NO sepa de finanzas y NO sea experta en matemática debe
leer lo que el asistente dice y ENTENDER sus finanzas. Test de cada texto:
**¿lo entiende alguien sin ser contador?**

## Decisiones de producto (owner, 2026-06-15)
1. **Jerga:** mix — evitar en la fuente; si un término es inevitable, definirlo
   inline la primera vez y en pesos ("tus gastos fijos: alquiler, servicios,
   suscripciones"). Sin pantallas extra.
2. **Umbrales "saludables"** (fijos ≤50%, libre ≥25%): mostrar la CONSECUENCIA
   en pesos, **sin** el número mágico. "Cuando los fijos pasan la mitad del
   sueldo, te queda muy poco para el día a día y para ahorrar."
3. **Lenguaje figurado** (margen, aire): **solo en celebraciones**, directo en
   alarmas.
4. **Alcance:** todo el plan (8 fixes), multi-tanda.

## Principios de VOZ (checklist — estándar para TODA la copy)
1. **Pesos primero, % después.** Nunca un % o multiplicador solo. El monto en
   pesos es el protagonista; el % entre paréntesis como contexto.
   MAL: "Restaurantes: 38% del gasto". BIEN: "Restaurantes: $45.000 (38% del mes)".
2. **Prohibido multiplicadores crudos** ("1.4×"). Traducir a diferencia en pesos.
3. **Cero matemática mental.** Si dos números se relacionan, decir el resultado.
   MAL: "cierre $X, te vas $Y por encima". BIEN: "vas a gastar $Y más de lo que planeaste".
4. **Lista negra** (no usar en copy de usuario, ni dejar que el LLM la emita):
   ratio, velocidad, momentum, pace, baseline, percentil, outlier, aceleración,
   dominancia, apalancamiento, drawdown, cupo, tope, ciclo, sobrante, excedente,
   margen, aire, forecast, proyección (a secas), volatilidad, mix 50/FLEX/AHORRO,
   racha (a secas), prorrateo, confluencia, drenaje, filtraciones, sobregiro,
   comprometido, holgado.
5. **Término inevitable → definir inline la 1ª vez, en pesos.** cupo → "lo que
   podés gastar por día"; ciclo → "tu mes, de un cobro al siguiente"; fijos →
   "alquiler, servicios y suscripciones".
6. **Una idea por mensaje.** Un hecho + una acción concreta. No apilar dos números.
7. **Todo número con ancla de vida real** (diferencia en pesos, días de gasto,
   "eso paga 2 meses de Netflix"). Nunca un número flotando.
8. **Decir si es bueno o malo y qué hacer** — no inferir por color. Termina en
   una acción que se entiende sin googlear.
9. **Umbrales → consecuencia, no número mágico** (decisión 2).
10. **Tono de persona, no de planilla**, calibrado al estado: directo y
    tranquilizador en alarmas; cálido/celebratorio en logros. Figurado solo en
    celebraciones (decisión 3).
11. **Etiquetas internas no se filtran a la UI.** "zombie" → "Servicios que
    pagás y no usás"; "drenaje invisible" → "Plata que se te va sin notarlo".
12. **Confianza/estadística en criollo.** Nunca "confidence 0.62"/"P75". Decir
    "lo vimos pasar 7 veces" o "todavía estamos aprendiendo cómo gastás".

## Plan de tandas
- **Tanda A (la fuente):** #1 endurecer SYSTEM_PROMPT del LLM (lista negra +
  "% siempre a pesos" + ejemplos malo/bien + sacar jerga interna) · #3
  FAMILY_LABELS a lenguaje llano · #4 reescribir los 4 moldes de
  control-signals-copy.ts · #2 helper "pesos-primero" + rutearlo en los ~6
  títulos de control-signals.ts que escupen %/×.
- **Tanda B (superficies):** #5 descripciones de persona + copy de la pantalla
  de preferencias · #6 sacar "mix/margen/aire/ritmo" de hero/today/metric-groups.
- **Tanda C (guardarrailes):** #7 limpiar fallbacks del LLM + assistant-demo-signals
  · #8 test de jerga (escanea copy + fixture contra la lista negra; falla si
  aparece jerga sin explicar o un % sin pesos al lado).

Cada tanda: typecheck + lint (+ expo export si toca render); commit.

## No-goals
- No tocar el motor heurístico (los cálculos están bien) — solo la presentación.
- Onboarding/glosario como pantalla aparte (decisión: inline, no pantalla nueva).
