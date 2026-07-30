I have everything I need: the four mapping reports plus the established redesign pattern (home-spec.ts / home-screen.tsx / redesign-home-preview-screen.tsx, `usePressScale`, `RiseView` Keyframe, `CardParticles`, `CountUpText`, inline `experimental_backgroundImage` + `boxShadow`). Here is the synthesized build plan.

---

# PLAN DE BUILD — Réplica GASTOS (`gastos-spec.ts` + `gastos-screen.tsx` + preview dev)

Task #53. Mismo patrón que home/auth/onboarding/notifs. **Regla de fidelidad:** valores literales = estático (`gastos.dc.html`); comportamiento = interactivo (`renderVals()`). Donde divergen, marco **[OWNER]**. Cito los 4 informes como `[light]` `[dark]` `[cal]` `[states]` y `file:línea` cuando es load-bearing.

## 0 · Archivos y arquitectura

```
mobile/components/redesign/gastos/gastos-spec.ts     ← interface GastosSpec + Record<'light'|'dark'>
mobile/components/redesign/gastos/gastos-screen.tsx  ← componentes réplica + GastosFinalScreen (reducer)
mobile/screens/dev/redesign/redesign-gastos-preview-screen.tsx  ← preview + seeds
app/(app)/settings/dev/redesign-gastos.tsx           ← ruta dev (como redesign-home.tsx)
```

Registrar en `redesign-index-screen.tsx` + `redesign-approval-status.ts` (nueva key `'gastos'`, estado `pendiente`).

**Diferencia clave con Home:** la Home fue réplica casi estática con variantes por preset. **Gastos es una máquina de estados real** (calendario⇄detalle, dropdown, cambio de ciclo, taps de día). Por eso `GastosFinalScreen` posee un `useReducer` que replica el objeto de estado del mock (`{cyc, sel, venc, dayF, cat, dd}`; `mode` reemplaza a `dark`), computa los derivados una vez (`renderVals()` portado) y baja VMs a sub-componentes **presentacionales**. El screen es auto-conducido (los taps funcionan en vivo); el preview solo alterna tema y siembra estado inicial. Mantengo la convención Home: **sin props/seed → render idéntico al mockup aprobado** (defaults = datos demo `CY[0]`).

---

## 1 · `gastos-spec.ts` — tokens (interface `GastosSpec` + `Record<mode>`, valores LITERALES ambos temas)

Estructura idéntica a `HomeSpec`: campos planos, sombras como string literal inline, gradientes como string CSS en `*Css`, JSDoc en los desvíos. Agrupo por sección. Alias `raise/raiseSm/raiseLg/ins/insSoft` = defino el literal una vez (§1.0) y lo referencio; en el `.ts` real se **inlinea** el string por campo (como hace home-spec).

### 1.0 · Base del tema (helpers del interactivo, `states int:181-194`)

| token | LIGHT | DARK |
|---|---|---|
| `bg` | `#E9EBE0` | `#16271C` |
| `cardGradientCss` | `undefined` (plano) | `linear-gradient(145deg, #1D3426, #132318)` |
| `cardBackground` | `#E9EBE0` | `#1A2D21` |
| `text` | `#24382A` | `#F1EEDD` |
| `sub` | `#6C7B67` | `#93A78F` |
| `faint` | `#9AA694` | `#7C917A` |
| `d2` | `#3E5A44` | `#B9CCB2` |
| `green` | `#2E7C39` | `#A4E3A6` |
| `onDark` | `#F5F2E1` | `#F5F2E1` |
| `shellShadow` | `0 34px 80px rgba(8,14,8,0.55)` | `0 34px 80px rgba(0,0,0,0.6)` |
| `statusInk` | `#24382A` | `#F1EEDD` |
| **alias** `raise` | `8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)` | `8px 8px 18px rgba(0,0,0,0.55), -8px -8px 18px rgba(101,152,113,0.1)` |
| **alias** `raiseSm` | `6px 6px 14px rgba(151,160,136,0.42), -6px -6px 14px rgba(255,255,255,0.9)` | `6px 6px 14px rgba(0,0,0,0.55), -6px -6px 14px rgba(101,152,113,0.12)` |
| **alias** `raiseLg` | `10px 10px 22px rgba(151,160,136,0.45), -10px -10px 22px rgba(255,255,255,0.95)` | `10px 10px 22px rgba(0,0,0,0.55), -10px -10px 22px rgba(101,152,113,0.12)` |
| **alias** `ins` | `inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)` | `inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)` |
| **alias** `insSoft` | `inset 2px 2px 5px rgba(151,160,136,0.3), inset -2px -2px 5px rgba(255,255,255,0.8)` | `inset 2px 2px 5px rgba(0,0,0,0.45), inset -2px -2px 5px rgba(101,152,113,0.07)` |
| `insBg` (fill del pozo dark) | `undefined` | `#142519` |

