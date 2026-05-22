# CODE RULES v2

> 🗓️ **Vigente** — guía normativa de referencia. El estado actual del código está en el [snapshot ESTADO-DEL-PROYECTO](../ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md).

Guía oficial de arquitectura, performance y UX para `Manifiesto Mobile`.

> **Cambios respecto a v1:** Las secciones 9, 10, 11 y 12 fueron reescritas con reglas más prescriptivas, ejemplos de código concretos y patrones accionables. Se agregaron secciones 19 (Estados de UI), 20 (Micro-interacciones) y 21 (Checklist de pantalla nueva). El resto se mantiene igual.

---

## 1. Objetivo del proyecto

- La app es `mobile-first`, no "responsive web disfrazada".
- La experiencia debe ser `touch-first`, `thumb-friendly`, rápida y clara.
- El usuario principal no necesariamente entiende finanzas; la UI debe traducir datos a decisiones.
- La prioridad técnica es:
  1. Correctitud funcional.
  2. Performance perceptible.
  3. Claridad arquitectónica.
  4. Accesibilidad.
  5. Pulido visual.

---

## 2. Capas y arquitectura obligatoria

### 2.1 `app/`

- `app/` existe para `Expo Router`.
- Los archivos en `app/` deben ser delgados.
- Un route file solo puede:
  - resolver params,
  - componer providers/layout,
  - delegar a una screen.
- Un route file no debe:
  - hablar con Supabase,
  - contener lógica de negocio,
  - transformar data compleja,
  - definir UI grande.

### 2.2 `mobile/screens/`

- `mobile/screens/` es la capa de orquestación de pantalla.
- Una `screen` puede:
  - componer hooks de features,
  - manejar estado estrictamente visual de la pantalla,
  - decidir loading / empty / error / content,
  - pasar props a componentes de dominio o UI.
- Una `screen` no debe:
  - contener lógica financiera compleja,
  - hablar directo con Supabase,
  - definir algoritmos de cálculo,
  - mezclar demasiadas responsabilidades en un mismo archivo.

Regla práctica: si una screen supera ~250-300 líneas y mezcla fetch + transformación + visuales + modales + navegación, se debe dividir.

### 2.3 `mobile/features/`

- `mobile/features/<domain>/` es la capa de aplicación y dominio por feature.
- Cada feature debe contener, según necesidad:
  - `use-*.ts`: hooks de acceso a datos y mutations.
  - `*-engine.ts`: reglas puras de negocio.
  - `*-types.ts`: tipos del dominio.
  - `*-utils.ts`: helpers internos del dominio.

Reglas:
- Los `engine` deben ser puros: sin React, sin navegación, sin IO, sin acceso a fecha global si puede inyectarse.
- Los hooks de feature sí pueden usar React Query, Supabase, Expo APIs si la feature lo requiere.
- Una feature no debe importar screens.

### 2.4 `mobile/components/`

- `mobile/components/ui/` contiene primitives reusables y agnósticos al dominio.
- `mobile/components/<domain>/` contiene componentes presentacionales ligados a un caso de negocio concreto.

Reglas:
- Un componente no debe consultar Supabase.
- Un componente UI no debe saber nada de rutas, familia, categorías, gastos o deuda.
- Un componente de dominio puede entender su contexto funcional, pero debe recibir datos por props.

### 2.5 `mobile/lib/`

Infraestructura: Supabase client, bridges nativos, runtime, haptics, storage, adapters compartidos.

Reglas:
- `lib` no importa screens ni decide UX.
- `lib` expone capacidades, no flujos.

### 2.6 `mobile/hooks/`

Reservado para hooks transversales o cross-feature. Si un hook es claramente de un dominio, debe vivir en `mobile/features/<domain>/`.

### 2.7 `mobile/utils/`

Solo funciones puras, pequeñas y cross-domain. Si una utilidad solo le sirve a una feature, debe vivir dentro de esa feature.

---

## 3. Dependencias permitidas

```
app → screens → features → lib/utils
screens → components
components → ui/theme/utils
features → lib/utils
```

No permitido: `components → screens`, `lib → screens`, `lib → components`, `features → screens`, `ui → domain-specific features`.

---

## 4. SOLID aplicado al proyecto

### S: Single Responsibility
Cada archivo debe tener una razón clara para cambiar. Una screen no debe simultáneamente fetchear, calcular métricas, definir componentes internos, manejar side effects y renderizar la vista completa.

### O: Open/Closed
Extender una feature debe implicar componer nuevas piezas, no editar condicionales gigantes. Preferir tablas de configuración y componentes especializados por variante.

### L: Liskov Substitution
Los componentes de UI deben mantener contratos previsibles. Si una variante cambia comportamiento, debe ser explícita vía props o componente distinto.

### I: Interface Segregation
No pasar objetos enormes "por comodidad". Las props deben ser pequeñas, específicas y significativas.

### D: Dependency Inversion
La pantalla depende de hooks/servicios del dominio, no de detalles de infraestructura.

---

## 5. Clean Architecture aplicada

| Capa | Archivos |
|------|----------|
| Presentación | `app/`, `mobile/screens/`, `mobile/components/` |
| Aplicación | hooks de feature, coordinadores cross-feature |
| Dominio | engines, reglas de negocio, tipos, selectores puros |
| Infraestructura | Supabase, Expo APIs, persistencia, notificaciones |

