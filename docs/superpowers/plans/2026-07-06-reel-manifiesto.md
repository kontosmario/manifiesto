# Reel de Presentación Manifiesto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Producir `reel-manifiesto-2026-07.mp4` (1080×1920, ~42s, 30fps) para redes: recordings reales del simulador iOS compuestos en Remotion con motion graphics del design system + música estilo Apple keynote generada con Higgsfield.

**Architecture:** Proyecto Remotion autónomo en `marketing/reel/` (workspace npm propio, NO toca el package.json de la app). Los clips capturados del simulador viven en `marketing/reel/public/captures/` (gitignored). Una composición master `Reel` secuencia 10 escenas con crossfades vía `@remotion/transitions`. Tokens de color/easing espejados del design system de la app como constantes.

**Tech Stack:** Remotion 4.x, React 19, TypeScript, `xcrun simctl` (captura), ffmpeg (loudness), Higgsfield MCP `generate_audio` (música).

## Global Constraints

- Canvas: 1080×1920 @ 30fps, duración total 1260 frames (42.0s).
- Colores verbatim: verde `#0E3A26`, verde medio `#165C3A`, hoja `#1F7A4B`, crema `#FDFEF9`, crema cálida `#F2EEE3`, crema dim `#AEC7A6`, peach `#F2B58A`, clay `#E08E63`, fireflies `#F0B488`/`#B2E08A`/`#C7EE9C`.
- Easing de entrada verbatim: `cubic-bezier(0.16, 1, 0.3, 1)` (RiseView enterSmooth).
- Copy en tuteo neutro LATAM, exacto al spec (tabla de escenas abajo). Palabras clave en peach.
- Sin `Math.random()` en código Remotion (rompe determinismo del render): posiciones con secuencia R2, fases derivadas del índice.
- Node vía nvm: `source ~/.nvm/nvm.sh` antes de todo comando node/npx (el Bash tool no carga nvm solo).
- Bundle ID de la app: `com.manifiesto.mobile.ZKYQF7UNYA`. Simulador objetivo: iPhone 17 Pro.
- No commitear binarios pesados: `node_modules/`, `out/`, `public/captures/`, `public/audio/` gitignored.
- Spec fuente: `docs/superpowers/specs/2026-07-06-reel-manifiesto-design.md`.

### Copy exacto por escena (fuente de verdad)

| Escena | Título (● = en peach) | Extra |
|---|---|---|
| 2a | Anotar gastos no cambia nada. | beat chico, crema |
| 2b | Un ●hábito●, sí. | beat grande |
| 3 | Tu saldo del mes, de un vistazo. | — |
| 4 | Cada peso, a la ●vista●. | — |
| 5 | Lo recurrente, en ●orden●. | micro-caption: "Aumentos detectados" |
| 6 | Tu ritmo, bajo control. | — |
| 7 | Los hábitos no se anotan. Se ●cultivan●. | — |
| 8 | Cada cierre, tu resumen. | — |
| 9 | Solo o en familia. Como quieras. | — |
| 10 | Manifiesto. Haz de tus finanzas un ●hábito●. | sub: "Tus finanzas, claras." |

### Timeline master (frames)

Transiciones fade de 15f entre escenas (9 transiciones = 135f de overlap).
Suma de escenas 1395f − 135f overlap = **1260f**.

| # | Escena | durationInFrames |
|---|---|---|
| 1 | ColdStart | 135 |
| 2 | Hook | 165 |
| 3 | Home | 135 |
| 4 | Gastos | 135 |
| 5 | Fijos | 135 |
| 6 | Control | 105 |
| 7 | Jardín | 135 |
| 8 | Wrapped | 135 |
| 9 | Temas/Familia | 135 |
| 10 | Cierre | 180 |

---

### Task 1: Scaffold del proyecto Remotion + tokens

**Files:**
- Create: `marketing/reel/package.json`
- Create: `marketing/reel/tsconfig.json`
- Create: `marketing/reel/.gitignore`
- Create: `marketing/reel/remotion.config.ts`
- Create: `marketing/reel/src/index.ts`
- Create: `marketing/reel/src/Root.tsx`
- Create: `marketing/reel/src/Reel.tsx` (placeholder, se reemplaza en Task 6)
- Create: `marketing/reel/src/tokens.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `tokens.ts` exporta `COLORS` (objeto con claves `brandDeep, brandMid, brandLeaf, cream, creamWarm, creamDim, peach, clay, fireflyPeach, fireflyGreenA, fireflyGreenB, inkDark`), `EASE_ENTER: [number,number,number,number]`, `FONT_STACK: string`, `FPS=30`, `WIDTH=1080`, `HEIGHT=1920`. Composición registrada con id `"Reel"`.

- [ ] **Step 1: Crear estructura y archivos**

`marketing/reel/package.json`:
```json
{
  "name": "manifiesto-reel",
  "private": true,
  "scripts": {
    "studio": "remotion studio src/index.ts",
    "render": "remotion render src/index.ts Reel out/reel-manifiesto-2026-07.mp4 --codec h264 --crf 16",
    "still": "remotion still src/index.ts Reel"
  },
  "dependencies": {
    "@remotion/cli": "^4.0.0",
    "@remotion/transitions": "^4.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "remotion": "^4.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.6.0"
  }
}
```

`marketing/reel/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