**Regla dark:** todo pozo (`ins`) lleva además `background:#142519` (`insBg`), salvo chips de filtro inactivos que usan `#122015` (§1.6) `[dark]`.

**Radios** (constantes, no tokens de color): `phone 46 · hero 32 · card 28 · row 22 · well 24 · chip 18 · navPill 18 · day 13 · tile 16 · badge 9 · arrow 20 · brotBtn 25`.

### 1.1 · Header + trigger de ciclo (`states int:41,283-285,307-308`; **[OWNER-G]** versión interactivo)
`title{34/900, lineHeight≥39}` color `text`. Brot btn (disco 50→r25) `cardGradientCss/cardBackground` + `raiseSm`, pose dinámica. Badge notif `🌱 1`: bg `green`·ink `onDark` (pastilla) — o naranja numérico `#D97E4F/#FFF7E8` si owner elige estático.
- `cycTrigInk`: cur `sub` / closed L `#8A5A2E` · D `#D9B36A`
- `cycTrigDotCur`: L `#2E7C39` · D `#A4E3A6` + glow `0 0 8px rgba(120,220,130,0.7)` + `mfPulse`
- `cycTrigDotClosed`: L `#C9A05A` · D `#D9B36A` (sin glow)
- `cycCaret`: `▾` 9px opacity .75

### 1.2 · Dropdown de ciclo (`states int:288-301`)
`ddContainer` = `cardGradientCss/cardBackground` + `raise`, r20. `ddIconInk` `green`; `ddNameInk` `text`; `ddTagCurInk` `green`; `ddTagClosedInk` L `#B05E2F` · D `#D9B36A`; `ddActiveBg` `insBg` + `ddActiveShadow` `ins`. **No construir la fila horizontal de pastillas HOY/MAY/ABR** — es dead code en el mock (`states §b`).

### 1.3 · Hero forest (`light §3` + `dark §3`; **[OWNER-B]** el estático tiene tratamiento dark propio — gana estático)
- `heroGradientCss` (ambos): `linear-gradient(155deg, #2E6B33 0%, #3F8746 55%, #57A05C 100%)` — **[OWNER-F]:** es el forest del handoff Gastos, distinto del forest owner-desviado de la Home (`#244235→#297811`). Confirmar si unificar.
- `heroShadow`: L `12px 12px 26px rgba(124,138,110,0.55), -8px -8px 20px rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.25)` · D `14px 14px 30px rgba(0,0,0,0.5), -6px -6px 16px rgba(101,152,113,0.14), inset 0 1px 0 rgba(164,227,166,0.18)`
- `heroDot` `#C9F3C6` (ambos); `heroLabelInk` `rgba(240,248,230,0.85)` (ambos)
- `heroChip{ink #F2F7E6, bg rgba(255,255,255,0.16), shadow inset 0 1px 2px rgba(20,45,25,0.25)}` (ambos)
- `well{bg rgba(13,34,18,0.30), shadow inset 6px 6px 14px rgba(6,20,10,0.5), inset -5px -5px 12px rgba(130,190,130,0.18)}` (ambos)
- `amountInk`: L `#F7F4E4` · D `#EFF6E2`; `amountTextShadow` (**NO string**): L color `rgba(10,30,15,0.35)` offset `{0,2}` radius `8` · D color `rgba(150,230,160,0.3)` offset `{0,0}` radius `26` (glow)
- `statLabelInk`: L `rgba(240,248,230,0.8)` · D `#9FB89C`; `statValueInk`: L `#F7F4E4` · D `#EFF6E2`
- `bar7Bright rgba(240,248,230,0.75)` · `bar7Dim rgba(240,248,230,0.45)` · `bar7Peak #EFF6E2` (ambos); alturas `[12,18,9,14,22,11,6]`, pico = idx5
- `catTrackBg`: L `rgba(15,35,20,0.35)` · D `rgba(10,22,13,0.6)`; `catTrackShadow inset 0 1.5px 3px rgba(10,25,14,0.4)`; `catFillCss`: L `linear-gradient(90deg, #C9F3C6, #EFF6E2)` · D `linear-gradient(90deg, #5F9E66, #A4E3A6)`; `catTextInk #F2F7E6`