Regla principal: la lógica importante debe poder probarse sin renderizar una screen.

---

## 6. React y hooks

### 6.1 `useEffect`

Solo para sincronizar con sistemas externos. No usar para derivar data, copiar props a state, o disparar lógica que pertenece a un evento.

Preferir: cálculo directo en render, funciones puras, `useMemo` solo si hay costo real, handlers explícitos, `startTransition` para updates no urgentes.

### 6.2 Estado

El estado debe vivir lo más cerca posible de donde se usa. No duplicar estado para data derivada. El estado del servidor vive en React Query, no en `useState`.

### 6.3 Memoización

Solo usar `useMemo` o `useCallback` cuando hay un cálculo pesado, se necesita estabilidad referencial real, o el profiling demuestra beneficio.

---

## 7. React Query / server state

Reglas:
- Toda query debe tener `queryKey` estable, explícita y serializable.
- Si la query depende de una variable, esa variable debe estar en el `queryKey`.
- Las invalidaciones ocurren en callbacks de mutation o en helpers centralizados.
- Las screens no deben llamar Supabase directamente; usan hooks de feature.

Recomendaciones:
- Definir `queryKey` factories por feature.
- Usar `select` o engines puros para adaptar datos.
- No invalidar "todo"; invalidar granularmente.

---

## 8. Performance

### 8.1 Reglas generales
- Validar en `release build`, no en dev mode.
- No dejar `console.*` en caminos críticos ni UI loops.
- Medir antes de optimizar agresivamente.

### 8.2 Listas
- Datasets variables o crecientes: `FlatList` o `SectionList`.
- `ScrollView` solo cuando la cantidad de elementos sea pequeña y acotada.
- Toda lista debe definir `keyExtractor` estable.
- Si los items tienen tamaño conocido, usar `getItemLayout`.
- No usar `index` como key salvo contenido estático y no reordenable.

### 8.3 Render
- Mantener state local para evitar rerenders de árbol completo.
- Evitar recalcular mapas, filtros y agrupaciones pesadas en cada render.

### 8.4 Navegación y animación
- Preferir el `Native Stack` provisto por Expo Router / React Navigation.
- No bloquear transiciones con trabajo pesado en el mismo frame.
- Usar `startTransition` para updates no urgentes.
- Usar `InteractionManager.runAfterInteractions` para trabajo pesado post-transición.

### 8.5 Imágenes y assets
- Toda imagen debe renderizarse al tamaño correcto.
- Si una imagen se anima, escalar por `transform`, no por `width/height`.

### 8.6 New Architecture
- El proyecto debe seguir compatible con la New Architecture.
- No introducir librerías que dependan de patrones legacy si hay alternativa moderna.

### 8.7 Data shaping y snapshots compartidos
- Si varias features necesitan el mismo resumen derivado, ese resumen vive en un `engine` o selector puro.
- No disparar queries derivadas si ya existe una colección base suficiente en caché.
- Toda optimización busca: menos fetch redundante, menos trabajo síncrono por render, menos recomputación cruzada.

---

## 9. Mobile-first UX _(reescrito)_

### 9.1 Principio rector

Cada pantalla debe responder una sola pregunta del usuario. Si la pantalla responde más de una, es candidata a dividirse o a usar una jerarquía visual más clara.

Preguntas típicas válidas por pantalla:
- "¿Cómo voy este mes?" → Dashboard
- "¿En qué gasté?" → Historial
- "¿Cuánto me queda para esta categoría?" → Detalle de categoría
- "¿Cuánto le debo a X?" → Detalle de deuda

### 9.2 Touch targets

- Mínimo absoluto: `44×44 pt`.
- Preferir `48×48 pt` para acciones frecuentes.
- Los controles deben estar cerca del contenido que modifican.
- No esconder acciones importantes detrás de targets pequeños.

```tsx
// ✅ Correcto
<Pressable style={{ minHeight: 48, paddingHorizontal: 16, justifyContent: 'center' }}>
  <Text>Acción</Text>
</Pressable>

// ❌ Incorrecto
<Pressable style={{ width: 24, height: 24 }}>
  <Icon name="edit" size={16} />
</Pressable>
```

### 9.3 Zona pulgar (thumb zone)

En una pantalla estándar de 390pt de ancho:
- **Zona cómoda (verde):** centro-inferior, y=320pt hacia abajo.
- **Zona alcanzable (amarilla):** bordes laterales superiores.
- **Zona difícil (roja):** esquina superior izquierda.

Reglas:
- Las CTAs primarias deben vivir en la zona verde.
- Las acciones destructivas o de bajo uso pueden vivir en zona amarilla.
- Nunca colocar una acción frecuente en zona roja.
- El `tab bar` y el FAB central son la materialización de esta regla.

### 9.4 Jerarquía de acciones por pantalla

Cada pantalla debe tener exactamente:
- **1 acción primaria**: el siguiente paso obvio (botón prominente o FAB).
- **0-2 acciones secundarias**: acciones contextuales (ghost button, swipe, long press).
- **Acciones de bajo uso**: detrás de menú contextual o pantalla secundaria.

Si una pantalla tiene 3+ botones igualmente prominentes, es un problema de diseño, no de código.

