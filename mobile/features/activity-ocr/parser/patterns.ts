export const RE_DATE = /^(\d{1,2})\s+([a-záéíóú]{3,})\.?\s+(\d{4})$/i

export const RE_AMOUNT = /([+\-−])\s*([\d.,]+)\s*([A-Za-z]{2,5})/

export const RE_SECTION = /^(hoy|ayer|[a-záéíóú]+\s+\d{4})$/i

export const MONTHS_ES: Readonly<Record<string, string>> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
}
