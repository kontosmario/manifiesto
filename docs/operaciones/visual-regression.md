# Visual Regression Baseline · 2026-06-09

> **Sprint C · C12** — Plan + setup base para snapshot tests de componentes UI. **Status**: doc + decisión técnica. Implementación gradual cuando arranquemos D (refactor de los archivos grandes).

## Por qué

Hoy no hay forma automática de detectar regresiones visuales en componentes core (home-hero-card, control-v2-alcancia-card, etc). Un cambio de CSS / token / re-orden de Reanimated styles puede romper el render sin que ningún test falle. Los catch-paths actuales son:
- Manual: dev abre el app antes de PR.
- CI: typecheck + unit tests + Metro bundle. NO render.

Visual regression cierra este gap detectando diff > N% de pixeles entre baseline y nueva render del PR.

## Tooling — análisis de opciones

### Opción A: Storybook + Chromatic ⭐ (recomendada)

**Pros**:
- Storybook ya documenta componentes en isolation — sumamos diseño explícito.
- Chromatic free tier: 5,000 snapshots/mes. Para 10 componentes × 2-3 variants × N PRs/mes, alcanza para equipos chicos.
- Workflow integrado con GitHub: PR comments con diff visual + approve flow.
- Tracking histórico de baselines (auditable).

**Cons**:
- Setup inicial ~4-6h. Storybook 7+ en RN requiere `@storybook/react-native@next` + `react-native-storybook-loader`.
- Cuesta $149/mes en el primer paid tier — pero free es suficiente para v1.
- Snapshots se toman en web export (no en iOS/Android nativo) — diferencias de render son posibles pero raras en components puros.

**Stack a instalar**:
```
@storybook/react-native@next
@storybook/addon-react-native-web
chromatic
```

### Opción B: Loki (open-source local)

**Pros**:
- Sin dependencia de SaaS — corre en CI con Docker + Chromium.
- Free.

**Cons**:
- Mantenimiento del Docker image en CI.
- No tiene workflow de approve/baseline cloud — el baseline vive en el repo como PNGs commiteados (puede crecer el repo).

### Opción C: Native screenshots (react-native-screenshot-tests)

**Pros**:
- Tests en iOS / Android nativos — captura diferencias reales de runtime.

**Cons**:
- Requiere simulator running en CI (macOS runner = caro).
- Tooling menos maduro en RN; abandonware risk.

### Decisión

**Opción A (Storybook + Chromatic)** — el free tier cubre v1 sin pagar, el workflow PR-friendly compensa el setup. Migrar a B si Chromatic cap se vuelve problema (>5k snapshots/mes).

## Scope inicial — 6 componentes core

| Componente | Path | Variants a snapshottear |
|---|---|---|
| `home-hero-card` | `mobile/components/home/home-hero-card.tsx` | default, sin meta, con surplus, con deficit |
| `control-v2-alcancia-card` | `mobile/components/control-v2/control-v2-alcancia-card.tsx` | empty, partial, full, overflow |
| `meta-card` | `mobile/components/home/meta-card.tsx` | sin goal, con goal at 0%, 50%, 100% |
| `gastos-hero-card` | `mobile/components/gastos/gastos-hero-card.tsx` | (verificar path) — default + cycle nav extremes |
| `fijo-row` | `mobile/components/fijos/fijo-row.tsx` | unpaid, paid, overdue, hike-flagged |
| `wrapped scenes` | `mobile/components/wrapped/cycle-wrapped-modal.tsx` (post-D2 split) | cover, verdict, top-categories, savings, close |

**Total snapshots inicial**: ~20-25. Holgado dentro del cap de 5k/mes incluso a 200 PRs/mes.

## Setup commands

### Local

```bash
npm install --save-dev @storybook/react-native @storybook/addon-react-native-web chromatic
npx storybook init
```

Crear `mobile/.storybook/main.js`:
```js
export default {
  stories: ['../components/**/*.stories.tsx'],
  addons: ['@storybook/addon-react-native-web'],
  framework: '@storybook/react-native',
}
```

Crear un `.stories.tsx` por componente. Ejemplo para `home-hero-card`:

```tsx
// mobile/components/home/home-hero-card.stories.tsx
import { HomeHeroCard } from './home-hero-card'

export default { title: 'Home/HeroCard' }

export const Default = () => (
  <HomeHeroCard meta={1500000} spent={800000} ... />
)

export const NoMeta = () => (
  <HomeHeroCard meta={null} spent={0} ... />
)

export const Deficit = () => (
  <HomeHeroCard meta={500000} spent={750000} ... />
)
```

### CI (Chromatic)

`.github/workflows/visual-regression.yml`:
```yaml
name: Visual Regression
on: [pull_request, push]
jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - uses: chromaui/action@v1
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
```

Owner pendiente:
1. Crear proyecto en chromatic.com → copiar `CHROMATIC_PROJECT_TOKEN`.
2. Agregar como GitHub secret en el repo.

## Cost analysis

| Plan | Snapshots/mes | Cost |
|---|---|---|
| Chromatic Free | 5,000 | $0 |
| Chromatic Starter | 35,000 | $149/mo |

Estimación uso v1 (10 stories × 3 variants × 50 PRs/mes × 2 runs) = ~3,000 snapshots/mes → **free tier OK**.

Si llegamos al cap: reducir variants a snapshot, o promover a Starter solo si MAU justifica.

## Plan de implementación incremental

### Fase 1 (Sprint C — este sprint)
- [x] Documentar plan (este file).
- [ ] No instalar Storybook todavía — hay que cerrar D1/D2/D4 antes para que los components estén split-listos.

### Fase 2 (post-D2 — split wrapped + gastos)
- [ ] Instalar Storybook + Chromatic.
- [ ] Setup `.storybook/main.js` + token de Chromatic.
- [ ] 2-3 stories iniciales (home-hero-card + meta-card + alcancia-card).
- [ ] Workflow CI corriendo.

### Fase 3 (post-Sprint D completo)
- [ ] Stories completas para los 6 components del scope.
- [ ] Variants documentados.
- [ ] Threshold de diff configurado (default 0.1% — suficiente para detectar regresiones reales sin falsos positivos por antialiasing).

## Riesgos

1. **Render web ≠ render iOS**: ciertas props (e.g. `borderRadius` con `overflow: hidden` + transforms) renderean distinto. Solo confiamos en regresión visual para components puros — los que tienen Reanimated complejo se testean manualmente.
2. **Falsos positivos por fuentes**: cada PR del wrap loader de fonts puede mover 1px de baseline. Mitigación: ignorar regiones con `data-chromatic="ignore"`.
3. **Maintenance burden**: cada cambio intencional requiere "Approve in Chromatic" — friction extra en PRs. Mitigable con auto-approve para owner.

## Próximos pasos concretos

- [ ] Owner: crear cuenta Chromatic + project token (5 min).
- [ ] Dev: post-D2, instalar Storybook + setup primera story como prueba (1h).
- [ ] Dev: pegar workflow en CI y verificar que Chromatic publica el primer baseline (30 min).

---

> **Última actualización**: 2026-06-09 · plan + decisión técnica. Implementación a iniciar post-Sprint D.