### 9.5 Gestos

Catálogo permitido y sus usos en esta app:

| Gesto | Uso permitido | Restricción |
|-------|---------------|-------------|
| Tap | Acción primaria estándar | — |
| Double Tap | Aceleradores claros (ej: like rápido) | Nunca para acciones críticas ocultas |
| Long Press | Menú contextual de ítem | Siempre con affordance visual (scale o vibración) |
| Swipe horizontal | Acción rápida en lista (archivar, eliminar) | Siempre con confirmación o undo |
| Swipe vertical | Dismiss de sheet o modal | Solo si el sheet tiene drag indicator visible |
| Pull to Refresh | Actualizar lista o dashboard | Solo en listas con data remota |
| Edge Swipe | Back nativo iOS | No sobreescribir salvo razón explícita |
| Drag and Drop | Reordenar si aporta valor real | No para tareas que puede hacer un botón |

No permitido:
- Gestos secretos como único camino para una función.
- Swipe destructivo sin confirmación ni undo.
- Depender de un gesto para descubrir funcionalidad básica.

### 9.6 Haptics

```ts
// mobile/lib/haptics.ts — API real: triggerHaptic(tone)

import { triggerHaptic } from '@/lib/haptics';

// Tones disponibles: 'none' | 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'
await triggerHaptic('selection');
await triggerHaptic('success');
await triggerHaptic('error');
```

Mapa de uso:

| Evento | Haptic |
|--------|--------|
| Cambiar tab o segmento | `triggerHaptic('selection')` |
| Abrir bottom sheet | `triggerHaptic('light')` |
| Confirmar guardar gasto | `triggerHaptic('success')` |
| Error de validación | `triggerHaptic('error')` |
| Eliminar ítem | `triggerHaptic('warning')` → luego `triggerHaptic('success')` al confirmar |
| Scroll hasta un ítem | ninguno |
| Cambio de valor en slider | `triggerHaptic('selection')` (throttled) |

Reglas:
- Nunca disparar haptics en cascada (máximo 1 por acción de usuario).
- Nunca usar haptics para compensar mala claridad visual.
- Toda señal háptica importante debe tener equivalente visual.

### 9.7 Teclado e inputs

```tsx
// Patrón base para pantalla con inputs
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  style={{ flex: 1 }}
>
  <ScrollView keyboardShouldPersistTaps="handled">
    <TextField
      keyboardType="decimal-pad"
      returnKeyType="next"
      onSubmitEditing={() => nextRef.current?.focus()}
    />
    <TextField
      ref={nextRef}
      returnKeyType="done"
      onSubmitEditing={handleSubmit}
    />
  </ScrollView>
</KeyboardAvoidingView>
```

Reglas:
- `returnKeyType` siempre explícito: `next` para avanzar, `done` para cerrar, `search` o `go` cuando el CTA lo justifique.
- `keyboardType` correcto: `decimal-pad` para montos, `numeric` para enteros, `email-address`, `phone-pad` según corresponda.
- Tocar fuera debe poder cerrar el teclado cuando no rompa la tarea (usar `TouchableWithoutFeedback` + `Keyboard.dismiss()`).
- No depender de `autocorrect` en campos financieros (`autocorrect={false}`, `autoCapitalize="none"`).

### 9.8 Feedback visual inmediato

Toda interacción necesita feedback antes de 100ms. El usuario no debe dudar si su toque fue registrado.

```tsx
// Patrón para Pressable con feedback correcto
<Pressable
  style={({ pressed }) => [
    styles.button,
    pressed && styles.buttonPressed, // escala o cambio de opacidad
  ]}
  onPress={handlePress}
>
  <Text>Guardar</Text>
</Pressable>

const styles = StyleSheet.create({
  button: { transform: [{ scale: 1 }] },
  buttonPressed: { opacity: 0.75 }, // o scale: 0.97 con Reanimated
});
```

Reglas:
- En iOS: opacidad reducida o scale sutil al presionar.
- En Android: ripple nativo obligatorio.
- Nunca dejar un botón sin estado visual pressed.

```tsx
// Ripple Android correcto
<Pressable
  android_ripple={{ color: colors.primarySurface, borderless: false }}
  onPress={handlePress}
>
```

### 9.9 Sheets, modales y overlays

Cuándo usar cada uno:

| Patrón | Cuándo usarlo | Cuándo NO usarlo |
|--------|---------------|-----------------|
| Bottom Sheet | Tarea corta, 1-3 campos, acción contextual | Flujos con validación compleja |
| Modal full-screen | Flujo con múltiples campos o estados de riesgo | Confirmaciones simples |
| Toast / Snackbar | Feedback temporal no bloqueante (guardado, error leve) | Información crítica que requiere acción |
| Alert nativo | Confirmación destructiva, error del sistema | Información informativa |
| Inline feedback | Error de validación de campo | Errores de red o de sistema |

Reglas:
- Un bottom sheet siempre debe tener drag indicator visible.
- Un modal destructivo siempre debe tener botón de cancelar explícito.
- Un toast no debe durar menos de 2s ni más de 4s.
- No apilar más de un modal o sheet simultáneamente salvo flujo explícito de confirmación.

### 9.10 Navegación