### 1.4 · Calendario — card + estados de día (`cal §1-2`; pesos por estado del estático **[OWNER-H]**)
- `calShadow` = `raise`; `calTitleInk` `sub`; `calHintInk` `green` (hint `tocá un día`); `weekdayInk` `faint`
- `dayBien`: bg L `#DCEBD8`·D `rgba(164,227,166,0.16)`; ink L `#3E6B44`·D `#B5DDB4`; shadow L `inset 2px 2px 4px rgba(90,110,70,0.15)`·D `inset 2px 2px 4px rgba(0,0,0,0.45), inset -2px -2px 4px rgba(164,227,166,0.08)`; **w800**
- `dayExceso`: bg L `#F3C9BC`·D `rgba(217,115,85,0.24)`; ink L `#A84A2F`·D `#F2A87E`; shadow L `inset 2px 2px 4px rgba(150,80,50,0.2)`·D `inset 2px 2px 4px rgba(0,0,0,0.45), inset -2px -2px 4px rgba(242,168,126,0.08)`; **w900**
- `dayHoy`: bg L `#24382A`·D `#F1EEDD`; ink L `#F5F2E1`·D `#16271C`; shadow L `0 6px 14px rgba(36,56,42,0.35)`·D `0 0 18px rgba(241,238,221,0.25)` (elevado/glow, NO inset); **w900**; `dayHoyDot` L `#A4E3A6`·D `#2E7C39` (**invertido** `[cal §2.3]`)
- `dayFuturo`: bg L `undefined`·D `#142519`; ink L `#B3BCA8`·D `#5F7361`; shadow L `insSoft`·D `inset 2px 2px 5px rgba(0,0,0,0.45), inset -2px -2px 5px rgba(101,152,113,0.07)`; **w700**
- `daySelRing`: L `0 0 0 3px #2E7C39`·D `0 0 0 3px #A4E3A6` (**reemplaza** la sombra de estado `[cal §2.2]`)
- `dayFuera` (**NO theme-switched**): bgCss `repeating-linear-gradient(135deg, #F3C9BC 0 6px, #EFB8A6 6px 12px)`; shadow `0 0 0 2px #D97355, 0 4px 10px rgba(217,115,85,0.35)`; ink `#8A3A20`; w900; sub `FUERA` 7px/0.56px
- Adornos estáticos **[OWNER-A]**: `daySprout 🌱` (día 28) + `dayHoyDot` bajo el 7. Recomiendo incluir; interactivo los omite.
- Leyenda (si owner la conserva): `legendBien` L `#7FB069`·D `#A4E3A6`; `legendAlerta #E8A87C`; `legendExceso #D97355` (ambos)

