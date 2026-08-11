# Handoff final — Manifiesto · Home neumórfica + catálogo de estados

Paquete para desarrollo. Abrir los `.dc.html` directamente en un browser (los `.js` deben quedar en la misma carpeta).

## Files
- `Home Manifiesto.dc.html` — **Home terminada** en tema claro y oscuro, lado a lado (fuente de verdad del layout)
- `Estados Manifiesto.dc.html` — **catálogo completo de estados** de cada componente (claro+oscuro), incluye estados vacíos / usuario nuevo
- `brot.js` — mascota `<brot-mascot>` (canvas, sin dependencias)
- `particles.js` — partículas `<brot-particles>` de los heros
- `logo-light.png` / `logo-dark.png` — logo oficial por tema
- `support.js` — runtime del preview (solo para abrir los .dc.html; NO portar)
- Animaciones de arranque (cold start + bridge auth): paquete aparte `design_handoff_arranque/`

## Tipografía
Nunito 400–900 (Google Fonts). Números protagonistas 900; labels en mayúsculas 800 con letter-spacing 0.10–0.16em. Texto mínimo UI 10.5px (solo captions), cuerpo ≥12px, hit targets ≥44px.

## Tokens

### Tema claro
- Fondo `#E9EBE0` · superficie card `#E9EBE0` / gradiente `#F0F2E7→#E1E4D6` (nav)
- Texto `#24382A` · secundario `#6C7B67` · terciario `#9AA694` · énfasis `#3E5A44`
- Verde marca `#2E7C39` (profundo `#1F5429`) · naranja alerta `#C96F3F` / `#B05E2F` · badge `#D97E4F`
- Relieve (raise): `8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)`
- Hundido (inset): `inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)`
- Pasteles categorías: mint `#DDEBDD` · peach `#F7E3CF` · pink `#F6D9D2` · mercado `#E2EDD2` · lavender `#E6E0F4` · rose `#F5D8DD` · aqua `#D4EBDF` · sand `#EDE6D4`

### Tema oscuro
- Fondo `#16271C` · superficie card gradiente `#1D3426→#132318` · pozo inset bg `#142519`
- Texto `#F1EEDD` · secundario `#93A78F` · terciario `#7C917A` · énfasis `#B9CCB2`
- Verde `#A4E3A6` (glow `rgba(140,225,150,0.3)`) · alerta `#F2A87E`
- Raise: `8px 8px 18px rgba(0,0,0,0.55), -8px -8px 18px rgba(101,152,113,0.1)`
- Inset: `inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)`
- Pasteles = versión clara al 13–16% de alpha sobre la superficie

### Hero verde (igual en ambos temas)
Gradiente `155deg #337B39 → #4C9A52 55% → #5FAC64`; pozo del saldo `rgba(13,34,18,0.30)` con inset profundo; chips internos `rgba(11,30,15,0.32)`; partículas `#C9F3C6, #FBD9BC, #EFF6E2` (count 10). Sombra exterior claro: `12px 12px 26px rgba(124,138,110,0.55), -8px -8px 20px rgba(255,255,255,0.85)`; oscuro: `14px 14px 30px rgba(0,0,0,0.5), -6px -6px 16px rgba(101,152,113,0.14)` (sin glow blanco).

### Radios
Teléfono 46 · hero/nav 32 · cards 22–28 · pozo saldo 24 · chips 22 · pills CTA 15–24 · tiles categoría 18.

