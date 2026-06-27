import { categoryTemplateKey } from '@/features/categories/localize-category-name'
import type { CategoryIconKey } from './category-icon-registry'
import { CATEGORY_ICONS } from './category-icon-registry'

/**
 * Mapeo SLUG-de-template → ícono (sticker). Se resuelve por el slug ESTABLE de
 * la categoría (`categoryTemplateKey(name crudo)`), NO por el nombre localizado
 * — mismo criterio que el resto de la resolución de categorías (evita el bug de
 * "lógica sobre strings localizados").
 *
 * Batch 1a: las 18 categorías de gasto actuales. Los slugs nuevos (cafetería,
 * delivery, combustible…) y los de fijos/ingresos se suman en próximos batches.
 */
const EXPENSE_ICON_BY_SLUG: Record<string, CategoryIconKey> = {
  // — Categorías default actuales (18) —
  alquiler: 'vivienda/vivienda',
  mercado: 'alimentacion/supermercado',
  transporte: 'transporte/transporte-publico',
  ocio: 'entretenimiento/salidas-cine',
  servicios: 'servicios-general/servicios',
  salud: 'salud/medico',
  educacion: 'educacion/educacion',
  mascotas: 'servicios-general/mascotas',
  ropa: 'cuidado-personal/ropa',
  tecnologia: 'tecnologia/celular',
  regalos: 'servicios-general/regalos',
  viajes: 'transporte/avion',
  restaurantes: 'alimentacion/comida-rapida',
  deporte: 'deportes/actividades-fisicas',
  suscripciones: 'extra/subscripciones',
  impuestos: 'finanzas/impuestos',
  belleza: 'cuidado-personal/maquillaje',
  otros: 'servicios-general/otros',

  // — Alimentación — (también enciende categorías custom que matcheen)
  supermercado: 'alimentacion/supermercado',
  almacen: 'alimentacion/supermercado',
  kiosco: 'alimentacion/supermercado',
  verduleria: 'alimentacion/supermercado',
  carniceria: 'alimentacion/supermercado',
  comida: 'alimentacion/comida-rapida',
  'comida-rapida': 'alimentacion/comida-rapida',
  cafeteria: 'alimentacion/cafeteria',
  cafe: 'alimentacion/cafeteria',
  delivery: 'alimentacion/delivery',
  panaderia: 'alimentacion/panaderia',
  pan: 'alimentacion/panaderia',
  postres: 'alimentacion/postres',
  helado: 'alimentacion/postres',
  dulces: 'alimentacion/postres',
  salida: 'alimentacion/salida',
  salidas: 'alimentacion/salida',

  // — Transporte —
  'transporte-publico': 'transporte/transporte-publico',
  colectivo: 'transporte/transporte-publico',
  sube: 'transporte/transporte-publico',
  combustible: 'transporte/combustible',
  nafta: 'transporte/combustible',
  gasolina: 'transporte/combustible',
  gasoil: 'transporte/combustible',
  estacionamiento: 'transporte/parking',
  parking: 'transporte/parking',
  peaje: 'transporte/parking',
  taxi: 'transporte/taxi',
  uber: 'transporte/taxi',
  remis: 'transporte/taxi',
  cabify: 'transporte/taxi',
  auto: 'transporte/automovil',
  automovil: 'transporte/automovil',
  vehiculo: 'transporte/automovil',
  service: 'transporte/automovil',
  bici: 'transporte/bicicleta',
  bicicleta: 'transporte/bicicleta',
  subte: 'transporte/metro-subte',
  metro: 'transporte/metro-subte',
  tren: 'transporte/metro-subte',
  avion: 'transporte/avion',
  vuelo: 'transporte/avion',
  pasajes: 'transporte/avion',

  // — Salud —
  medico: 'salud/medico',
  consulta: 'salud/medico',
  farmacia: 'salud/farmacia',
  medicamentos: 'salud/farmacia',
  gimnasio: 'salud/gimnasio',
  gym: 'salud/gimnasio',
  dentista: 'salud/dentista',
  odontologo: 'salud/dentista',
  oculista: 'salud/oculista',
  oftalmologo: 'salud/oculista',
  optica: 'salud/oculista',
  lentes: 'salud/oculista',

  // — Cuidado personal —
  peluqueria: 'cuidado-personal/corte-de-pelo',
  'corte-de-pelo': 'cuidado-personal/corte-de-pelo',
  perfume: 'cuidado-personal/perfume',
  perfumeria: 'cuidado-personal/perfume',
  calzado: 'cuidado-personal/calzado',
  zapatos: 'cuidado-personal/calzado',
  zapatillas: 'cuidado-personal/calzado',
  maquillaje: 'cuidado-personal/maquillaje',

  // — Educación —
  libros: 'educacion/libros',
  libreria: 'educacion/libros',
  utiles: 'educacion/utiles',
  materiales: 'educacion/utiles',
  curso: 'educacion/educacion',
  colegio: 'educacion/educacion',
  'clases-virtuales': 'extra/clases-virtuales',
  clases: 'extra/clases-virtuales',

  // — Entretenimiento —
  conciertos: 'entretenimiento/conciertos',
  concierto: 'entretenimiento/conciertos',
  recital: 'entretenimiento/conciertos',
  musica: 'entretenimiento/musica',
  videojuegos: 'entretenimiento/videojuegos',
  juegos: 'entretenimiento/videojuegos',
  hobby: 'entretenimiento/hobby',
  hobbies: 'entretenimiento/hobby',
  paseos: 'deportes/paseos',
  paseo: 'deportes/paseos',
  streaming: 'extra/streaming',
  cine: 'entretenimiento/salidas-cine',
  hotel: 'entretenimiento/hotel-viajes',
  alojamiento: 'entretenimiento/hotel-viajes',
  hospedaje: 'entretenimiento/hotel-viajes',
  vacaciones: 'entretenimiento/hotel-viajes',

  // — Tecnología —
  celular: 'tecnologia/celular',
  computadora: 'extra/computadora',
  notebook: 'extra/computadora',
  pc: 'extra/computadora',
  accesorios: 'tecnologia/accesorios',
  fotografia: 'tecnologia/fotografia',
  camara: 'tecnologia/fotografia',
  nube: 'tecnologia/nube',
  apps: 'extra/apps',

  // — Hogar —
  agua: 'vivienda/agua',
  gas: 'vivienda/gas',
  luz: 'vivienda/electricidad',
  electricidad: 'vivienda/electricidad',
  internet: 'vivienda/internet',
  wifi: 'vivienda/internet',
  cable: 'vivienda/internet',
  hipoteca: 'vivienda/hipoteca',
  expensas: 'vivienda/vivienda',
  limpieza: 'vivienda/limpieza',
  decoracion: 'extra/decoracion',
  muebles: 'extra/decoracion',
  reparaciones: 'extra/reparaciones',
  mantenimiento: 'extra/reparaciones',
  ferreteria: 'extra/reparaciones',
  herramientas: 'servicios-general/hardware',
  hardware: 'servicios-general/hardware',

  // — Servicios / finanzas —
  donaciones: 'servicios-general/donaciones',
  donacion: 'servicios-general/donaciones',
  tarjeta: 'finanzas/tarjeta-de-credito',
  'tarjeta-de-credito': 'finanzas/tarjeta-de-credito',
  ahorro: 'finanzas/ahorro',
  banco: 'finanzas/banco',
  cajero: 'finanzas/cajero',
}