`marketing/reel/.gitignore`:
```
node_modules/
out/
public/captures/
public/audio/
```

`marketing/reel/remotion.config.ts`:
```ts
import {Config} from '@remotion/cli/config'

Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)
```

`marketing/reel/src/tokens.ts`:
```ts
export const COLORS = {
  brandDeep: '#0E3A26',
  brandMid: '#165C3A',
  brandLeaf: '#1F7A4B',
  cream: '#FDFEF9',
  creamWarm: '#F2EEE3',
  creamDim: '#AEC7A6',
  peach: '#F2B58A',
  clay: '#E08E63',
  fireflyPeach: '#F0B488',
  fireflyGreenA: '#B2E08A',
  fireflyGreenB: '#C7EE9C',
  inkDark: '#12211A',
} as const

// RiseView enterSmooth — mismo easing que la app
export const EASE_ENTER: [number, number, number, number] = [0.16, 1, 0.3, 1]

export const FONT_STACK =
  "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif"

export const FPS = 30
export const WIDTH = 1080
export const HEIGHT = 1920
```

`marketing/reel/src/Reel.tsx` (placeholder):
```tsx
import {AbsoluteFill} from 'remotion'
import {COLORS, FONT_STACK} from './tokens'

export const Reel: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: COLORS.brandDeep,
      justifyContent: 'center',
      alignItems: 'center',
    }}
  >
    <div style={{fontFamily: FONT_STACK, fontWeight: 800, fontSize: 92, color: COLORS.cream, letterSpacing: -4}}>
      Manifiesto<span style={{color: COLORS.peach}}>.</span>
    </div>
  </AbsoluteFill>
)
```

`marketing/reel/src/Root.tsx`:
```tsx
import {Composition} from 'remotion'
import {Reel} from './Reel'
import {FPS, HEIGHT, WIDTH} from './tokens'

export const Root: React.FC = () => (
  <Composition
    id="Reel"
    component={Reel}
    durationInFrames={1260}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
)
```

`marketing/reel/src/index.ts`:
```ts
import {registerRoot} from 'remotion'
import {Root} from './Root'

registerRoot(Root)
```

- [ ] **Step 2: Instalar dependencias**

Run: `source ~/.nvm/nvm.sh && cd /Users/mario/apps/manifiesto/marketing/reel && npm install`
Expected: instala sin errores (Remotion 4.x trae Chrome Headless Shell en el primer render, no en install).

- [ ] **Step 3: Verificar que renderiza un still**

Run: `source ~/.nvm/nvm.sh && cd /Users/mario/apps/manifiesto/marketing/reel && npx remotion still src/index.ts Reel out/smoke.png --frame=0`
Expected: `out/smoke.png` creado. Leer el PNG con el tool Read y confirmar: fondo verde `#0E3A26`, wordmark crema con punto peach.

- [ ] **Step 4: Commit**

```bash
cd /Users/mario/apps/manifiesto && git add marketing/reel && git commit -m "feat(marketing): scaffold Remotion del reel con tokens del design system"
```

---

### Task 2: Componentes compartidos + escena Hook (escena 2)

**Files:**
- Create: `marketing/reel/src/components/RiseIn.tsx`
- Create: `marketing/reel/src/components/Particles.tsx`
- Create: `marketing/reel/src/components/Title.tsx`
- Create: `marketing/reel/src/scenes/HookScene.tsx`

**Interfaces:**
- Consumes: `tokens.ts` de Task 1.
- Produces:
  - `RiseIn: React.FC<{delay?: number; duration?: number; distance?: number; style?: CSSProperties; children}>` — fade + translateY con EASE_ENTER (delay/duration en frames; distance default 40px).
  - `Particles: React.FC<{count?: number; opacity?: number}>` — campo de luciérnagas determinístico (R2), drift Lissajous, brillo pulsante.
  - `Title: React.FC<{segments: Segment[]; size?: number; align?: 'center'|'left'; color?: string}>` con `export type Segment = {text: string; accent?: boolean}` — accent renderiza en peach.
  - `HookScene: React.FC` — dos beats sobre verde.

- [ ] **Step 1: Escribir los componentes**

`marketing/reel/src/components/RiseIn.tsx`:
```tsx
import type {CSSProperties, ReactNode} from 'react'
import {Easing, interpolate, useCurrentFrame} from 'remotion'
import {EASE_ENTER} from '../tokens'

const ease = Easing.bezier(...EASE_ENTER)

export const RiseIn: React.FC<{
  delay?: number
  duration?: number
  distance?: number
  style?: CSSProperties
  children: ReactNode
}> = ({delay = 0, duration = 28, distance = 40, style, children}) => {
  const frame = useCurrentFrame()
  const p = interpolate(frame - delay, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  })
  // La opacity externa (style.opacity) se multiplica, no se pisa — HookScene
  // la usa para atenuar el beat A mientras la entrada sigue viva.
  const baseOpacity = typeof style?.opacity === 'number' ? style.opacity : 1
  return (
    <div style={{...style, opacity: p * baseOpacity, transform: `translateY(${(1 - p) * distance}px)`}}>
      {children}
    </div>
  )
}
```

