# Convención de features: UI español sobre dominio inglés

Status: Vigente (documentado 2026-05-31, código vigente desde 2026-04).

## Por qué tenemos `gastos/` Y `expenses/` (no es duplicación)

El repo expone pares de carpetas en `mobile/features/` que parecen duplicados pero NO lo son. Son **dos capas distintas**:

| UI layer (español) | Domain/data layer (inglés)  | Rol |
|--------------------|------------------------------|-----|
| `features/gastos/` | `features/expenses/`         | El UI consume el dominio |
| `features/fijos/`  | `features/fixed-expenses/`   | El UI consume el dominio |

### Domain layer (carpetas inglesas)

- Tipos del modelo (`Expense`, `FixedExpense`).
- Repository hooks (`useExpenses`, `useFixedExpenses`).
- Lógica de agregación pura (analytics, budget engine, payment cycles).
- Mapeos a la DB / RPC payloads.
- **No usa copy en español. No conoce los componentes de UI.**

### UI layer (carpetas españolas)

- Controllers que orquestan el dominio (`useGastosController`, `useFijosController`).
- View-models específicos de la pantalla (snapshot RPC bundles, aggregates con copy).
- Constantes de copy en español (`gastos-aggregates.model.ts` usa "Hoy", "Esta semana", etc.).
- Hooks que combinan dominio + presentación.

## Cuándo crear cada uno

| Caso | Capa | Ejemplo |
|------|------|---------|
| Nueva tabla en DB | Domain inglés | `features/income/` |
| Nuevo endpoint RPC | Domain inglés | `features/income/income-repository.ts` |
| Nuevo aggregate con copy específico de pantalla | UI español | `features/gastos/gastos-aggregates.model.ts` |
| Nuevo controller que orquesta varios dominios | UI español | `features/gastos/use-gastos-controller.ts` |
| Pure formatter sin domain knowledge | `mobile/utils/` o `mobile/lib/` | `mobile/utils/percent.ts` |
| Pure helper compartido entre features | `mobile/lib/` | `mobile/lib/telemetry-session.ts` |

## Reglas de dependencia

- UI español PUEDE importar de domain inglés. **Domain inglés NO debe importar UI español** — eso crea ciclos.
- Domain inglés NO debe importar de OTRO domain inglés sin pasar por `mobile/lib/` o `mobile/utils/` si hay riesgo de ciclo. Los 2 ciclos cerrados en el code review 2026-05-31 (`home ↔ telemetry`, `expenses ↔ insights`) eran exactamente este caso.
- Si necesitás un helper en 2+ features, **es señal de que vive en `mobile/lib/`** (o `mobile/utils/` si es puro formato).

## Por qué bilingüe

- El producto se vende en español → el copy DEBE estar en español.
- El código de dominio es más fácil de mantener / pedir review en inglés (alineado con tipos de TS, librerías externas, error messages de Supabase, etc.).
- Mantener el split visible en la jerarquía de carpetas hace explícita la separación. Renombrar todo a inglés borraría la señal de "esto es UI con copy localizado".

## Otras carpetas que NO son duplicación

| Carpeta | Status | Rol |
|---------|--------|-----|
| `features/subscriptions-zombie/` | Domain distinto | Auditoría de fixed-expenses para detectar zombies (no es duplicación de fixed-expenses). |
| `features/billing/` | Domain distinto | Plan/sub status, separado de gastos. |
| `features/home/` vs `features/insights/` | Capas distintas | home = dashboard estable; insights = Control Center / Hoy / coach. |

## Referencia

- Code review consolidado 2026-05-31, P3 architecture #4.
- Memorias del proyecto: `project_snapshot_rpc_pattern.md` (UI español consume RPC bundles), `project_manifiesto_overview.md`.
