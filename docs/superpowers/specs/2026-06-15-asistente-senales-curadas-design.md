# Curación de señales del Asistente — set para el usuario común

> 2026-06-15 · branch `feature/asistente-preferencias`. Revisión multi-agente
> de las ~39 señales con UN filtro: ¿le sirve y la entiende una persona común
> enfocada en sobrevivir primero, progresar de a poco? Veredicto: el problema
> no era falta de señales, era RUIDO. De ~36 efectivas → ~24.

## Decisiones de producto (owner, 2026-06-15)
- **Recorte completo** (descartar las recomendadas).
- **Borrar del default** (no modo avanzado opt-in): el default es el set chico;
  reactivables por flag si algún power user lo pide.
- **income-volatility: mantener + simplificar** (el segmento freelance/changas
  importa) — NO se descarta.
- **+1 slot de progreso**: reservar 1 lugar visible para una victoria, para no
  abrumar con puras alertas rojas.

## ✕ DESCARTADAS (9) — borradas del orquestador
| Señal | Por qué |
|---|---|
| `causal-friday-cascade`, `causal-paired-impulse`, `causal-stress-spending` | Patrones causales (data-science). Nadie piensa "el viernes CAUSA el sábado caro". `weekly-pattern` ya cubre "el finde es caro". |
| `forecast-tomorrow-risk`, `forecast-storm-week` | Pronósticos abstractos. `stress-week` ya avisa lo real (nombres + montos). |
| `super-hidden-drain` ("drenaje invisible") | Meta-confluencia pseudo-técnica; sus hijas (`small-leaks`, `cat-dominance`) ya viven claras. |
| `member-imbalance` | Nicho (familias 2+ registrando); el CTA puede incomodar. |
| `undetected-sub` | Housekeeping; compite con `zombie`/`hike`/`duplicate` que SÍ son plata en riesgo. |
| `start-splurge` | Síntoma post-gasto; se solapa con `velocity` + `cycle-start-projection`. |

Implementación: builders eliminados + calls fuera de `buildControlSignals` +
`super-hidden-drain` fuera de `composeSuperSignals` (quedan 2 meta-señales:
`super-perfect-storm`, `super-savings-momentum`, que COLAPSAN hijas → bajan
ruido). Causal-engine (`detectCausalLinks`) ya no alimenta a nadie → se
desactiva su cómputo.

## ✓ NÚCLEO DE SUPERVIVENCIA (se queda)
recovery-hard/soft · velocity · payday-proximity · forecast-payday-gap ·
stress-week · cycle-start-projection · end-acceleration · fijos-ratio ·
zombie · hike · duplicate · high-single-expense · small-leaks · cap ·
income-missing · data-gap-warning · income-volatility (simplificada)

## ✓ PROGRESO (se queda)
streak-ok · positive-forecast · savings-milestone · cat-win · cat-dominance ·
super-savings-momentum

## ~ SIMPLIFICAR (5) — HECHO (commit 84e3456)
- `payday-proximity`: un solo número (tope diario nuevo), sin comparar con el viejo.
- `savings-feasibility`: sin "shortfall/plan requerido"; el próximo paso chico en pesos.
- `night-impulse`: copy neutra (sin "impulsos"). El umbral se mantuvo en 70%
  (bajarlo dispara MÁS seguido, lo opuesto a "menos falsos positivos").
- `cat-accel`: sin "pico vs cambio de hábito"; una sola pregunta.
- `income-volatility`: sin estadística; "tu ingreso de este mes fue $X menos que otros meses".

## +1 slot de progreso — HECHO (commit 84e3456)
En el ranking/cap de señales visibles se reserva ≥1 lugar para una señal de
progreso (`PROGRESS_IDS` = streak-ok / positive-forecast / savings-milestone /
cat-win / super-savings-momentum) vía `reserveProgressSlot(list, cap)`: si las
primeras `cap` señales son todas alertas y hay una de progreso más abajo, la
sube al último slot visible. Equilibra el muro de rojos con un "vas bien".

## Barrido de jerga en las señales que quedaron — HECHO (2026-06-15)
Las 24 señales sobrevivientes todavía tenían jerga en sus strings de usuario
(`Sobregiro fuerte hoy`, `Excedente proyectado`, `Momentum positivo`,
`Racha: N días bajo cupo`, `Aceleración del X%`, `Cupo diario reajustado`,
`punto de apalancamiento`, …). Se reescribieron title/body/impact/cat/
dummyExplanation de todas ellas al estándar de voz (pesos primero, sin lista
negra, sin matemática mental, umbral como consecuencia y no número mágico).
Guardarraíl: `tests/unit/asistente-jerga.test.ts` ahora **también escanea
`control-signals.ts`** (antes quedaba fuera), así la jerga no puede volver a
entrar sin romper CI.