### 1.5 · Detalle de día (`cal §3`, `states §d`; valores in-phone del interactivo)
- `dayCard` = `cardGradientCss/cardBackground` + `raise`, r28, pad 16/18/16
- `detailLabelInk` `sub` (`DÍA SELECCIONADO`)
- `detailBadge` (**NO theme-switched** `[OWNER-C]`): ink `#A84A2F`, bg `#F3C9BC`, shadow `inset 2px 2px 4px rgba(150,80,50,0.2)`
- `backCalInk` `green` + `insBg` + `ins`
- `arrow{bg card, shadow raise, glyph d2}` → **SVG chevron** 15×15 sw2.8 (`M15 6l-6 6 6 6` / `M9 6l6 6-6 6`) `[cal §3.2]`
- `dayNumInk` `text` (42px, **lineHeight ≈48**); `detailSubInk` `sub`
- `statBorder rgba(151,160,136,0.35)` (ambos, NO theme-switched); `statLabelInk` `faint`; `statValGastadoInk` L `#B05E2F`·D `#F2A87E`; `statValMovInk` `text`
- `outStrip`: bg L `#F5DCCE`·D `rgba(217,115,85,0.14)`; shadow `inset 2px 2px 5px rgba(150,80,50,0.2)` (NO theme-switched); `outStripInk` L `#8A4A30`·D `#F2A87E`
- `ctaPrimaryInk` L `#F5F2E1`·D `#0F1E14`; `ctaPrimaryGradCss` L `radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)`·D `radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)`; `ctaPrimaryShadow 0 8px 16px rgba(46,116,52,0.3), inset 0 2px 3px rgba(255,255,255,0.3)` (ambos)
- `ghostInk` `d2` + `insBg` + `ins`

### 1.6 · Filtro (`light §5`, `dark §6`; chip inactivo dark = estático `#122015` **[OWNER]**)
- `filterLabelInk` `sub`
- `chipActiveInk` L `#F5F2E1`·D `#0F1E14`; `chipActiveGradCss` = mismo radial que `ctaPrimaryGradCss`; `chipActiveShadow` L `0 8px 16px rgba(46,116,52,0.3), inset 0 2px 3px rgba(255,255,255,0.3)`·D `0 0 18px rgba(140,225,150,0.25), inset 0 2px 3px rgba(255,255,255,0.35)`; `chipActiveBadgeBg` L `rgba(255,255,255,0.25)`·D `rgba(15,30,20,0.25)`; `chipActiveBadgeInk` L `#F5F2E1`·D `#0F1E14`
- `chipInactiveInk` L `#3E5A44`·D `#B9CCB2`; `chipInactiveBg` L `undefined`·D `#122015`; `chipInactiveShadow` L `ins`·D `inset 4px 4px 10px rgba(0,0,0,0.62), inset -4px -4px 10px rgba(101,152,113,0.16)`; `chipInactiveBadgeBg` L `#DCEBD8`·D `rgba(164,227,166,0.16)`; `chipInactiveBadgeInk` L `#3E6B44`·D `#A4E3A6`
- `fadeGradCss` L `linear-gradient(90deg, rgba(233,235,224,0), #E9EBE0)`·D `linear-gradient(90deg, rgba(22,39,28,0), #16271C)`

### 1.7 · Movimientos (`light §6`, `dark §7`)
- `sectionLabelInk` `sub`; `sectionCountInk` `green`; `dayHeadLabelInk` `sub`; `dayHeadTotalInk` `text`
- `movRow` = `cardGradientCss/cardBackground` + `raise`, r22; `movTitleInk` `text`; `movSubInk` `sub`; `movAmountInk` `text`
- Tiles pastel: `tilePink 🍕` L `#F6D9D2`·D `rgba(246,217,210,0.14)`; `tileMerc 🛒` L `#E2EDD2`·D `rgba(226,237,210,0.13)`; `tileRose 🩺` L `#F5D8DD`·D `rgba(245,216,221,0.14)`; `tileMint 🏠` L `#DDEBDD`·D `rgba(164,227,166,0.14)`
- `seeMoreInk` `green` + `insBg` + `ins`; chevron SVG 12×12 sw3 (`M6 9l6 6 6-6`)
- `movChipInk` `green` (chip `✕ Día N · ver todo`, press opacity)
- `dayRowTile` = `tileMint` (fila sintética 🧾 `Movimientos del día`)

