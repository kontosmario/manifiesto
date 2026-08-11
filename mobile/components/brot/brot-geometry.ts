/**
 * Geometría de la caja de Brot.
 *
 * Módulo PURO (cero imports) a propósito: lo lee `brot-mascot`, que arrastra
 * Skia, pero también los call sites que necesitan reservar aire alrededor del
 * dibujo — y esos no pueden pagar el costo de importar el componente. Bajo
 * vitest (entorno `node`) además es lo único de Brot que se puede cargar.
 */

/** viewBox lógico. `peek` usa un alto distinto: es un RECORTE, no una pose escalada. */
export const BROT_VIEWBOX_W = 84
export const BROT_VIEWBOX_H = 108
export const BROT_VIEWBOX_H_PEEK = 72

/**
 * Cuánto se sale el DIBUJO de la caja de layout, en unidades de viewBox.
 *
 * El razonamiento y las mediciones que fijan estos números están en
 * `brot-mascot.tsx`, junto a los `PAD_*` que los consumen. Lo que importa
 * acá: **la caja de layout de Brot NO contiene su tinta**. Cualquier cosa
 * que se apoye justo encima tiene que reservar `BROT_INK_BLEED_TOP`, o las
 * hojas se la comen en las poses que saltan.
 *
 * Ojo con verificarlo mirando el prototipo o los mockups: el componente web
 * del handoff recorta exacto al viewBox, así que ahí Brot nunca invade nada
 * y el defecto aparece recién en device.
 */
export const BROT_INK_BLEED_TOP = 12
export const BROT_INK_BLEED_X = 6
export const BROT_INK_BLEED_BOTTOM = 0
