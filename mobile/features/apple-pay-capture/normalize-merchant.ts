/**
 * El nombre de comercio que entrega Apple Pay viene sucio y no coincide
 * literal con lo que el usuario escribió alguna vez como descripción:
 * `STARBUCKS COFFEE #4521` contra `Starbucks`.
 *
 * Normalizamos a mayúsculas sin acentos, sacamos los números de sucursal
 * (`#4521`) y los tokens que son sólo dígitos (códigos de local, CP), y
 * colapsamos toda la puntuación a espacios.
 */
export function normalizeMerchant(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/#\s*\d+/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token !== '' && !/^\d+$/.test(token))
    .join(' ')
}