Patrones base:
- `Stack Navigator`: avanzar y volver.
- `Tab Navigator`: áreas primarias de la app.
- `Drawer Navigator`: solo si existe razón clara de producto.

Reglas:
- Toda navegación importante debe ser entendible sin tutorial.
- Respetar `Back Gesture` y patrones nativos de retorno en iOS y Android.
- No usar navegación como sustituto de estructura pobre dentro de una pantalla.
- Los deep links deben ser previsibles para notificaciones y accesos contextuales.

---

## 10. Contenido y claridad _(reescrito)_

### 10.1 Lenguaje operativo

La app es financiera para usuarios no técnicos. Cada texto visible debe pasar este filtro:

**¿El usuario sabe qué hacer después de leer esto?**

Si la respuesta es "tal vez", reescribir.

| Evitar | Preferir |
|--------|----------|
| "Saldo disponible" | "Te quedan $X hoy" |
| "Exceso presupuestario" | "Gastaste $X de más esta semana" |
| "Ratio de endeudamiento" | "Tus deudas son el X% de tus ingresos" |
| "Período vigente" | "Este mes" / "Esta quincena" |
| "Sin registros" | "Todavía no cargaste gastos este mes" |

### 10.2 Jerarquía de información en pantalla

Cada pantalla debe tener exactamente 3 niveles de información:

1. **El número que importa ahora** → grande, bold, protagonista.
2. **El contexto de ese número** → mediano, muted, debajo o al lado.
3. **La acción que responde a ese número** → CTA clara, zona verde del pulgar.

```
┌─────────────────────────────┐
│  Te quedan                  │  ← nivel 2: contexto
│  $12.400                    │  ← nivel 1: número protagonista
│  para gastar hoy            │  ← nivel 2: contexto
│                             │
│  Si seguís así, cerrás      │  ← nivel 3: insight accionable
│  el mes con $800 de margen  │
│                             │
│  [Registrar gasto]          │  ← CTA única y clara
└─────────────────────────────┘
```

### 10.3 Métricas vacías están prohibidas

Una métrica sin acción o sin contexto no aporta valor. Antes de mostrar cualquier número, responder:
- ¿Qué significa este número?
- ¿Es bueno o malo para el usuario?
- ¿Qué puede hacer el usuario con esta información?

Si no hay respuesta para las tres preguntas, no mostrar la métrica o rediseñarla.

### 10.4 Estados vacíos (empty states)

El empty state no es un error. Es una oportunidad de orientar al usuario.

```tsx
// Patrón de empty state accionable
<EmptyState
  icon="account-balance-wallet"
  title="Todavía no hay gastos este mes"
  subtitle="Cuando registres tu primer gasto, vas a ver acá cómo va tu presupuesto."
  action={{ label: "Registrar primer gasto", onPress: handleAdd }}
/>
```

Reglas:
- Siempre incluir qué esperar cuando haya datos.
- Siempre incluir una acción si el usuario puede hacer algo.
- Nunca mostrar solo "Sin datos" o "No hay registros" sin contexto.

---

## 11. Accesibilidad _(reescrito con código)_

### 11.1 Roles y labels obligatorios

```tsx
// ✅ Botón con label explícito
<Pressable
  accessibilityRole="button"
  accessibilityLabel="Registrar nuevo gasto"
  onPress={handleAdd}
>
  <Icon name="plus" />
</Pressable>

// ✅ Valor financiero con contexto para VoiceOver
<Text
  accessibilityLabel={`Saldo disponible: ${formatCurrency(amount)}`}
>
  {formatCurrency(amount)}
</Text>

// ✅ Estado de carga
<ActivityIndicator
  accessibilityLabel="Cargando tus gastos"
  accessibilityLiveRegion="polite"
/>
```

### 11.2 Color y contraste

Nunca comunicar estado solo con color. Siempre agregar un indicador secundario:

```tsx
// ❌ Incorrecto: solo color
<Text style={{ color: isOverBudget ? colors.danger : colors.success }}>
  {formatCurrency(amount)}
</Text>

// ✅ Correcto: color + icono + texto
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
  <Icon
    name={isOverBudget ? 'alert-circle' : 'check-circle'}
    color={isOverBudget ? colors.danger : colors.success}
    accessibilityElementsHidden
  />
  <Text style={{ color: isOverBudget ? colors.danger : colors.success }}>
    {isOverBudget ? 'Presupuesto superado' : 'Dentro del presupuesto'}
  </Text>
</View>
```

Ratios de contraste mínimos:
- Texto normal: 4.5:1
- Texto grande (+18pt o +14pt bold): 3:1
- Componentes UI e iconos informativos: 3:1

### 11.3 Reduced motion

```tsx
import { useReducedMotion } from '@/hooks/use-reduced-motion';

function AnimatedCard({ children }: Props) {
  const reduceMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: reduceMotion
      ? [] // sin animación
      : [{ scale: withSpring(scale.value) }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
```

### 11.4 Orden de foco

El orden de foco para VoiceOver/TalkBack debe ser lógico (de arriba a izquierda a derecha a abajo). Si el layout es complejo, usar `importantForAccessibility` y `accessibilityViewIsModal` para aislar overlays.

```tsx
// Modal que captura el foco
<View accessibilityViewIsModal={true}>
  {/* Contenido del modal */}
</View>
```

### 11.5 Safe Areas

