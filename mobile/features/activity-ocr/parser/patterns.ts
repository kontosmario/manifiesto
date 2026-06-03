export const RE_DATE = /^(\d{1,2})\s+([a-záéíóú]{3,})\.?\s+(\d{4})$/i

/**
 * Monto con signo + número + indicador de moneda.
 *
 * Acepta dos formas (Mercado Pago + bancos AR):
 *   1) `- $65.600`  → signo + `$` + número (currency se infiere ARS).
 *   2) `- 26.000 ARS` / `+ 23.697,71 ARS` / `- 16 USDc`  → signo +
 *      número + código de moneda (2-5 chars).
 *
 * Capturas:
 *   m[1] = signo (`+`, `-`, o `−` Unicode minus para iOS OCR)
 *   m[2] = `$` si está presente (forma 1), undefined en forma 2
 *   m[3] = número (separadores es-AR: `.` miles, `,` decimal)
 *   m[4] = código de moneda (forma 2) o undefined
 *
 * `parseAmount` exige al menos uno de los dos indicadores (m[2] o
 * m[4]) — si ambos faltan, no es un monto sino ruido (ej. "23:20 hs").
 */
export const RE_AMOUNT = /([+\-−])\s*(\$)?\s*([\d.,]+)(?:\s*([A-Za-z]{2,5}))?/

/**
 * Header de sección sin monto. Acepta cuatro formas:
 *   - `Hoy` / `Ayer`
 *   - `Junio 2026`               (mes + año, formato bancario)
 *   - `31 de mayo`               (día + de + mes, formato Mercado Pago)
 *   - `31 de mayo 2026`          (con año plano)
 *   - `31 de mayo de 2026`       (con "de" antes del año)
 */
export const RE_SECTION =
  /^(hoy|ayer|[a-záéíóú]+\s+\d{4}|\d{1,2}\s+de\s+[a-záéíóú]+(?:\s+(?:de\s+)?\d{4})?)$/i

export const MONTHS_ES: Readonly<Record<string, string>> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
}

/**
 * Si el section header tiene formato "día de mes" (Mercado Pago),
 * lo convierte a ISO `YYYY-MM-DD`. Para "Hoy"/"Ayer" o "Mes año" sin
 * día, devuelve null (el caller debe decidir qué hacer).
 *
 * Cuando el header no incluye año (ej. "31 de mayo"), usa
 * `defaultYear`. Para "31 de mayo 2026" / "31 de mayo de 2026" usa
 * el año del header.
 */
export function sectionToISODate(
  section: string,
  defaultYear: number,
): string | null {
  const m = section.match(
    /^(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+(?:de\s+)?(\d{4}))?$/i,
  )
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const monthKey = m[2].toLowerCase().slice(0, 3)
  const month = MONTHS_ES[monthKey]
  if (!month) return null
  const year = m[3] ?? String(defaultYear)
  return `${year}-${month}-${day}`
}
