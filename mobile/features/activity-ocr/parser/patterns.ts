/**
 * Map de meses en es-AR (clave de 3 letras → MM). Usada por todos los
 * parsers de fecha del módulo.
 */
export const MONTHS_ES: Readonly<Record<string, string>> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
}

/** Nombres completos de mes en es-AR. Usados en RE_SECTION para
 *  reconocer un mes solo ("Mayo") o "Mayo 2026". */
const MONTH_FULL_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const
const MONTH_FULL_ALT = MONTH_FULL_NAMES_ES.join('|')

/**
 * Date "01 jun 2026" (es-AR, mes abreviado de 3+ letras, año a 4 dígitos).
 * Formato del primer bank captura del brief.
 */
export const RE_DATE = /^(\d{1,2})\s+([a-záéíóú]{3,})\.?\s+(\d{4})$/i

/**
 * Date numérica "29/05" o "29/05/26" o "29/05/2026" (Banco Macro).
 * Año opcional; si falta se infiere desde defaultYear. Año a 2 dígitos
 * se asume 20XX.
 */
export const RE_DATE_NUMERIC = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/

/**
 * Detector de "esto parece un monto". Cubre cuatro formas observadas:
 *   - `+ 26.000 ARS` / `- 16 USDc`     → bank con código de moneda
 *   - `- $65.600`                       → Mercado Pago, $-tras-signo
 *   - `$ -5.000,00` / `$ 3,03`          → Francés, $-antes-de-signo, signo opcional
 *   - `+ $8,14`                         → Macro, signo + $ + número
 *   - `- $ 35.000,00`                   → Provincia, signo + espacio + $
 *   - `-$200.000,00` / `$200.000,00`    → Santander, signo pegado a $
 *
 * Anclado con `^...$` para evitar falsos positivos en descripciones
 * largas que tienen `-` entre dígitos (ej. "PERIODO DESDE 24-04-2026
 * HASTA 22-05-2026" en Provincia ACREDITACION INTERESES).
 *
 * Este regex se usa SOLO como filtro ("esta línea es un monto, no la
 * elijas como merchant"). La parsing real la hace `parseAmount` en
 * classify.ts con lógica más cuidada porque las capturas varían.
 */
export const RE_AMOUNT =
  /^\s*(?:[+\-−]\s*\$?\s*[\d.,]+(?:\s*[A-Za-z]{2,5})?|\$\s*[+\-−]?\s*[\d.,]+)\s*$/

/**
 * Header de sección sin monto. Acepta:
 *   - `Hoy` / `Ayer`
 *   - `Mayo` / `Mayo 2026`          (solo nombre completo de mes ± año)
 *   - `Junio 2026`                  (mes + año, formato bancario)
 *   - `31 de mayo` / `31 de mayo 2026` / `31 de mayo de 2026`
 */
export const RE_SECTION = new RegExp(
  '^(' +
    'hoy|ayer' +
    `|(?:${MONTH_FULL_ALT})(?:\\s+\\d{4})?` +
    `|\\d{1,2}\\s+de\\s+(?:${MONTH_FULL_ALT})(?:\\s+(?:de\\s+)?\\d{4})?` +
  ')$',
  'i',
)

/**
 * Si el section header tiene formato "día de mes" (Mercado Pago) o
 * "31 de mayo de 2026" (Francés), lo convierte a ISO `YYYY-MM-DD`.
 * Para "Hoy" / "Ayer" / "Mayo" / "Mayo 2026" (que no tienen día único)
 * devuelve null y el caller debe inferir la fecha de otra parte.
 *
 * Cuando el header no incluye año (ej. "31 de mayo"), usa
 * `defaultYear`. Para "31 de mayo 2026" / "31 de mayo de 2026" usa el
 * año del header.
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

/**
 * Convierte una línea de fecha por-fila a ISO. Soporta:
 *   - "01 jun 2026"   (RE_DATE — formato del bank captura inicial)
 *   - "29/05"         (RE_DATE_NUMERIC sin año — usa defaultYear)
 *   - "29/05/26"      (RE_DATE_NUMERIC año a 2 dígitos — 20XX)
 *   - "29/05/2026"    (RE_DATE_NUMERIC año a 4 dígitos)
 *
 * Devuelve null si el texto no calza con ningún patrón.
 */
export function rowDateToISO(
  text: string,
  defaultYear: number,
): string | null {
  // Forma "01 jun 2026"
  const fullMatch = text.match(RE_DATE)
  if (fullMatch) {
    const day = fullMatch[1].padStart(2, '0')
    const monthKey = fullMatch[2].toLowerCase().slice(0, 3)
    const month = MONTHS_ES[monthKey]
    if (!month) return null
    return `${fullMatch[3]}-${month}-${day}`
  }

  // Forma "29/05" o "29/05/26" o "29/05/2026"
  const numMatch = text.match(RE_DATE_NUMERIC)
  if (numMatch) {
    const day = numMatch[1].padStart(2, '0')
    const month = numMatch[2].padStart(2, '0')
    let year: string
    if (numMatch[3]) {
      year = numMatch[3].length === 2 ? `20${numMatch[3]}` : numMatch[3]
    } else {
      year = String(defaultYear)
    }
    return `${year}-${month}-${day}`
  }

  return null
}