```tsx
// Siempre usar SafeAreaView o useSafeAreaInsets para pantallas con tabs o FAB
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function MyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, paddingBottom: insets.bottom + TAB_BAR_HEIGHT }}>
      {/* contenido */}
    </View>
  );
}
```

---

## 12. Styling y design system _(reescrito con patrones de código)_

### 12.1 Identidad visual

La UI de Manifiesto ya tiene dirección clara: verde financiero humano (no corporativo frío), superficies redondeadas y amigables, copy operativo con jerarquía fuerte.

Dos registros permitidos y separados:

| Registro | Uso | Características |
|----------|-----|-----------------|
| `Auth / onboarding` | Splash, login, registro | Teatral, más branding, fondos oscuros ricos, glow permitido |
| `App operativa` | Todas las pantallas post-login | Clara, legible, calmada, foco en datos y decisión |

Un recurso visual del mundo `Auth` no debe pasar a pantallas operativas.

### 12.2 Paleta oficial

> ⚠️ Los valores de color canonicos están en `mobile/theme/palette.ts` (paleta V1 "Mint Saturado"). Los tokens se consumen siempre a través del hook `useAppTheme()` → `theme.colors.*`. No hardcodear hex directamente.

Tokens clave de `ThemeColors` (nombres exactos del tipo):
- `canvas` / `background` / `backgroundElevated` / `surface` / `surfaceMuted` / `surfaceStrong`
- `border` / `borderStrong`
- `text` / `textMuted` / `textSoft`
- `primary` / `primaryStrong` / `primarySurface`
- `success` / `warning` / `danger`
- Tokens extendidos: `cream`, `creamCard`, `peach`, `heroGradient`, `line`, etc.

Reglas:
- El verde es el acento rector del producto. No introducir nuevos acentos primarios sin cambiar el theme.
- `warning` y `danger` son señales funcionales, no color decorativo.
- Si una pantalla necesita un matiz especial, debe nacer de la familia verde/ámbar ya existente.
- Para expresar estados semánticos (positive/caution/critical/neutral) usar `getStateTokens()` de `mobile/theme/state-tokens.ts`.

### 12.3 Tokens de spacing y radii

> Spacing y radii viven en `mobile/theme/palette.ts` (objeto `baseTheme`) y se exponen vía `useAppTheme()` → `theme.spacing.*` / `theme.radii.*`.

```ts
// mobile/theme/palette.ts — valores reales

// spacing (escala base 4)
theme.spacing = {
  xxs: 4,
  xs:  8,
  sm:  12,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
}

// radii
export const radii = {
  xs:    8,
  sm:    10,
  md:    14,
  lg:    18,
  xl:    22,
  '2xl': 28,
  pill:  999,
}

// Usos recomendados:
// cards principales: radii['2xl'] (28)
// botones default: radii.lg (18) o radii.md (14) según contexto
// inputs: radii.md (14)
// chips: radii.pill
```

### 12.4 Tipografía

> Los tokens viven en `mobile/theme/typography.ts` y se exponen vía `useAppTheme()` → `theme.typography.*`.

```ts
// mobile/theme/typography.ts — tokens reales

export const typography = {
  // Grandes protagonistas
  hero:          { fontSize: 54, fontWeight: '900', letterSpacing: -2 },
  displayLarge:  { fontSize: 40, fontWeight: '900', letterSpacing: -1.5 },
  screenTitle:   { fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
  sectionTitle:  { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  titleMedium:   { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },

  // Valores financieros
  metricLarge:   { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  metricValue:   { fontSize: 22, fontWeight: '800' },

  // Botones
  buttonDefault: { fontSize: 15, fontWeight: '700' },
  buttonCompact: { fontSize: 13, fontWeight: '700' },

  // Cuerpo
  bodyLarge:     { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  body:          { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  bodyEmphasis:  { fontSize: 15, fontWeight: '600' },
  bodySmall:     { fontSize: 13, fontWeight: '400', lineHeight: 18 },

  // Labels pequeñas
  eyebrow:       { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  fieldLabel:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  caption:       { fontSize: 11, fontWeight: '500' },
} as const;
```

Reglas:
- No introducir otra familia tipográfica para la app operativa.
- Reservar serif o tipografía expresiva para branding y acceso.
- Tracking positivo en eyebrows/labels pequeñas; negativo solo en cifras o títulos grandes.

### 12.5 Componentes base y su semántica

```tsx
// Semántica de AppButton

<AppButton variant="primary">    // Acción principal verde
<AppButton variant="secondary">  // Apoyo sobre superficie verde suave
<AppButton variant="ghost">      // Acción secundaria discreta
<AppButton variant="danger">     // Acción destructiva explícita
<AppButton variant="accent">     // Acento cálido (peach) para contextos especiales

// NO crear variantes ad-hoc inline. Si se necesita una variante nueva,
// agregarla formalmente al componente base.
```

```tsx
// Cuándo usar cada superficie

<AppCard />           // Superficie estándar para contenido
<BrandedPanel />      // Bloques importantes: hero, métricas clave
                      // No usar para todo; máximo 1-2 por pantalla

// ❌ No inventar superficies nuevas inline
<View style={{ backgroundColor: '#1a2e1e', borderRadius: 20 }}>
```

### 12.6 Sombras y elevación

