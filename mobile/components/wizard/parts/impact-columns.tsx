// Bloque "antes → ahora" del paso de impacto: dos columnas enfrentadas por una
// flecha. Extraído de `add-fijo-parts/impact-card.tsx` (rama neo) sin tocar el
// markup. Todo el texto entra por props ya formateado —montos, porcentajes,
// delta— así que sirve igual para el impacto de un gasto o de un ingreso: el
// kit no sabe qué se está sumando.
//
// Sólo dibuja en la piel `neo`: en `classic` devuelve null, igual que en
// fijos, donde ese caso lo cubren `ImpactRow` + `ImpactBar`.
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useWizardSkin, type WizardNeoSkin } from '@/components/wizard/wizard-skin'
import { nunitoFamily } from '@/theme/typography'

/** Columna ANTES o AHORA del bloque de impacto. La de la derecha alinea a la
 *  derecha; el ancho lo reparten con `flex:1`, así el par queda centrado sobre
 *  la flecha sin medir nada. */
function ImpactColumn({
  neo,
  align,
  label,
  labelInk,
  value,
  valueInk,
  valueSize,
  sub,
}: {
  neo: WizardNeoSkin
  align: 'left' | 'right'
  label: string
  labelInk: string
  value: string
  valueInk: string
  valueSize: number
  sub: React.ReactNode
}) {
  const textAlign = align
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={[
          styles.colLabel,
          { color: labelInk, fontFamily: neo.font('800'), textAlign },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.colValue,
          {
            color: valueInk,
            fontSize: valueSize,
            fontFamily: neo.font('900'),
            textAlign,
          },
        ]}
        // Dos columnas de `flex:1` con montos de 7 cifras: en un teléfono
        // angosto el número wrapeaba y la fila se iba a dos líneas con la
        // flecha descolgada al medio. Se achica antes de partirse.
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        // Escala con el sistema, con tope. Estas son JUSTO las cifras que hay
        // que leer para decidir si se confirma: con `allowFontScaling={false}`
        // un usuario con Texto Grande veía el paso entero escalado menos los
        // dos números que importan. Lo que evitaba que la fila se partiera —el
        // motivo original del flag— es el `adjustsFontSizeToFit` de arriba, no
        // el flag. Mismo criterio que el importe del resumen (1.3) y el chip
        // del delta (1.2) del paso 2 de gasto.
        maxFontSizeMultiplier={1.2}
      >
        {value}
      </Text>
      {sub}
    </View>
  )
}

export interface ImpactColumnsProps {
  beforeLabel: string
  afterLabel: string
  beforeValue: string
  afterValue: string
  /** Ausentes cuando no hay base con la que calcular el porcentaje. */
  beforePctText?: string
  afterPctText?: string
  deltaPctText?: string
}

export function ImpactColumns(props: ImpactColumnsProps) {
  const skin = useWizardSkin()
  if (skin.kind !== 'neo') return null
  const neo = skin
  const {
    beforeLabel,
    afterLabel,
    beforeValue,
    afterValue,
    beforePctText,
    afterPctText,
    deltaPctText,
  } = props
  return (
    <View style={styles.columns}>
      <ImpactColumn
        neo={neo}
        align="left"
        label={beforeLabel}
        labelInk={neo.faintInk}
        value={beforeValue}
        // El ANTES va de-enfatizado en tinta SUB aunque el peso sea 900: el
        // contraste lo hace el color, no el grosor. Así el AHORA gana sin
        // que el par pierda simetría tipográfica.
        valueInk={neo.mutedInk}
        valueSize={17}
        sub={
          beforePctText != null ? (
            <Text
              style={[
                styles.colSub,
                { color: neo.faintInk, fontFamily: neo.font('800'), textAlign: 'left' },
              ]}
            >
              {beforePctText}
            </Text>
          ) : null
        }
      />
      <View style={styles.arrow}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 12h13M12 6l6 6-6 6"
            stroke={neo.faintInk}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <ImpactColumn
        neo={neo}
        align="right"
        label={afterLabel}
        labelInk={neo.add.accentGreen}
        value={afterValue}
        valueInk={neo.ink.title}
        valueSize={20}
        sub={
          afterPctText != null ? (
            // Porcentaje y delta en UNA línea: el `+1pp` es un modificador
            // del porcentaje, no un dato aparte. Nunito son faces estáticas
            // por peso, así que el <Text> anidado pisa familia junto al peso.
            <Text
              style={[
                styles.colSub,
                {
                  color: neo.add.accentGreen,
                  fontFamily: neo.font('900'),
                  fontWeight: '900',
                  textAlign: 'right',
                },
              ]}
            >
              {afterPctText}
              {deltaPctText != null ? (
                <Text
                  style={{
                    color: neo.add.accentClay,
                    fontFamily: neo.font('900'),
                    fontWeight: '900',
                  }}
                >
                  {' '}
                  {deltaPctText}
                </Text>
              ) : null}
            </Text>
          ) : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 13 },
  colLabel: { fontSize: 9.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 0.95 },
  colValue: { fontWeight: '900', fontFamily: nunitoFamily('900'), marginTop: 2 },
  colSub: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800') },
  arrow: { flexGrow: 0, flexShrink: 0 },
})
