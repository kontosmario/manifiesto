# Reel Manifiesto — template Remotion

Reel 9:16 (1080×1920, 30fps, 42s) para redes. Spec y storyboard:
`docs/superpowers/specs/2026-07-06-reel-manifiesto-design.md`.

## Requisitos

- Node vía nvm (`source ~/.nvm/nvm.sh`)
- ffmpeg (`brew install ffmpeg`) para ingesta de clips y audio
- Clips en `public/captures/` (gitignored — ver "Ingesta" abajo)
- Música en `public/audio/music.m4a` (gitignored)

## Comandos

- `npm run studio` — editor visual de Remotion
- `npm run render` — render final a `out/reel-manifiesto-2026-07.mp4`

## Ingesta de clips

Los 8 clips canónicos salen de grabaciones de pantalla del iPhone
(1206×2622). Se transcodifican recortando la barra de estado (175px) y
normalizando a 30fps CFR:

```bash
ffmpeg -ss <inicio> -t <dur> -i <grabacion>.MP4 \
  -vf "crop=1206:2447:0:175,fps=30" -an -c:v libx264 -crf 18 \
  -pix_fmt yuv420p public/captures/<nombre>.mp4
```

Nombres canónicos: `01-coldstart` (splash real), `02-home`, `03-gastos`,
`04-fijos`, `05-control`, `06-jardin`, `07-wrapped`, `08-familia`.

## Música

La pista actual es un ambient sintetizado a medida (42s, -14 LUFS,
fade-out 3s). Para cambiarla: reemplazar `public/audio/music.m4a` por
cualquier pista de 42s ya normalizada — no hay que tocar código.

## Editar

- Copy y clips de escenas de producto: `src/scenes.ts` (startFrom en
  frames a 30fps del clip canónico)
- Timeline y duraciones: `src/Reel.tsx` (suma de escenas − 9
  transiciones × 15f = 1260f exactos)
- Colores/easing (espejo del design system de la app): `src/tokens.ts`
- Fern SVG del cierre: `src/components/FernMark.tsx` (paths reales de
  `mobile/components/auth/fern-logo.tsx`)