> Las sombras se gestionan a través de `buildElevationStyle(theme, variant)` de `mobile/theme/elevation.ts`. Usa `boxShadow` (RN 0.76+) en vez de los props legacy `shadow*`.

```ts
// Uso correcto — nunca hardcodear shadow* props
import { buildElevationStyle } from '@/theme/elevation'
import { useAppTheme } from '@/theme/theme-provider'

function MyCard() {
  const { theme } = useAppTheme()
  return (
    <View style={[styles.card, buildElevationStyle(theme, 'card')]}>
      {/* ... */}
    </View>
  )
}

// Variantes disponibles: 'card' | 'cardElevated' | 'panel' | 'panelHero' | 'floatingNav' | 'segmentedActive'
```

Reglas:
- Usar siempre `buildElevationStyle` para sombras; no hardcodear `boxShadow` ni props `shadow*`.
- No usar elevación alta en listas densas o filas repetidas.
- En dark mode, compensar con borde visible, no con sombra agresiva.

### 12.7 Iconografía

- iOS: `SF Symbols` vía `expo-symbols` como prioridad.
- Android y fallback: `MaterialIcons`.
- No mezclar packs de iconos aleatorios.
- Usar íconos como apoyo semántico, no como decoración repetitiva.

### 12.8 Motion y polish

La app ya tiene una base de motion coherente. Reglas de extensión:

```tsx
// ✅ Spring para interacciones táctiles
const scale = useSharedValue(1);
const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ scale: withSpring(scale.value, { damping: 15, stiffness: 300 }) }],
}));

// Activar al press
onPressIn={() => { scale.value = 0.96; }}
onPressOut={() => { scale.value = 1; }}
```

Reglas:
- Motion debe reforzar tactilidad y jerarquía.
- Evitar animaciones simultáneas compitiendo.
- No usar movimiento decorativo continuo en pantallas operativas.
- Respetar `reduced motion` siempre.
- No usar Lottie salvo micro-momentos muy concretos.

### 12.9 Checklist de diseño para cualquier cambio visual

Antes de aprobar un cambio, responder:
- [ ] ¿Se siente parte de la misma familia verde/neutra actual?
- [ ] ¿Respeta la separación entre branding y app operativa?
- [ ] ¿Usa los mismos radios, densidad y jerarquía tipográfica base?
- [ ] ¿El color comunica estado real o solo decora?
- [ ] ¿La sombra ayuda a entender profundidad o solo agrega ruido?
- [ ] ¿Podría resolverse con `AppCard`, `BrandedPanel`, `AppButton`, `Chip`, `SegmentedControl` o `ModalCard` antes de inventar otra cosa?

---

## 13. Naming y organización de archivos

- `*-screen.tsx`: pantalla contenedora.
- `*-modal.tsx`: flujo modal.
- `use-*.ts`: hook.
- `*-engine.ts`: reglas de negocio puras.
- `*-types.ts`: tipos del dominio.
- `*-utils.ts`: helpers internos del dominio.

Reglas: nombres explícitos, sin archivos "misc", "helpers" o "temp" genéricos, cada dominio agrupa lo suyo.

---

## 14. Testing y validación

Comandos base:
- `./scripts/npmw run validate`
- `./scripts/npmw run test`
- `./scripts/npmw run typecheck`
- `./scripts/npmw run lint`

Reglas de tests:
- Toda lógica pura importante debe tener tests unitarios: engines, modelos, selectores, snapshots derivados, formatters críticos.
- Todo bug financiero debe intentar cerrarse con un test de regresión.
- Priorizar tests de comportamiento y salida; no tests atados a implementación interna.
- No usar tests de screen completos como sustituto de mala arquitectura.

Cobertura prioritaria:
- ciclo de cobro y congelamiento por confirmación pendiente,
- presupuesto diario y colchón,
- compromiso fijo, cuotas y deuda,
- proyecciones y sugerencias de control,
- invalidaciones y `queryKey` factories,
- validaciones de inputs financieros.

Validación manual mínima:
- probar en mobile con teclado real o simulador equivalente,
- revisar safe areas,
- revisar targets táctiles,
- revisar loading / empty / error,
- revisar haptics y gestos cuando cambien.

---

## 15. Calidad mínima por PR

Antes de mergear:
- `./scripts/npmw run validate`
- revisar estados `loading`, `empty`, `error`
- revisar accesibilidad básica
- revisar comportamiento con teclado y safe areas
- revisar performance perceptible en device real o simulador release-like

Toda PR relevante debe responder:
- qué responsabilidad quedó mejor separada,
- qué costo de render evitó o no empeoró,
- qué impacto tiene sobre UX mobile,
- si agrega o modifica haptics/gestos,
- si cambia query keys, invalidaciones o navegación.

---

## 16. Anti-patrones prohibidos

- Screens gigantes con lógica de negocio adentro.
- Supabase llamado desde componentes o screens.
- `useEffect` para derivar state renderizable.
- `ScrollView` para listas largas.
- Index keys en listas dinámicas.
- Navegación como acción.
- Haptics excesivos o arbitrarios.
- Gestos sin fallback visible.
- Métricas visualmente lindas pero sin acción clara.
- Copiar y pegar lógica entre features.
- Hardcodes de color/spacing repetidos fuera del theme.
- Botones sin estado visual pressed.
- Empty states sin contexto ni acción.
- Color como único indicador de estado.
- Touch targets menores a 44×44 pt.