`marketing/reel/src/components/Particles.tsx`:
```tsx
import {useCurrentFrame} from 'remotion'
import {COLORS, FPS} from '../tokens'

// Roberts R2 low-discrepancy — mismas constantes que card-particles.tsx de la app
const R2X = 0.7548776662466927
const R2Y = 0.5698402909980532

export const Particles: React.FC<{count?: number; opacity?: number}> = ({
  count = 24,
  opacity = 1,
}) => {
  const t = useCurrentFrame() / FPS
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', opacity}}>
      {Array.from({length: count}, (_, i) => {
        const x = ((0.5 + R2X * (i + 1)) % 1) * 100
        const y = ((0.5 + R2Y * (i + 1)) % 1) * 100
        const peach = i % 5 === 0
        const size = peach ? 13 : 6 + (i % 3) * 2
        const color = peach
          ? COLORS.fireflyPeach
          : i % 3 === 0
            ? COLORS.fireflyGreenA
            : COLORS.fireflyGreenB
        const durS = 10 + (i % 5) * 1.5
        const th = (2 * Math.PI * t) / durS + i * 0.7
        const dx = Math.sin((1 + (i % 3)) * th) * (peach ? 50 : 28)
        const dy = Math.cos((2 + (i % 2)) * th) * (peach ? 40 : 22)
        const glow = 0.18 + 0.72 * (0.5 - 0.5 * Math.cos((2 + (i % 2)) * th))
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              borderRadius: '50%',
              backgroundColor: color,
              opacity: glow,
              transform: `translate(${dx}px, ${dy}px)`,
              boxShadow: `0 0 ${size * 2.5}px ${color}`,
            }}
          />
        )
      })}
    </div>
  )
}
```

`marketing/reel/src/components/Title.tsx`:
```tsx
import {COLORS, FONT_STACK} from '../tokens'

export type Segment = {text: string; accent?: boolean}

export const Title: React.FC<{
  segments: Segment[]
  size?: number
  align?: 'center' | 'left'
  color?: string
}> = ({segments, size = 84, align = 'center', color = COLORS.cream}) => (
  <div
    style={{
      fontFamily: FONT_STACK,
      fontWeight: 900,
      fontSize: size,
      lineHeight: 1.12,
      letterSpacing: size * -0.03,
      color,
      textAlign: align,
    }}
  >
    {segments.map((s, i) => (
      <span key={i} style={s.accent ? {color: COLORS.peach} : undefined}>
        {s.text}
      </span>
    ))}
  </div>
)
```

`marketing/reel/src/scenes/HookScene.tsx` (165f: beat A entra f0, beat B entra f70):
```tsx
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion'
import {Particles} from '../components/Particles'
import {RiseIn} from '../components/RiseIn'
import {Title} from '../components/Title'
import {COLORS, FONT_STACK} from '../tokens'

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame()
  // Beat A se atenúa cuando entra beat B
  const beatAOpacity = interpolate(frame, [65, 90], [1, 0.35], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  })
  return (
    <AbsoluteFill style={{backgroundColor: COLORS.brandDeep, justifyContent: 'center', alignItems: 'center', padding: 96}}>
      <Particles count={24} />
      <RiseIn style={{opacity: beatAOpacity}}>
        <div
          style={{
            fontFamily: FONT_STACK,
            fontWeight: 600,
            fontSize: 52,
            letterSpacing: -1,
            color: COLORS.creamDim,
            textAlign: 'center',
          }}
        >
          Anotar gastos no cambia nada.
        </div>
      </RiseIn>
      <RiseIn delay={70} style={{marginTop: 56}}>
        <Title
          size={110}
          segments={[{text: 'Un '}, {text: 'hábito', accent: true}, {text: ', sí.'}]}
        />
      </RiseIn>
    </AbsoluteFill>
  )
}
```

- [ ] **Step 2: Montar HookScene temporalmente para verificar**

En `marketing/reel/src/Reel.tsx`, reemplazar el contenido del placeholder por:
```tsx
import {HookScene} from './scenes/HookScene'

export const Reel: React.FC = () => <HookScene />
```
(Se reemplaza de nuevo en Task 6; el placeholder solo sirve para verificación visual.)

- [ ] **Step 3: Verificar stills de los dos beats**

Run: `source ~/.nvm/nvm.sh && cd /Users/mario/apps/manifiesto/marketing/reel && npx remotion still src/index.ts Reel out/hook-a.png --frame=40 && npx remotion still src/index.ts Reel out/hook-b.png --frame=130`
Expected: frame 40 muestra solo beat A (crema dim, luciérnagas); frame 130 muestra beat B grande con "hábito" en peach y beat A atenuado arriba. Leer ambos PNG con Read y confirmar visualmente.

- [ ] **Step 4: Commit**

```bash
cd /Users/mario/apps/manifiesto && git add marketing/reel/src && git commit -m "feat(marketing): componentes compartidos del reel (RiseIn, Particles, Title) + escena hook"
```

---

### Task 3: Captura de clips en el simulador

