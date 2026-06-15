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

## ~ SIMPLIFICAR (5) — pendiente
- `payday-proximity`: un solo número (tope diario nuevo), sin comparar con el viejo.
- `savings-feasibility`: sin "shortfall/plan requerido"; el próximo paso chico en pesos.
- `night-impulse`: sin "impulsos"; neutro + bajar umbral a 60%.
- `cat-accel`: sin "pico vs cambio de hábito"; una sola pregunta.
- `income-volatility`: sin estadística; "tu ingreso de este mes fue $X menos que otros meses".

## +1 slot de progreso — pendiente
En el ranking/cap de señales visibles, reservar ≥1 lugar para una señal de
progreso (streak/positive-forecast/savings-milestone/cat-win/super-savings-momentum)
cuando exista, para equilibrar alertas con "vas bien".