---

## 17. Orden recomendado para el refactor posterior

### Fase 1: adelgazamiento estructural
- adelgazar `app/`
- dividir screens grandes
- mover cálculos a `engine` puros
- mover IO a hooks de feature

### Fase 2: server state y caching
- normalizar query keys
- centralizar invalidaciones
- eliminar fetches duplicados
- limpiar transforms repetidos

### Fase 3: performance de UI
- virtualizar listas
- revisar rerenders innecesarios
- optimizar modales, navegación y animaciones
- consolidar snapshots compartidos

### Fase 4: mobile-first interactions
- haptics consistentes (usar wrapper `haptics.*`)
- swipe/flick donde aporten valor real
- fallback visible para gestos
- audit de touch targets y safe areas

### Fase 5: accesibilidad y copy
- labels, roles y orden de foco
- reduced motion
- simplificación del lenguaje financiero
- audit de empty states

---

## 18. Fuentes base

- React Native Performance: https://reactnative.dev/docs/performance.html
- React Native FlatList: https://reactnative.dev/docs/flatlist.html
- React Native Accessibility: https://reactnative.dev/docs/accessibility
- React Native New Architecture: https://reactnative.dev/architecture/landing-page
- React Native Animations: https://reactnative.dev/docs/animations
- React `You Might Not Need an Effect`: https://react.dev/learn/you-might-not-need-an-effect
- Expo Haptics: https://docs.expo.dev/versions/latest/sdk/haptics/
- Expo Router Stack: https://docs.expo.dev/router/advanced/stack/
- React Native Gesture Handler: https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/gesture-composition/
- TanStack Query keys: https://tanstack.com/query/v5/docs/framework/react/guides/query-keys
- TanStack Query invalidation: https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
- Apple HIG Gestures: https://developer.apple.com/design/human-interface-guidelines/gestures
- Apple HIG Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Apple HIG Tab Bars: https://developer.apple.com/design/human-interface-guidelines/tab-bars
- WCAG 2.1 Contrast: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum
- CFPB Plain Writing: https://www.consumerfinance.gov/plain-writing/

---

## 19. Estados de UI _(nuevo)_

### 19.1 Los 5 estados que toda pantalla debe manejar

Toda pantalla con data remota debe contemplar explícitamente estos 5 estados:

```tsx
function MyScreen() {
  const { data, isLoading, isError, error } = useMyData();
  const isEmpty = data && data.length === 0;

  // 1. Loading
  if (isLoading) return <MyScreenSkeleton />;

  // 2. Error
  if (isError) return <ErrorState message={error.message} onRetry={refetch} />;

  // 3. Empty
  if (isEmpty) return <EmptyState ... />;

  // 4. Content (caso principal)
  return <MyScreenContent data={data} />;

  // 5. Stale (opcional): data vieja mientras se refresca en segundo plano
  // React Query lo maneja automáticamente; agregar indicador visual si la
  // actualización es crítica para la decisión del usuario.
}
```

### 19.2 Skeleton screens

Usar skeleton cuando la pantalla tiene estructura predecible que conviene mantener durante la carga:

```tsx
// MyScreenSkeleton.tsx — replica la estructura real, no un spinner genérico
function MyScreenSkeleton() {
  return (
    <View>
      <SkeletonBox width="60%" height={32} radius={8} />   {/* título */}
      <SkeletonBox width="100%" height={120} radius={20} style={{ marginTop: 16 }} /> {/* card hero */}
      <SkeletonBox width="100%" height={60} radius={14} style={{ marginTop: 12 }} />
      <SkeletonBox width="100%" height={60} radius={14} style={{ marginTop: 8 }} />
    </View>
  );
}
```

Reglas:
- El skeleton debe aproximar el layout real, no ser un spinner centrado.
- No usar skeleton para acciones; solo para content inicial.
- No pulsar/animar el skeleton si `reduced motion` está activo.

### 19.3 Error states

```tsx
// Componente ErrorState reutilizable
function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <Icon name="alert-circle" size={40} color={colors.danger} />
      <Text style={styles.title}>Algo salió mal</Text>
      <Text style={styles.description}>
        {message ?? 'No pudimos cargar la información. Revisá tu conexión.'}
      </Text>
      <AppButton variant="secondary" onPress={onRetry}>
        Intentar de nuevo
      </AppButton>
    </View>
  );
}
```

Reglas:
- Siempre incluir botón de reintento.
- El mensaje de error debe ser en lenguaje del usuario, no el error técnico raw.
- Errores de red y errores de datos deben tener mensajes distintos.

### 19.4 Optimistic updates

Para acciones frecuentes (marcar gasto, togglear categoría), usar optimistic update para respuesta inmediata:

```ts
useMutation({
  mutationFn: markExpenseAsPaid,
  onMutate: async (expenseId) => {
    await queryClient.cancelQueries({ queryKey: expenseKeys.list() });
    const previous = queryClient.getQueryData(expenseKeys.list());
    queryClient.setQueryData(expenseKeys.list(), (old) =>
      old.map(e => e.id === expenseId ? { ...e, paid: true } : e)
    );
    return { previous };
  },
  onError: (err, _, context) => {
    queryClient.setQueryData(expenseKeys.list(), context.previous);
    triggerHaptic('error');
  },
  onSuccess: () => {
    triggerHaptic('success');
  },
});
```