**Files:**
- Create (fuera de git): `marketing/reel/public/captures/01-coldstart.mp4`, `02-home.mp4`, `03-gastos.mp4`, `04-fijos.mp4`, `05-control.mp4`, `06-jardin.mp4`, `07-wrapped.mp4`, `08-home-dark.mp4`, `09-welcome-idle.mp4`

**Interfaces:**
- Consumes: app del repo (dev client), cuenta demo con data realista.
- Produces: los 9 mp4 con esos nombres EXACTOS — Tasks 4-6 los referencian vía `staticFile('captures/<nombre>')`.

**GATE HUMANO:** este task requiere a Mario para (a) credenciales de la cuenta demo al hacer login, y (b) realizar los gestos de scroll/navegación en el simulador mientras se graba (simctl no inyecta gestos). Claude maneja arranque/corte de cada grabación y da las indicaciones escena por escena.

- [ ] **Step 1: Bootear simulador y compilar la app**

```bash
xcrun simctl boot "iPhone 17 Pro" 2>/dev/null; open -a Simulator
source ~/.nvm/nvm.sh && cd /Users/mario/apps/manifiesto && npx expo run:ios --device "iPhone 17 Pro"
```
Expected: build Xcode OK (primera vez: varios minutos), app instalada y abierta en el simulador. NUNCA Expo Go.

- [ ] **Step 2: Limpiar barra de estado**

```bash
xcrun simctl status_bar booted override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 --operatorName ""
```
Expected: barra muestra 9:41, batería/señal llenas.

- [ ] **Step 3: Login con cuenta demo (GATE)**

Mario elige la cuenta (la simulada tipo kenility con ~4 meses de data es la preferida; verificar que tenga Jardín con rachas y un wrapped disponible) y hace login en el simulador. Confirmar antes de grabar: Home con datos pobladas, Fijos con avisos de aumentos visibles, Jardín con brotes, modo claro activo.

- [ ] **Step 4: Grabar cada clip**

Patrón por clip (Claude corre los comandos; Mario hace el gesto cuando se le indica):
```bash
# iniciar (en background)
xcrun simctl io booted recordVideo --codec h264 --force \
  /Users/mario/apps/manifiesto/marketing/reel/public/captures/<archivo>.mp4
# ...gesto/espera...
# cortar: SIGINT al proceso de grabación
kill -INT <pid-del-recordVideo>
```

Lista de tomas (grabar 8-12s cada una; sobra material para editar):
1. `01-coldstart.mp4` — `xcrun simctl terminate booted com.manifiesto.mobile.ZKYQF7UNYA`, cerrar sesión NO es necesario si el splash cold-start aparece igual; empezar a grabar, `xcrun simctl launch booted com.manifiesto.mobile.ZKYQF7UNYA`, dejar correr splash completo (fern + wordmark + welcome o home). Si la sesión activa salta el welcome: grabar tras logout para capturar welcome completo, y re-login después.
2. `02-home.mp4` — Home arriba, pausa 2s, scroll lento hacia abajo y suave de vuelta.
3. `03-gastos.mp4` — tab Gastos, pausa en hero, scroll lento hasta el calendario, pausa.
4. `04-fijos.mp4` — tab Fijos, pausa en hero, scroll a "Avisos" (aumentos detectados), pausa ahí 3s.
5. `05-control.mp4` — tab Control, pausa, scroll lento.
6. `06-jardin.mp4` — abrir Mi Jardín, quieto 4s (brotes + luciérnagas), scroll suave si hay más contenido.
7. `07-wrapped.mp4` — abrir el resumen de cierre de ciclo ("Tu mes, en cifras"), dejar correr las cards 8-10s.
8. `08-home-dark.mp4` — activar modo oscuro en Ajustes, volver a Home, quieto 3s, scroll corto.
9. `09-welcome-idle.mp4` — logout (o dev journey a welcome), quedarse en welcome 10s: fern + partículas + wordmark vivos. Volver el tema a claro y re-login al terminar.

- [ ] **Step 5: Verificar los 9 clips**

Run: `for f in /Users/mario/apps/manifiesto/marketing/reel/public/captures/*.mp4; do echo "$f"; ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -of csv=p=0 "$f"; done`
Expected: 9 archivos, resolución nativa del iPhone 17 Pro (~1206×2622), duración ≥ 8s cada uno.

(Sin commit: captures está gitignored.)

---

### Task 4: Escenas de producto (3, 4, 5, 6, 8, 9)

**Files:**
- Create: `marketing/reel/src/components/DeviceClip.tsx`
- Create: `marketing/reel/src/scenes/ProductScene.tsx`
- Create: `marketing/reel/src/scenes/ThemeScene.tsx`
- Create: `marketing/reel/src/scenes.ts`

**Interfaces:**
- Consumes: `RiseIn`, `Title`, `Segment`, tokens; captures de Task 3.
- Produces:
  - `DeviceClip: React.FC<{src: string; startFrom?: number; width?: number}>` — clip dentro de device frame redondeado con drift de escala 1.0→1.03.
  - `ProductScene: React.FC<{clip: string; startFrom?: number; title: Segment[]; caption?: string}>`.
  - `ThemeScene: React.FC` — crossfade claro↔oscuro (escena 9).
  - `scenes.ts` exporta `PRODUCT_SCENES: {id: string; clip: string; startFrom: number; title: Segment[]; caption?: string}[]` (escenas 3,4,5,6,8 en orden).

