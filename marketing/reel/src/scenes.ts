import type {Segment} from './components/Title'

export type ProductSceneDef = {
  id: string
  clip: string
  startFrom: number
  title: Segment[]
  caption?: string
}

// startFrom en frames del CLIP canónico (30fps). Los clips ya vienen
// recortados a su ventana útil, así que los offsets son chicos.
export const PRODUCT_SCENES: ProductSceneDef[] = [
  {
    id: 'home',
    clip: 'captures/02-home.mp4',
    startFrom: 15,
    title: [{text: 'Tu saldo del mes, de un vistazo.'}],
  },
  {
    id: 'gastos',
    clip: 'captures/03-gastos.mp4',
    startFrom: 45,
    title: [{text: 'Cada peso, a la '}, {text: 'vista', accent: true}, {text: '.'}],
  },
  {
    id: 'fijos',
    clip: 'captures/04-fijos.mp4',
    startFrom: 10,
    title: [{text: 'Lo recurrente, en '}, {text: 'orden', accent: true}, {text: '.'}],
    caption: 'Aumentos detectados',
  },
  {
    id: 'control',
    clip: 'captures/05-control.mp4',
    startFrom: 15,
    title: [{text: 'Tu ritmo, bajo control.'}],
  },
  {
    id: 'jardin',
    clip: 'captures/06-jardin.mp4',
    startFrom: 30,
    title: [
      {text: 'Los hábitos no se anotan. Se '},
      {text: 'cultivan', accent: true},
      {text: '.'},
    ],
  },
  {
    id: 'wrapped',
    clip: 'captures/07-wrapped.mp4',
    startFrom: 0,
    title: [{text: 'Cada cierre, tu resumen.'}],
  },
  {
    id: 'familia',
    clip: 'captures/08-familia.mp4',
    startFrom: 15,
    title: [{text: 'Solo o en familia. Como quieras.'}],
  },
]