---

## 20. Micro-interacciones _(nuevo)_

### 20.1 Press feedback con Reanimated

```tsx
// Hook reutilizable para press scale
function usePressScale(toScale = 0.96) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(scale.value, { damping: 15, stiffness: 300 }) }],
  }));

  const handlers = {
    onPressIn: () => { scale.value = toScale; },
    onPressOut: () => { scale.value = 1; },
  };

  return { animatedStyle, handlers };
}

// Uso
function MyButton({ onPress, children }) {
  const { animatedStyle, handlers } = usePressScale();

  return (
    <Animated.View style={animatedStyle}>
      <Pressable {...handlers} onPress={onPress}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
```

### 20.2 Entrada de pantalla

```tsx
// Entrada de contenido con fade + slide suave
function ScreenContent({ children }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 220 });
    translateY.value = withTiming(0, { duration: 220 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
```

### 20.3 Número que cambia (valor financiero dinámico)

```tsx
// Cuando un valor financiero cambia, animar el texto para comunicar cambio
// Nota: No existe un componente AnimatedText en el proyecto; usar Animated.Text
// con un valor derivado formateado en JS thread vía runOnJS (ver memory sobre
// restricciones de Intl/locale en worklets).
function AnimatedAmount({ value }: { value: number }) {
  const animatedValue = useSharedValue(value);

  useEffect(() => {
    animatedValue.value = withTiming(value, { duration: 300 });
  }, [value]);

  // Formatear FUERA del worklet para evitar crash de Intl en Reanimated runtime
  const [displayText, setDisplayText] = useState(`$${Math.round(value).toLocaleString('es-AR')}`);
  const updateText = useCallback((v: number) => {
    setDisplayText(`$${Math.round(v).toLocaleString('es-AR')}`);
  }, []);

  useAnimatedReaction(
    () => animatedValue.value,
    (v) => runOnJS(updateText)(v),
  );

  return <Animated.Text style={styles.amount}>{displayText}</Animated.Text>;
}
```

### 20.4 Swipe action en lista

```tsx
// Patrón con react-native-gesture-handler para swipe to delete
// Usar el wrapper <SwipeableRow> de mobile/components/ui/swipeable-row.tsx
// Siempre: affordance visible + confirmación o undo
import { SwipeableRow, type SwipeAction } from '@/components/ui/swipeable-row'

const actions: SwipeAction[] = [
  { label: 'Eliminar', onPress: handleDelete, style: 'destructive' },
]

<SwipeableRow
  rightActions={actions}
  accessibilityHint="Deslizá para ver acciones"
  onSwipeOpenHaptic="warning"
>
  <MyListItem />
</SwipeableRow>
```

---

## 21. Checklist de pantalla nueva _(nuevo)_

Antes de dar por terminada una pantalla nueva o refactoreada, verificar:

### Estructura
- [ ] El route file en `app/` es delgado (solo params, providers, delega a screen).
- [ ] La screen no supera 300 líneas ni mezcla fetch + lógica + UI.
- [ ] La lógica de negocio vive en un `engine` puro o hook de feature.
- [ ] No hay llamadas directas a Supabase desde la screen o componentes.

### Estados de UI
- [ ] Estado `loading` con skeleton que replica el layout real.
- [ ] Estado `error` con mensaje en lenguaje de usuario y botón de reintento.
- [ ] Estado `empty` con contexto y acción orientadora.
- [ ] Estado `content` como caso principal.

### UX mobile
- [ ] Existe una única acción primaria clara.
- [ ] Todos los touch targets son ≥ 44×44 pt.
- [ ] La CTA primaria está en la zona cómoda del pulgar.
- [ ] Los inputs funcionan correctamente con teclado abierto.
- [ ] Los inputs tienen `keyboardType`, `returnKeyType` y `onSubmitEditing` correctos.
- [ ] Toda interacción tiene feedback visual inmediato (pressed state).
- [ ] Los haptics están mapeados según la tabla de la sección 9.6.

### Diseño y contenido
- [ ] Colores, spacing y radii vienen del theme, sin hardcodes.
- [ ] La tipografía sigue la jerarquía: protagonista → contexto → acción.
- [ ] Los textos pasan el filtro: "¿el usuario sabe qué hacer después de leer esto?".
- [ ] No hay métricas sin contexto ni acción.
- [ ] El registro visual es correcto: `Auth` o `App operativa`, no mezclados.

### Accesibilidad
- [ ] Elementos interactivos tienen `accessibilityRole` y `accessibilityLabel` si el texto visible no alcanza.
- [ ] El estado no se comunica solo con color.
- [ ] Las animaciones respetan `reduced motion`.
- [ ] Las safe areas están aplicadas correctamente.

### Performance
- [ ] Las listas usan `FlatList` con `keyExtractor` estable.
- [ ] No hay `console.log` en caminos de render.
- [ ] No hay `useEffect` para derivar data renderizable.

---

Si una decisión futura contradice este documento, la decisión debe justificarse explícitamente en la PR o issue correspondiente.

<!-- ✓ Sincronizado contra código el 2026-05-22 -->