- [ ] **Step 1: Escribir DeviceClip**

`marketing/reel/src/components/DeviceClip.tsx`:
```tsx
import {Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion'
import {COLORS} from '../tokens'

export const DeviceClip: React.FC<{
  src: string
  startFrom?: number
  width?: number
}> = ({src, startFrom = 0, width = 780}) => {
  const frame = useCurrentFrame()
  const {durationInFrames} = useVideoConfig()
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.03], {
    easing: Easing.bezier(0.45, 0, 0.55, 1),
  })
  const height = width * (2622 / 1206) // aspect nativo iPhone 17 Pro
  return (
    <div
      style={{
        width,
        height,
        borderRadius: width * 0.16,
        overflow: 'hidden',
        border: `10px solid ${COLORS.inkDark}`,
        boxShadow: '0 60px 120px -40px rgba(15,58,38,0.45)',
        transform: `scale(${scale})`,
      }}
    >
      <OffthreadVideo
        src={staticFile(src)}
        startFrom={startFrom}
        muted
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
    </div>
  )
}
```

- [ ] **Step 2: Escribir ProductScene y el catálogo de escenas**

`marketing/reel/src/scenes/ProductScene.tsx`:
```tsx
import {AbsoluteFill} from 'remotion'
import {DeviceClip} from '../components/DeviceClip'
import {RiseIn} from '../components/RiseIn'
import {Segment, Title} from '../components/Title'
import {COLORS, FONT_STACK} from '../tokens'

export const ProductScene: React.FC<{
  clip: string
  startFrom?: number
  title: Segment[]
  caption?: string
}> = ({clip, startFrom = 0, title, caption}) => (
  <AbsoluteFill style={{backgroundColor: COLORS.creamWarm, alignItems: 'center'}}>
    <RiseIn style={{marginTop: 150, paddingInline: 90}}>
      <Title segments={title} size={72} color={COLORS.inkDark} />
    </RiseIn>
    {caption ? (
      <RiseIn delay={12}>
        <div
          style={{
            marginTop: 28,
            fontFamily: FONT_STACK,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: COLORS.clay,
          }}
        >
          {caption}
        </div>
      </RiseIn>
    ) : null}
    <RiseIn delay={8} distance={60} style={{marginTop: 70}}>
      <DeviceClip src={clip} startFrom={startFrom} />
    </RiseIn>
  </AbsoluteFill>
)
```

`marketing/reel/src/scenes.ts`:
```ts
import type {Segment} from './components/Title'

export type ProductSceneDef = {
  id: string
  clip: string
  startFrom: number
  title: Segment[]
  caption?: string
}

// startFrom en frames del CLIP (30fps): ajustar tras revisar las capturas
// para que cada escena arranque en el momento más lindo del recording.
export const PRODUCT_SCENES: ProductSceneDef[] = [
  {
    id: 'home',
    clip: 'captures/02-home.mp4',
    startFrom: 30,
    title: [{text: 'Tu saldo del mes, de un vistazo.'}],
  },
  {
    id: 'gastos',
    clip: 'captures/03-gastos.mp4',
    startFrom: 30,
    title: [{text: 'Cada peso, a la '}, {text: 'vista', accent: true}, {text: '.'}],
  },
  {
    id: 'fijos',
    clip: 'captures/04-fijos.mp4',
    startFrom: 30,
    title: [{text: 'Lo recurrente, en '}, {text: 'orden', accent: true}, {text: '.'}],
    caption: 'Aumentos detectados',
  },
  {
    id: 'control',
    clip: 'captures/05-control.mp4',
    startFrom: 30,
    title: [{text: 'Tu ritmo, bajo control.'}],
  },
  {
    id: 'wrapped',
    clip: 'captures/07-wrapped.mp4',
    startFrom: 30,
    title: [{text: 'Cada cierre, tu resumen.'}],
  },
]
```

Nota: en `ProductScene`, el accent sobre fondo crema usa peach `#F2B58A` (definido en `Title`); si en el still el contraste sobre crema se ve débil, cambiar el accent de las escenas de producto a clay `#E08E63` editando `Title` para aceptar `accentColor` opcional.

- [ ] **Step 3: Escribir ThemeScene (escena 9, claro↔oscuro)**