### 1.8 · Barra ciclo cerrado + banner vencido (`states §c-d`)
- `closedBarInk` L `#8A5A2E`·D `#E8C88A`; `closedBarBgCss` L `linear-gradient(145deg, #F0E4C4, #E4D4A8)`·D `linear-gradient(145deg, #3A3322, #2A2416)`; `closedBarShadow` L `6px 6px 14px rgba(140,110,60,0.3), -6px -6px 14px rgba(255,255,255,0.8)`·D `6px 6px 14px rgba(0,0,0,0.5)`; `closedBtnInk` = `closedBarInk` (underline)
- `phoneDashedOutline` (→ SVG): L `#C9A05A`·D `#8A6A38`, 3px, offset 6px
- **Banner vencido (NO theme-switched, paleta única ambos temas):** `alertBgCss linear-gradient(145deg, #F5D9C8, #EFC5AE)`; `alertShadow` `8px 8px 18px rgba(160,110,80,0.35), -8px -8px 18px rgba(255,255,255,0.85)` (estático `[light §10]` — **[OWNER-E]** el interactivo usa `8px 8px 18px rgba(120,70,45,0.4)`); `alertTitleInk #7A2E17`; `alertSubInk #8A4A30`; `confirmBtnInk #FFF3E8`; `confirmBtnBg #C25B33`; `confirmBtnShadow 0 6px 12px rgba(194,91,51,0.4)`. Brot `worried` (comportamiento interactivo, supersede el ícono ring+glow del showcase D3).

