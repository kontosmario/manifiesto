// PoC — dirección de arte nueva de Brot sobre una superficie real.
//
// Qué se está probando ACÁ y qué no:
//   ▸ SÍ: cómo se lee el Brot pre-renderizado (volumétrico, sin contorno)
//     dentro del vocabulario neo de la app — tipografía, wells, tokens.
//   ▸ NO: la migración del personaje. `BrotMascot` sigue siendo el Brot
//     de producción; este componente no lo toca.
//
// La pantalla imita un cierre DIARIO (no semanal): el caso "ayer gastaste
// todo el cupo". Se eligió ese momento porque es el que le da sentido al
// clip disponible — Brot revisando los bolsillos vacíos.
//
// Los números son MOCK. No hay VM ni query detrás: el objetivo es juzgar
// la dirección visual, no el cableado de datos.

import { StyleSheet, View } from 'react-native'
import { BrotClip } from '@/components/brot/brot-clip'
import { Text } from '@/components/ui/app-text'
import { Screen } from '@/components/ui/screen'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily, typography } from '@/theme/typography'

/** Datos de vitrina. Ver cabecera: el PoC no lee del backend. */
const MOCK = {
  fecha: 'Ayer · sábado 30',
  cupo: '$12.400',
  gastado: '$12.400',
  restante: '$0',
  cupoHoy: '$12.400',
} as const

export function BrotPocScreen() {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)

  return (
    <Screen canGoBack title="Cierre de ayer">
      <View style={styles.root}>
        <Text style={[styles.eyebrow, { color: neo.textTertiary }]}>{MOCK.fecha}</Text>

        {/* El clip ya tiene alpha real, así que se apoya directo sobre el
            material neo del tema — sin tarjeta blanca horneada. Es lo que
            hay que juzgar en device: cómo se para el Brot volumétrico sobre
            el canvas de la app, en claro Y en oscuro. */}
        <View style={[styles.stage, cssGradient(neo.raisedGradientCss, neo.surface)]}>
          <BrotClip fallbackPose="worried" height={280} />
        </View>

        <Text style={[styles.title, { color: neo.text }]}>Ayer usaste todo tu cupo</Text>
        {/* `typography.bodyLarge` ya trae su propio lineHeight seguro para
            Nunito — no hace falta recalcularlo acá. */}
        <Text style={[styles.body, { color: neo.textMuted }]}>
          Cerraste el día sin nada disponible. Pasa, y no arruina nada — lo que
          cuenta es cómo arranca hoy.
        </Text>

        <View style={[styles.stats, { backgroundColor: neo.well, borderRadius: neoRadii.card }]}>
          <Stat ink={neo.text} label="Cupo" sub={neo.textTertiary} value={MOCK.cupo} />
          <View style={[styles.statDivider, { backgroundColor: neo.sheetDivider }]} />
          <Stat ink={neo.text} label="Gastaste" sub={neo.textTertiary} value={MOCK.gastado} />
          <View style={[styles.statDivider, { backgroundColor: neo.sheetDivider }]} />
          <Stat ink={neo.danger} label="Quedó" sub={neo.textTertiary} value={MOCK.restante} />
        </View>

        <View style={[styles.today, cssGradient(neo.raisedGradientCss, neo.surface)]}>
          <Text style={[styles.todayLabel, { color: neo.greenDeep }]}>Hoy</Text>
          <Text style={[styles.todayValue, { color: neo.text }]}>
            Tienes {MOCK.cupoHoy} para el día
          </Text>
          <Text style={[styles.todayBody, { color: neo.textMuted }]}>
            Si hoy te guardas algo, el fin de semana lo vas a agradecer.
          </Text>
        </View>
      </View>
    </Screen>
  )
}

interface StatProps {
  ink: string
  label: string
  sub: string
  value: string
}

function Stat({ ink, label, sub, value }: StatProps) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: sub }]}>{label}</Text>
      <Text style={[styles.statValue, { color: ink }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  body: {
    ...typography.bodyLarge,
    textAlign: 'center',
  },
  eyebrow: {
    ...typography.eyebrow,
    textAlign: 'center',
  },
  root: {
    alignItems: 'center',
    gap: 18,
    paddingBottom: 32,
    paddingTop: 4,
  },
  stage: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: neoRadii.card,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
  },
  statDivider: {
    alignSelf: 'stretch',
    marginVertical: 12,
    width: 1.5,
  },
  statLabel: {
    ...typography.fieldLabel,
  },
  statValue: {
    ...typography.metricValue,
  },
  stats: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    paddingVertical: 16,
  },
  title: {
    ...typography.sectionTitle,
    textAlign: 'center',
  },
  today: {
    alignSelf: 'stretch',
    borderRadius: neoRadii.card,
    gap: 5,
    padding: 18,
  },
  todayBody: {
    ...typography.bodySmall,
  },
  todayLabel: {
    fontFamily: nunitoFamily('800'),
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  todayValue: {
    ...typography.titleMedium,
  },
})