`marketing/reel/src/scenes/ThemeScene.tsx`:
```tsx
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion'
import {DeviceClip} from '../components/DeviceClip'
import {RiseIn} from '../components/RiseIn'
import {Title} from '../components/Title'
import {COLORS} from '../tokens'

// 135f: claro visible primero, crossfade a oscuro en f55-85
export const ThemeScene: React.FC = () => {
  const frame = useCurrentFrame()
  const dark = interpolate(frame, [55, 85], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.45, 0, 0.55, 1),
  })
  const bg = dark > 0.5 ? COLORS.inkDark : COLORS.creamWarm
  const titleColor = dark > 0.5 ? COLORS.cream : COLORS.inkDark
  return (
    <AbsoluteFill style={{backgroundColor: bg, alignItems: 'center', transition: 'none'}}>
      <RiseIn style={{marginTop: 150, paddingInline: 90}}>
        <Title segments={[{text: 'Solo o en familia. Como quieras.'}]} size={72} color={titleColor} />
      </RiseIn>
      <div style={{position: 'relative', marginTop: 70}}>
        <RiseIn delay={8} distance={60}>
          <DeviceClip src="captures/02-home.mp4" startFrom={45} />
        </RiseIn>
        <div style={{position: 'absolute', inset: 0, opacity: dark}}>
          <DeviceClip src="captures/08-home-dark.mp4" startFrom={45} />
        </div>
      </div>
    </AbsoluteFill>
  )
}
```

- [ ] **Step 4: Verificar stills de producto**

Montar temporalmente en `Reel.tsx`:
```tsx
import {ProductScene} from './scenes/ProductScene'
import {PRODUCT_SCENES} from './scenes'

export const Reel: React.FC = () => <ProductScene {...PRODUCT_SCENES[0]} />
```
Run: `source ~/.nvm/nvm.sh && cd /Users/mario/apps/manifiesto/marketing/reel && npx remotion still src/index.ts Reel out/product-home.png --frame=60`
Expected: fondo crema, título arriba, device frame con el recording real de Home. Leer el PNG. Repetir cambiando el índice a `PRODUCT_SCENES[2]` (fijos, con caption) y con `<ThemeScene/>` en frame 100 (modo oscuro visible).

- [ ] **Step 5: Commit**

```bash
cd /Users/mario/apps/manifiesto && git add marketing/reel/src && git commit -m "feat(marketing): escenas de producto del reel (device frame + clips reales)"
```

---

### Task 5: Escenas de marca con recordings (1 cold start, 10 cierre)

**Files:**
- Create: `marketing/reel/src/scenes/ColdStartScene.tsx`
- Create: `marketing/reel/src/scenes/ClosingScene.tsx`

**Interfaces:**
- Consumes: captures `01-coldstart.mp4` y `09-welcome-idle.mp4`; `Particles`, `RiseIn`, `Title`, tokens.
- Produces: `ColdStartScene: React.FC`, `ClosingScene: React.FC`.

- [ ] **Step 1: Escribir ColdStartScene**

`marketing/reel/src/scenes/ColdStartScene.tsx`:
```tsx
import {AbsoluteFill, OffthreadVideo, staticFile} from 'remotion'
import {COLORS} from '../tokens'

// El recording del cold start ES la escena: fullscreen, object-fit cover.
// startFrom: ajustar para que el trazado del fern arranque ~f10 de la escena.
export const ColdStartScene: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: COLORS.brandDeep}}>
    <OffthreadVideo
      src={staticFile('captures/01-coldstart.mp4')}
      startFrom={0}
      muted
      style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top'}}
    />
  </AbsoluteFill>
)
```

- [ ] **Step 2: Escribir ClosingScene**

`marketing/reel/src/scenes/ClosingScene.tsx` (180f):
```tsx
import {AbsoluteFill, OffthreadVideo, staticFile} from 'remotion'
import {Particles} from '../components/Particles'
import {RiseIn} from '../components/RiseIn'
import {Title} from '../components/Title'
import {COLORS, FONT_STACK} from '../tokens'

// Welcome idle (fern + partículas vivas) arriba; los CTAs del welcome quedan
// tapados por el gradiente inferior donde entra el copy de cierre.
export const ClosingScene: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: COLORS.brandDeep}}>
    <OffthreadVideo
      src={staticFile('captures/09-welcome-idle.mp4')}
      startFrom={30}
      muted
      style={{width: '100%', height: '78%', objectFit: 'cover', objectPosition: 'center top'}}
    />
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '46%',
        background: `linear-gradient(180deg, rgba(14,58,38,0) 0%, ${COLORS.brandDeep} 34%)`,
      }}
    />
    <Particles count={12} opacity={0.8} />
    <div
      style={{
        position: 'absolute',
        left: 90,
        right: 90,
        bottom: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 36,
      }}
    >
      <RiseIn delay={20}>
        <Title
          size={78}
          segments={[
            {text: 'Manifiesto. Haz de tus finanzas un '},
            {text: 'hábito', accent: true},
            {text: '.'},
          ]}
        />
      </RiseIn>
      <RiseIn delay={45}>
        <div
          style={{
            fontFamily: FONT_STACK,
            fontWeight: 500,
            fontSize: 40,
            letterSpacing: -0.5,
            color: COLORS.creamDim,
          }}
        >
          Tus finanzas, claras.
        </div>
      </RiseIn>
    </div>
  </AbsoluteFill>
)
```

- [ ] **Step 3: Verificar stills**

Montar `<ColdStartScene/>` en `Reel.tsx`, still en frame 60 (fern a medio trazar). Después `<ClosingScene/>`, stills en frame 30 y frame 120 (copy completo). Leer los PNG: el welcome idle debe verse arriba, los CTAs del welcome tapados por el gradiente, copy legible.
Run: `source ~/.nvm/nvm.sh && cd /Users/mario/apps/manifiesto/marketing/reel && npx remotion still src/index.ts Reel out/closing.png --frame=120`