## Home — jerarquía y componentes (orden vertical)
1. **⓿ Header** — ~~Brot (46px)~~ junto al saludo + ícono de momento + "buenas tardes, / Mario"; acciones IA · campana(badge) · ajustes en círculos raise 44px; chips "Miembros · N" (raise) y "Sueldo en N días" (inset, punto verde). Utilitario: no compite. **Sin Brot en el tope de la Home** por decisión del owner (2026-07-21, reconfirmada el 2026-08-05): el saldo es el protagonista de la pantalla. El Brot de la Home vive solo en la card de racha (punto 5).
2. **① Saldo del mes** (protagonismo MÁXIMO) — hero verde, chip "día N de 30", pozo hundido con `$2.452.537` 41px/900 + "≈ US$", chips de evento, y **medidor tier-2** colgando bajo hairline `rgba(240,248,230,0.22)`: arco 104×60 (track blanco 18%, progreso `#C9F3C6`, dasharray 163.4) + "$179k POR DÍA" + "PODÉS GASTAR HOY" + link "Proyección de cierre en Control ›". El saldo manda; el medidor es detalle.
3. **② Resumen del ciclo** (ALTO) — una card, dos filas (VARIABLES naranja / FIJOS verde): punto de color, label, sub ("64 movs · Hogar 24%" / "13/16 · Spotify vence hoy"), monto 20px/900, chevron; divisor inset 2px.
4. **③ Tu progreso / Meta** (MEDIO) — ícono pastel 40px, nombre, "$820k de $2,4M · falta …", % verde 17px/900, barra inset 7px con fill `90deg #63B168→#2E7434`.
5. **④ Racha** (MEDIO) — superficie verde tintada (claro `#E4EFD8→#D3E2C4`; oscuro `#24422C→#1A3120`): Brot 44px reactivo + "Racha de N días 🌱" + 7 días en grid full-width `L M X J V S D` (X = miércoles) + link "Jardín ›". Pips 11px: brote=relleno verde · hoy=aro `#D97E4F` · futuro=inset vacío.
6. **⑤ Actividad** (ABAJO) — filas raise: tile emoji pastel 44px, título 14.5/900, "quién · categoría", monto. **Máximo 6 ítems.**
7. **Nav** — barra raise radius 32; item activo = pastilla inset verde (dark: bg `#142519`); **FAB N1**: claro = disco verde `145deg #6DBC71→#327E39` con surco interior inset y "+" crema; oscuro = **invertido**: disco crema `#F2F4EA→#DCE0D0`, "+" verde `#2E7C39`, halo verde tenue.

Regla transversal de todas las vistas: **Presente → Obligaciones → Metas/hábito → Historial.**

## Comportamientos (lógica a implementar)
- **Saludo por horario:** mañana ☀️ "buen día" + Brot `wave` · tarde 🌤️ "buenas tardes" + `idle` · noche 🌙 "buenas noches" + `sleep` (si ya registró) — sin sol fijo.
- **Brot reactivo — la racha manda sobre el horario, nunca dos reacciones a la vez:** registró hoy `love` → racha activa `idle` → por perder (noche sin registrar) `worried` → semana perfecta `cheer` → cortada `sad`.
- **Chips de evento del hero** (uno por vez): AHORRANDO $X · SOBRANTE $X · SEPARAR $X PARA FIJOS · SUMADO $X AL MES · AJUSTADO ESTE MES.
- **Medidor cupo diario:** holgado (verde) / al límite (durazno) / excedido (rojo `#D97355`+aviso).
- Badge de campana **oculto en cero**; FAB pulsa una vez en la primera sesión; todo copy vacío invita a la acción.

## Estados vacíos · usuario nuevo (en el catálogo)
Header primer ingreso ("¡bienvenido!", Miembros · 1, chip "Configurá tu sueldo ›" con punto naranja, campana sin badge) · Saldo `$0` + "Cargá tu primer ingreso" + Brot bebé + CTA crema "+ Ingreso" (el medidor no aparece hasta el primer ingreso) · Resumen $0/"Sin movimientos aún"/"Agregá tu primer fijo" · Meta: card dashed "Sin meta activa" + CTA "Crear meta" · Racha 0 días: Brot `seed` + pips vacíos · Actividad vacía (BR-E): Brot centrado + "Todavía no cargaste nada hoy" + CTA · Notificaciones cero sin badge.

## Brot — API
`<brot-mascot pose="…" size="120" animated="true|false" shadow="true|false">` (canvas supersample 3–4x).
Poses: `idle wave cheer coach sleep peek laugh love wow worried sad dizzy shy think zen magic seed wilted radiant sprout` (+`sproutA` alternativa chibi). `sprout` = **Brot bebé B "cabezón"** (elegida) — transición semilla→radiante; `sproutA` guardada como alternativa válida. Estados del logo/marca: semilla → brote joven (mini logo) → logo oficial → Brot radiante.
`<brot-particles colors="#hex,#hex,#hex" count="14">` llena su contenedor absoluto.

## Escalas Brot en Home
Header 46px · racha 44px · saldo vacío (bebé) 44px · actividad vacía 56px · celebraciones 108–150px.