### 1.9 · Nav + FAB + home indicator
**Reusar el kit de nav de la Home** (`navGradientCss/navShadow/navActiveBackground/navActiveShadow/navActiveInk/navIdleInk/fabGradientCss/fabShadow/fabInk/fabWellShadow/homeIndicator/homeIndicatorOpacity` ya viven en `home-spec`), con `activeTab='gastos'`. **No re-transcribir**; el restyle real va en F5 (tasks #48/#54) `[states div#9]`. Íconos: Gastos activo `rect x6 y4 w12 h16 rx2.5 + M9.5 9h5M9.5 13h5`.

---

## 2 · `gastos-screen.tsx` — componentes a exportar (uno por sección) + props

VMs bajados por el reducer. Cada `Props` incluye `mode` + los ejes de estado/callbacks que necesita. Patrón: `Pressable` solo si hay callback; `usePressScale` a nivel módulo; `MOCKUP_*` defaults = `CY[0]`.

| Componente | Props (además de `mode`) | Ejes de la máquina que consume |
|---|---|---|
| `GastosStatusBar` | — | (chrome; reusar de Home) |
| `GastosHeader` | `cycleLabel`, `cycleVariant: 'current'\|'closed'`, `brotPose: BrotPose`, `badge?`, `onToggleDropdown` | `cyc`→variant/label, `venc`→pose (`worried`/`wave`/`think`), `dd` |
| `CycleDropdown` | `open`, `items: {name,tag,tone:'current'\|'closed',active}[]`, `onSelect(i)`, `onClose` | `dd`, `cyc` |
| `GastosHero` | `tag`, `chipLabel`, `amount`, `promAvg`, `bars7:number[]`, `categories:{emoji,name,amount,pct,width}[]` | `cyc` (todo el contenido + **anima width** al cambiar) |
| `GastosCalendar` | `cells: DayCell[]`, `sel`, `venc`, `onSelectDay(n)` | `cyc`,`sel`,`venc`,`dayF` (visibilidad); estado por celda derivado |
| `GastosDayDetail` | `dayNum`, `sub`, `badge?`, `gastado`, `movs`, `isOut`, `isCurrent`, `onPrev`,`onNext`,`onBackToMonth`,`onRegister`,`onMarkEmpty` | `sel`,`cyc`,`venc` (out/fut/bad, CTAs solo `isCurrent`) |
| `GastosFilter` | `chips:{label,count,active}[]`, `onSelect(i)` | `cat` |
| `GastosMovements` | `sectionCount`, `groups: DayGroup[]`, `dayFiltered`, `dayRow?`, `onClearDay`, `onSeeMore` | `cyc`,`dayF`,`sel` (colapsa a 1 grupo si `dayF`) |
| `GastosClosedBar` | `onBackToCurrent` | `viewingClosed` (`cyc>0`) |
| `GastosOverdueBanner` | `onConfirm` | `showAlert` (`cur && venc`) |
| `GastosNav` | `activeTab='gastos'`, `onTab`, `onFab` | — (reusar Home nav) |
| `GastosPhoneOutline` | — (SVG dashed overlay) | `viewingClosed` |
| `GastosFinalScreen` | `initialState?: Partial<GastosState>` | **posee el `useReducer`** + `renderVals()` |

**Composición** (`GastosFinalScreen`, orden del scroll): StatusBar → Header(+trigger) → `{dd && CycleDropdown}` → `{showAlert && OverdueBanner}` → `{viewingClosed && ClosedBar}` → Hero → `{showCal ? Calendar : DayDetail}` → Filter → Movements → Nav → HomeIndicator. Envuelto en `{viewingClosed && PhoneOutline}` absoluto.

**Reducer** (`renderVals()` portado `[states §a]`): estado `{cyc:0, sel:7, venc:false, dayF:false, cat:0, dd:false}`; `CY[]` con los 3 ciclos (`states` tabla literal); `gmap` día→[gastado,movs]; handlers `toggleDropdown/confirmCobro/prevCycle/nextCycle/prevDay/nextDay/clearDay/selectDay/selectCycle/selectFilter`. Derivados: `cur/viewingClosed/isCurrent/showAlert/out/fut/isBad/showCal/showDay/showG2/brotPose`.

---

## 3 · Máquina de estados del PREVIEW

`GastosFinalScreen` es **auto-conducido** (todos los taps del owner funcionan en vivo). El preview aporta: (a) toggle de tema `🌙/☀️`, (b) ciclador de **seeds** `🧪` que inyecta `initialState`, (c) salir `✕`. `key={seed.key}` remonta el árbol al cambiar seed (resetea Brot/reducer). Desde cualquier seed el owner alcanza el resto tocando.

| seed key | `initialState` | recorre |
|---|---|---|
| `actual` (default) | `{}` | base: cur, cal, hero TOTAL VISIBLE |
| `vencido` | `{venc:true}` | banner + días `+20/+21` FUERA |
| `cerrado-mayo` | `{cyc:1}` | edición cerrada: barra solo-lectura + outline dashed + Brot think + sin CTAs |
| `cerrado-abril` | `{cyc:2}` | segundo ciclo cerrado (margen +) |
| `dropdown` | `{dd:true}` | selector de ciclo abierto (mfDrop) |
| `dia-hoy` | `{sel:7,dayF:true}` | detalle día HOY + movimientos filtrados a 1 grupo |
| `dia-exceso` | `{sel:24,dayF:true}` | badge `Día de exceso` + statValGastado durazno |
| `dia-futuro` | `{sel:12,dayF:true}` | detalle `— / 0`, CTAs presentes |
| `dia-fuera` | `{venc:true,sel:20.5,dayF:true}` | badge `Fuera de ciclo` + strip Brot sad |
| `filtro-hogar` | `{cat:1}` | chip `🏠 Hogar` activo (solo visual) |

Cubre los 10 ejes pedidos: claro/oscuro (toggle) · actual/cerrado (`cyc`) · día seleccionado (`sel+dayF`) · vencido (`venc`) · futuro · exceso · fuera-de-ciclo · dropdown (`dd`) · filtro activo (`cat`).

---

## 4 · Animaciones (primitiva del proyecto)

| animación | dónde | primitiva |
|---|---|---|
| **mfIn** (fade + translateY12 + scale .985→1, 300ms `cubic-bezier(0.22,0.9,0.3,1)`) | calCard, dayCard, outStrip, closedBar, banner | `RiseView` (Keyframe entering, `translateY={12}`) — **`key` en la card que se intercambia** para re-disparar el entering al alternar cal⇄detalle `[cal §7]` |
| **mfDrop** (opacity + translateY-10 + scale .97, 240ms) | CycleDropdown | `Keyframe` propio (RN no tiene `transform-origin`; panel chico → translateY basta) |
| **mfPulse** (glow del dot EN CURSO, 2.6s loop) | cycTrigDot cur | `useSharedValue` + `withRepeat(withTiming)` sobre opacity de un anillo peach/verde absoluto detrás del dot — **patrón exacto del ripple del chip "¿Ya cobraste?"** en `home-screen.tsx:391-418`; parkeado con reduced-motion |
| **width de barras de categoría** (0.55s al cambiar ciclo) | GastosHero | `onLayout` mide el track (%-width no es confiable en svg/flex, ver `home-screen:582-589`) + `useSharedValue`+`withTiming` sobre el width del fill |
| **press-scale** | días 0.88 · arrows 0.88 · brotBtn 0.9 · FAB 0.9 · chip filtro 0.93 · confirm 0.93 · backCal 0.94 · dropdown item 0.97 · CTA/ghost/seeMore 0.97 | `usePressScale({pressedScale})` + `AnimatedPressable` |
| **press-opacity** | cycTrigger 0.65 · movChip/closedBtn 0.55 | `Pressable` con `style={({pressed})=>...}` (patrón NotifHeader; `usePressScale` es solo scale) |
| **CountUp** (opcional flourish del monto hero / dayNum al cambiar ciclo) | GastosHero.amount, DayDetail.dayNum | `CountUpText` (`components/home/animated/count-up-text`) |
| **partículas** hero | capa absoluta r32 overflow hidden | `CardParticles` (Skia) `colors=['#C9F3C6','#FBD9BC','#EFF6E2'] count={10}` |
| transición de tema | swap de spec | **instantáneo** (como Home; NO animar). El `0.4s ease` del mock es web-only |

Todo bajo `useReducedMotion` (ojo import-trap del jank Android `project_android_lowend_jank_rootcause`).

---

## 5 · Riesgos / gotchas de transcripción RN (puntuales de Gastos)

1. **Grilla del calendario** — RN no tiene CSS grid. Fila de 7 con `flexWrap` + ancho de celda fijo = `(anchoCard − 6×gap7)/7` medido por `onLayout` (más fiable que `flexBasis`). **5 celdas blank** iniciales (día 20 = sábado col6) hardcodeadas en el mock; +2 celdas FUERA cuando `venc` (→ 37 celdas, 6ª fila) `[cal §1.4]`. **Flag cableado:** el offset de 5 debe computarse del weekday real del inicio de ciclo.
2. **selRing reemplaza la onda de estado** — semántica "última decl. inline gana": el día seleccionado **pierde** su `inset` y muestra SOLO el anillo. En RN aplicar únicamente `boxShadow:'0 0 0 3px <accent>'` (spread, sin blur → **sin layout shift**; NO usar `borderWidth`, que agranda la celda) y NO apilar la sombra de estado `[cal §2.2]`.
3. **Rayado fuera-de-ciclo** — `experimental_backgroundImage:'repeating-linear-gradient(135deg, #F3C9BC 0 6px, #EFB8A6 6px 12px)'` (string CSS literal, confirmado). El anillo `0 0 0 2px #D97355` = 2ª sombra spread en el mismo `boxShadow` string `[cal §6.1-6.3]`.
4. **Outline dashed del teléfono (ciclo cerrado)** — `borderStyle:dashed` NO rinde en iOS → `react-native-svg` `<Rect rx=46 strokeDasharray>` en overlay absoluto, `pointerEvents="none"`, inset −6 (offset FUERA del frame) `[states gotcha#1]`.
5. **Dropdown sin `transform-origin`** — RN no lo soporta; panel pequeño anclado arriba → aproximar con translateY. `mfDrop` como Keyframe.
6. **Fade del scroller de filtro** — `ScrollView horizontal` + overlay `View` absoluto derecho (w34) con `experimental_backgroundImage:fadeGradCss` + `pointerEvents="none"`. El bleed de sombras (`margin:-6/-24` del mock) se replica con `contentContainerStyle` padding, no con margins negativos.
7. **boxShadow multi-sombra + inset** — minSdk 29 OK; **inset <API29 / outset <API28 se aplana silenciosamente** en Android viejo (`feedback_rn_boxshadow_android_api_gate`) → el neumorfismo se achata pero gradientes rinden. El home-kit inlinea los strings sin gate; seguir ese criterio (limitación aceptada).
8. **textShadow del monto hero** — NO string: `textShadowColor/Offset/Radius`. Dark = glow `{0,0}` radius26; RN soporta UNA sola text-shadow (no combinar con la light).
9. **lineHeight ≈ fontSize en Nunito 900** (clippea ascender): monto 40→`lineHeight≈46-48`, dayNum 42→`≈48`, título 34→`≈39`. Celdas 13px flex-centradas van OK sin lineHeight `[light §8.5, cal §6.5]`.
10. **borderRadius 50%→mitad**: brotBtn 50→25, badge 18→9, arrows 40→20, FAB 62→31, fabInner 44→22, dots 7→3.5 / 8→4 / 4→2 / 9→4.5.
11. **letter-spacing em→px** (×fontSize): `0.16em·11.5=1.84` (FILTRAR/MOVIMIENTOS) · `0.14em·11=1.54`/`·11.5=1.61` (calLab/heroTag) · `0.12em·11=1.32` (headers grupo) · `0.1em·9.5=0.95`/`·10.5=1.05` (statLab/hero) · `-0.02em·40=-0.8` (monto) · `0.08em·7=0.56` (sub FUERA) · `0.06em·11.5=0.69` (closedBar).
12. **Barras animadas** — ver §4 (medir track por `onLayout`, animar width por `withTiming`).

---

## 6 · Decisiones pendientes de owner (surface, no decidir en silencio)

- **[A]** Calendario: `hint "tocá un día"` (interactivo, canónico) vs leyenda 3-dots + subtítulo largo + 🌱día28 + dot bajo día7 (estático). Los informes se dividen. **Recomiendo:** hint + conservar 🌱/dot (detalle premium); descartar leyenda (menciona un estado "alerta" que ninguna celda usa `[cal §1.2]`).
- **[B]** Hero: aplicar tratamiento dark propio del estático (glow, `#EFF6E2`, track/fill oscuros) vs forest claro invariante del interactivo. **Recomiendo estático** (regla valor-verdad) `[dark §3]`.
- **[C]** Badge del detalle (`Día de exceso`/`Fuera de ciclo`) hardcodeado warm-claro también en dark. **Recomiendo** remapear a exceso-dark (`rgba(217,115,85,0.24)`/`#F2A87E`) en oscuro, o dejar. Owner decide `[cal §3.1]`.
- **[D]** Día FUERA renderiza strip Brot-sad **Y** los 2 CTAs (probable oversight del mock). ¿Ocultar CTAs en días fuera? `[cal §3.5]`.
- **[E]** Sombra del banner vencido diverge estático (`rgba(160,110,80,0.35)…`) vs interactivo (`rgba(120,70,45,0.4)`). **Recomiendo estático.**
- **[F]** Gradiente del hero: forest del handoff Gastos (`#2E6B33→#57A05C`) vs forest owner-desviado de la Home (`#244235→#297811`). ¿Unificar con Home?
- **[G/H]** Header = versión interactivo (trigger + Brot dinámico + `🌱 1`); pesos de celda per-estado del estático (800/900/900/700). **Recomiendo ambos** (ya reflejado arriba).

**Archivos leídos (referencia, no modificados):** `mobile/components/redesign/home/home-spec.ts`, `mobile/components/redesign/home/home-screen.tsx`, `mobile/screens/dev/redesign/redesign-home-preview-screen.tsx`, `mobile/hooks/use-press-scale.ts`, `mobile/components/home/animated/rise-view.tsx`, `mobile/lib/motion/tokens.ts`, y los 4 handoffs en `design/gastos-2026-07/`.