- [ ] **Step 4: Ajustar startFrom del cold start**

Revisar `out/` stills del cold start en frames 10/30/60: el trazado del helecho debe estar activo dentro de los primeros 2s de escena. Si el recording tiene aire muerto al inicio, subir `startFrom` (frames de clip a 30fps) hasta que el trazado arranque ~f10.

- [ ] **Step 5: Commit**

```bash
cd /Users/mario/apps/manifiesto && git add marketing/reel/src && git commit -m "feat(marketing): escenas de marca del reel (cold start real + cierre)"
```

---

### Task 6: Composición master + render draft

**Files:**
- Modify: `marketing/reel/src/Reel.tsx` (reemplazo completo del placeholder)

**Interfaces:**
- Consumes: todas las escenas de Tasks 2, 4, 5; timeline master de Global Constraints.
- Produces: composición `Reel` completa de 1260f (sin audio todavía).

- [ ] **Step 1: Escribir la secuencia master**

`marketing/reel/src/Reel.tsx`:
```tsx
import {TransitionSeries, linearTiming} from '@remotion/transitions'
import {fade} from '@remotion/transitions/fade'
import {ColdStartScene} from './scenes/ColdStartScene'
import {ClosingScene} from './scenes/ClosingScene'
import {HookScene} from './scenes/HookScene'
import {ProductScene} from './scenes/ProductScene'
import {ThemeScene} from './scenes/ThemeScene'
import {PRODUCT_SCENES} from './scenes'

const X = () => (
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({durationInFrames: 15})}
  />
)

// [home, gastos, fijos, control, wrapped]
const [home, gastos, fijos, control, wrapped] = PRODUCT_SCENES

export const Reel: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={135}>
      <ColdStartScene />
    </TransitionSeries.Sequence>
    <X />
    <TransitionSeries.Sequence durationInFrames={165}>
      <HookScene />
    </TransitionSeries.Sequence>
    <X />
    <TransitionSeries.Sequence durationInFrames={135}>
      <ProductScene {...home} />
    </TransitionSeries.Sequence>
    <X />
    <TransitionSeries.Sequence durationInFrames={135}>
      <ProductScene {...gastos} />
    </TransitionSeries.Sequence>
    <X />
    <TransitionSeries.Sequence durationInFrames={135}>
      <ProductScene {...fijos} />
    </TransitionSeries.Sequence>
    <X />
    <TransitionSeries.Sequence durationInFrames={105}>
      <ProductScene {...control} />
    </TransitionSeries.Sequence>
    <X />
    <TransitionSeries.Sequence durationInFrames={135}>
      <ProductScene
        clip="captures/06-jardin.mp4"
        startFrom={30}
        title={[
          {text: 'Los hábitos no se anotan. Se '},
          {text: 'cultivan', accent: true},
          {text: '.'},
        ]}
      />
    </TransitionSeries.Sequence>
    <X />
    <TransitionSeries.Sequence durationInFrames={135}>
      <ProductScene {...wrapped} />
    </TransitionSeries.Sequence>
    <X />
    <TransitionSeries.Sequence durationInFrames={135}>
      <ThemeScene />
    </TransitionSeries.Sequence>
    <X />
    <TransitionSeries.Sequence durationInFrames={180}>
      <ClosingScene />
    </TransitionSeries.Sequence>
  </TransitionSeries>
)
```
Nota: la escena Jardín (7) usa `ProductScene` inline (no está en `PRODUCT_SCENES` porque el catálogo alimenta escenas 3-6+8 en orden posicional). Suma: 1395f − 9×15f = 1260f, igual al `durationInFrames` de la Composition.

- [ ] **Step 2: Render draft**

Run: `source ~/.nvm/nvm.sh && cd /Users/mario/apps/manifiesto/marketing/reel && npx remotion render src/index.ts Reel out/draft.mp4 --codec h264 --crf 22`
Expected: render completo sin errores.

- [ ] **Step 3: QA del draft**

Run: `ffprobe -v error -show_entries format=duration -of csv=p=0 /Users/mario/apps/manifiesto/marketing/reel/out/draft.mp4`
Expected: `42.0` (±0.1).
Extraer stills de control en los midpoints de cada escena y leerlos:
```bash
cd /Users/mario/apps/manifiesto/marketing/reel && for t in 2 6.5 11 15 19 22.5 26 30 34 39; do ffmpeg -y -v error -ss $t -i out/draft.mp4 -frames:v 1 out/qa-$t.png; done
```
Checklist visual por still: copy correcto y legible, clip correcto por escena, accents en peach, sin bordes negros del recording, transiciones no cortadas a mitad de texto. Presentar el draft a Mario para feedback de ritmo ANTES de seguir con audio.

- [ ] **Step 4: Commit**

```bash
cd /Users/mario/apps/manifiesto && git add marketing/reel/src && git commit -m "feat(marketing): composición master del reel (10 escenas, 42s)"
```

---

### Task 7: Música (Higgsfield) + mezcla

**Files:**
- Create (fuera de git): `marketing/reel/public/audio/music-raw.mp3`, `marketing/reel/public/audio/music.m4a`
- Modify: `marketing/reel/src/Reel.tsx` (agregar `<Audio>`)