const FIXED_ICON_BY_SLUG: Record<string, CategoryIconKey> = {
  // — Categorías default de fijos (8) —
  servicios: 'vivienda/electricidad',
  vivienda: 'vivienda/vivienda',
  suscripciones: 'extra/subscripciones',
  seguros: 'finanzas/seguros',
  cuotas: 'frecuencias/cuotas',
  impuestos: 'finanzas/impuestos',
  deudas: 'finanzas/deuda',
  inversiones: 'finanzas/inversiones',

  // — Servicios del hogar / utilities (fijos típicos) —
  alquiler: 'vivienda/vivienda',
  expensas: 'vivienda/vivienda',
  hipoteca: 'vivienda/hipoteca',
  luz: 'vivienda/electricidad',
  electricidad: 'vivienda/electricidad',
  'luz-y-gas': 'vivienda/electricidad',
  gas: 'vivienda/gas',
  agua: 'vivienda/agua',
  internet: 'vivienda/internet',
  cable: 'vivienda/internet',
  wifi: 'vivienda/internet',
  telefono: 'tecnologia/celular',
  celular: 'tecnologia/celular',
  limpieza: 'vivienda/limpieza',

  // — Servicios recurrentes —
  streaming: 'extra/streaming',
  netflix: 'extra/streaming',
  spotify: 'entretenimiento/musica',
  gimnasio: 'salud/gimnasio',
  prepaga: 'salud/medico',
  'obra-social': 'salud/medico',
  educacion: 'educacion/educacion',
  colegio: 'educacion/educacion',
  tarjeta: 'finanzas/tarjeta-de-credito',
  'tarjeta-de-credito': 'finanzas/tarjeta-de-credito',
  prestamo: 'finanzas/deuda',
  ahorro: 'finanzas/ahorro',
}

export type CategoryIconScope = 'expense' | 'fixed_expense'

/**
 * Devuelve la key del ícono sticker para una categoría (por su nombre CRUDO),
 * o null si no hay sticker mapeado (→ el caller cae al emoji). Valida que la key
 * exista en el registry generado.
 */
export function resolveCategoryIconKey(
  rawName: string,
  scope: CategoryIconScope = 'expense',
): CategoryIconKey | null {
  const slug = categoryTemplateKey(rawName)
  const map = scope === 'fixed_expense' ? FIXED_ICON_BY_SLUG : EXPENSE_ICON_BY_SLUG
  const key = map[slug]
  return key && key in CATEGORY_ICONS ? key : null
}
