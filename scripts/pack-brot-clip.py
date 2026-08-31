#!/usr/bin/env python3
"""Empaqueta una secuencia PNG de Brot sobre croma magenta en frames alpha-packed.

CONTEXTO
    Los clips del Brot volumétrico se producen sobre fondo magenta plano
    (#FF00FF). Este script los convierte al formato que consume `BrotClip`:
    un solo cuadro donde la mitad de arriba es el color y la de abajo es la
    máscara de alpha en gris.

    Se empaqueta así porque NINGÚN formato de video con alpha real es portable:
    HEVC con alpha es sólo de Apple y VP9 con alpha no lo soporta Android de
    forma confiable. Un H.264 común corre en todos lados y se decodifica por
    hardware.

REQUISITOS
    python3 -m venv .venv && .venv/bin/pip install numpy scipy pillow

USO
    .venv/bin/python scripts/pack-brot-clip.py <dir-frames> <dir-salida>

    Después, para producir el .mp4 final (30 fps es la tasa de referencia del
    set — si algunas poses salen a 24 y otras a 30, Brot se mueve a distinto
    ritmo según la pantalla):

    ffmpeg -framerate 30 -i <dir-salida>/packed_%04d.png \\
      -c:v libx264 -profile:v high -crf 23 -pix_fmt yuv420p \\
      -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \\
      -an -movflags +faststart mobile/assets/brot-poc/<nombre>.mp4

ESPECIFICACIÓN DE LA FUENTE
    Fondo magenta puro #FF00FF, plano, sin gradiente ni viñeteado y sin sombra
    de contacto. 1080x1350 (4:5), 24 fps nativo, loop que empalme sin repetir
    el primer cuadro, y el personaje entero dentro del cuadro con margen.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

MAGENTA = np.array([255.0, 0.0, 255.0])
UMBRAL = 120.0      # distancia al croma a partir de la cual el píxel es 100% personaje
MOTA_MAX = 60       # área máxima (px) de un hueco que se considera ruido del key
RECORTE = 0.22      # cuánto se achica el mate para comer la corona más clara
MITAD = (704, 880)  # ancho, alto de cada mitad (múltiplos de 16, relación 0.8)


def procesar(path: Path) -> Image.Image:
    rgb = np.array(Image.open(path).convert("RGB")).astype(np.float64)

    # 1. KEY — alpha por distancia al magenta exacto.
    dist = np.linalg.norm(rgb - MAGENTA, axis=2)
    alpha = np.clip(dist / UMBRAL, 0.0, 1.0)

    # 2. HUECOS — sólo los chicos.
    #
    # Un binary_fill_holes a secas rellena TODA región de fondo que quede
    # encerrada por el personaje. Eso tapa bien las motas de magenta que el key
    # deja dentro del brillo especular (30-40 motas de 1-3 px), pero también
    # rellena el hueco entre brazo y cuerpo cuando Brot separa los brazos para
    # mostrar los bolsillos: ese hueco es fondo LEGÍTIMO y quedaba pintado como
    # personaje opaco, con magenta puro (#F000F0) visible en las axilas.
    #
    # Por eso el relleno se limita por área: las motas son diminutas, el hueco
    # de la axila tiene cientos de píxeles.
    silueta = ndimage.binary_fill_holes(alpha > 0.05)
    huecos = silueta & (alpha < 0.05)
    etiquetas, cantidad = ndimage.label(huecos)
    if cantidad:
        areas = ndimage.sum(huecos, etiquetas, range(1, cantidad + 1))
        chicos = np.array([0] + [1 if a <= MOTA_MAX else 0 for a in areas], dtype=bool)
        alpha = np.where(chicos[etiquetas], 1.0, alpha)

    # 3. UNBLEND — el borde antialiaseado es C = a*F + (1-a)*M, y M se conoce
    # exactamente, así que F = (C - (1-a)*M) / a despeja el color REAL. Elimina
    # el fringe magenta de raíz en vez de disimularlo.
    a3 = alpha[..., None]
    with np.errstate(divide="ignore", invalid="ignore"):
        fg = (rgb - (1.0 - a3) * MAGENTA) / np.where(a3 < 1e-3, 1.0, a3)
    fg = np.clip(fg, 0, 255)
    fg = np.where(a3 < 1e-3, 0.0, fg)

    # 4. DESPILL — red de seguridad para el magenta que sobreviva al unblend en
    # huecos angostos, donde el píxel es mezcla de brazo, cuerpo Y fondo. Se
    # resta la componente magenta: m = max(0, min(R,B) − G).
    # Es seguro porque Brot no tiene rosas propios: de 166k píxeles opacos,
    # sólo 24 son cálidos de verdad. Todo lo que tiene R y B por encima de G es
    # contaminación del croma.
    exceso = np.maximum(0.0, np.minimum(fg[..., 0], fg[..., 2]) - fg[..., 1])
    fg[..., 0] -= exceso
    fg[..., 2] -= exceso

    # 5. DERIM — el personaje se generó originalmente sobre BLANCO, así que su
    # borde antialiaseado trae un rebote claro horneado. El unblend quita el
    # magenta pero no eso, y sobre fondo oscuro se ve como halo. Se corrige
    # tomando el color desde el núcleo (3 px adentro) en toda la franja de
    # borde, y achicando el mate para recortar la corona más clara.
    nucleo = ndimage.binary_erosion(alpha > 0.9, iterations=3)
    _, idx = ndimage.distance_transform_edt(~nucleo, return_indices=True)
    fg_nucleo = fg[idx[0], idx[1]]
    fg = np.where((alpha < 0.85)[..., None], fg_nucleo, fg)

    alpha = np.clip((alpha - RECORTE) / (1.0 - RECORTE), 0.0, 1.0)
    a3 = alpha[..., None]

    # 6. EXTEND — el color válido se propaga a la zona transparente para que
    # H.264 no sangre el fondo hacia adentro al comprimir y aparezca un halo.
    fg = np.where(a3 > 0.01, fg, fg_nucleo)

    # Escalado: color y alpha juntos, ya con el color extendido, para que el
    # remuestreo no arrastre basura desde la zona transparente.
    color = Image.fromarray(fg.astype(np.uint8), "RGB").resize(MITAD, Image.LANCZOS)
    mate = Image.fromarray((alpha * 255).astype(np.uint8), "L").resize(MITAD, Image.LANCZOS)

    # 7. PACK — color arriba, alpha abajo.
    out = Image.new("RGB", (MITAD[0], MITAD[1] * 2))
    out.paste(color, (0, 0))
    out.paste(mate.convert("RGB"), (0, MITAD[1]))
    return out


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1

    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    frames = sorted(src.glob("frame_*.png"))
    if not frames:
        print(f"No hay frames en {src} (se esperan archivos frame_XXXX.png)")
        return 1

    dst.mkdir(parents=True, exist_ok=True)
    for i, f in enumerate(frames, 1):
        procesar(f).save(dst / f"packed_{i:04d}.png")

    print(f"{len(frames)} frames empaquetados en {MITAD[0]}x{MITAD[1] * 2} -> {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