**Interfaces:**
- Consumes: composición de Task 6; MCP Higgsfield `generate_audio`.
- Produces: pista final `audio/music.m4a` integrada a la composición con fade out.

- [ ] **Step 1: Generar la música con Higgsfield**

Llamar `generate_audio` (modo música) con prompt:
> Calm, minimal Apple keynote-style instrumental. Soft felt piano with warm ambient pads, subtle tape texture. ~85 BPM. Intimate sparse opening, gentle emotional lift in the middle, soft resolved ending. No drums, no percussion, no vocals. 45 seconds.

Descargar el resultado: `curl -L -o /Users/mario/apps/manifiesto/marketing/reel/public/audio/music-raw.mp3 "<url>"`.
Si el resultado no suena calmo/keynote (muy pop, con percusión), regenerar hasta 2 veces ajustando el prompt antes de presentar opciones a Mario.

- [ ] **Step 2: Normalizar a -14 LUFS y recortar a 42s con fade**

```bash
ffmpeg -y -i /Users/mario/apps/manifiesto/marketing/reel/public/audio/music-raw.mp3 \
  -af "atrim=0:42,loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st=39:d=3" \
  -c:a aac -b:a 256k /Users/mario/apps/manifiesto/marketing/reel/public/audio/music.m4a
```
Expected: archivo de 42.0s. Verificar loudness: `ffmpeg -i .../music.m4a -af loudnorm=print_format=summary -f null - 2>&1 | grep "Input Integrated"` → ~-14 LUFS.

- [ ] **Step 3: Integrar a la composición**

En `marketing/reel/src/Reel.tsx`, envolver el retorno en un fragment y agregar el audio (import arriba):
```tsx
import {AbsoluteFill, Audio, staticFile} from 'remotion'
// ...imports existentes...

export const Reel: React.FC = () => (
  <AbsoluteFill>
    <Audio src={staticFile('audio/music.m4a')} />
    <TransitionSeries>
      {/* ...igual que Task 6... */}
    </TransitionSeries>
  </AbsoluteFill>
)
```

- [ ] **Step 4: Verificar que el audio entra al render**

Run: `source ~/.nvm/nvm.sh && cd /Users/mario/apps/manifiesto/marketing/reel && npx remotion render src/index.ts Reel out/draft-audio.mp4 --codec h264 --crf 22 --frames=0-150`
Expected: render parcial OK; `ffprobe -v error -show_streams -select_streams a out/draft-audio.mp4 | head -3` muestra stream de audio aac.

- [ ] **Step 5: Commit**

```bash
cd /Users/mario/apps/manifiesto && git add marketing/reel/src && git commit -m "feat(marketing): música keynote integrada al reel"
```

---

### Task 8: Render final, QA y entrega

**Files:**
- Create (fuera de git): `marketing/reel/out/reel-manifiesto-2026-07.mp4`
- Create: `marketing/reel/README.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: entregable final + README del template.

- [ ] **Step 1: Render final**

Run: `source ~/.nvm/nvm.sh && cd /Users/mario/apps/manifiesto/marketing/reel && npx remotion render src/index.ts Reel out/reel-manifiesto-2026-07.mp4 --codec h264 --crf 16`
Expected: mp4 final sin errores.

- [ ] **Step 2: QA final**

```bash
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate,codec_name -of default=nw=1 /Users/mario/apps/manifiesto/marketing/reel/out/reel-manifiesto-2026-07.mp4
```
Expected: 1080×1920, 30/1, h264 + aac, duración 42.0s.
Re-extraer los 10 stills de QA (mismo loop de Task 6 Step 3 sobre el archivo final) y leerlos. Loudness del mux final ~-14 LUFS.

- [ ] **Step 3: README del template**

`marketing/reel/README.md`:
```markdown
# Reel Manifiesto — template Remotion

Reel 9:16 (1080×1920, 30fps, 42s) para redes. Spec y storyboard:
`docs/superpowers/specs/2026-07-06-reel-manifiesto-design.md`.

## Requisitos
- Node vía nvm (`source ~/.nvm/nvm.sh`)
- Clips en `public/captures/` (gitignored — regrabar del simulador, ver spec)
- Música en `public/audio/music.m4a` (gitignored — Higgsfield + loudnorm)

## Comandos
- `npm run studio` — editor visual de Remotion
- `npm run render` — render final a `out/reel-manifiesto-2026-07.mp4`

## Editar
- Copy y clips de escenas de producto: `src/scenes.ts`
- Timeline y duraciones: `src/Reel.tsx`
- Colores/easing (espejo del design system de la app): `src/tokens.ts`
```

- [ ] **Step 4: Presentar el video final a Mario**

Entregar ruta del mp4 + los stills de QA. Iteración de feedback (ritmo, copy, startFrom de clips) se hace editando `src/scenes.ts` / `Reel.tsx` y re-renderizando.

- [ ] **Step 5: Commit final**

```bash
cd /Users/mario/apps/manifiesto && git add marketing/reel/README.md && git commit -m "docs(marketing): README del template del reel"
```
