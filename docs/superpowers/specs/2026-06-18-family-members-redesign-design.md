# Refactor "Gestión de familia" al estándar de Settings — Design

> Fecha: 2026-06-18 · Branch: `feature/member-management-redesign`

## Problema

`mobile/screens/settings/family-admin-screen.tsx` está desfasada del resto de las
sub-vistas de Settings:

- Back-button **custom** (pill 44×44) en vez del chevron estándar del `<Screen>`.
- Header crema (`creamCard`/`surfaceMuted`) en vez del hero **verde oscuro** (`heroGradient`).
- Tarjetas de integrante a medida con grilla de 4 métricas inline.
- Acciones (transferir / bloquear / desbloquear / eliminar) vía **`ActionSheetIOS` + `Alert` nativos** — no usa el sistema de sheets (`ModalCard`) de la app.

## Decisiones (acordadas con el owner)

1. Acciones por integrante → **sheet `ModalCard`** con detalle + acciones (no sub-pantalla).
2. Las métricas (gastos del mes, participación, racha, pagos fijos) → **dentro del sheet** (la lista queda con filas limpias).
3. Invitar integrante → **queda aparte** (sigue en el menú de Settings, no se suma acá).

## Diseño

### Pantalla (`family-admin-screen.tsx`, reescritura)

Scaffold estándar:
- `<Screen title="Gestión de familia" subtitle="Roles, bloqueos y transferencias" canGoBack backgroundColor={isDark ? DARK_TAB_CANVAS : undefined}>` → chevron nativo del `ScreenHeader` (se elimina el back-pill custom y `handleBack`).
- `backgroundSlot={<AmbientBlobs tone={isDark ? 'calm' : 'aurora'} />}`.
- Contenido (stack 20px pad / 22 gap del Screen), en bloques `RiseView`:
  - **Hero verde** (`LinearGradient` con `theme.colors.heroGradient`): eyebrow "FAMILIA" + conteo (`N integrantes`) + breakdown (`activos · bloqueado`). Texto con `heroText`/`heroAccent`/`heroMuted`.
  - **`SettingsGroup "Integrantes"`** → filas de integrante (owner + members), owner primero.
  - **`SettingsGroup "Bloqueados"`** → solo si hay bloqueados.
- Pull-to-refresh vía `refreshControl` (el `<Screen>` spreadea `ScrollViewProps`).

**`MemberRow`** (custom, replica el chrome de `SettingsRow` pero con avatar):
fila `flexDirection:'row'`, gap 12, padding 14/12, `minHeight:56`, divisor hairline salvo `isLast`. Avatar 40 (`AvatarAnimal` o `Avatar` fallback) + nombre + badge de rol (`Dueño`/`Bloqueado`; members sin badge) + chevron. Tap → abre el sheet.

### Sheet (`mobile/components/settings/sheets/member-action-sheet.tsx`, NUEVO)

`ModalCard` (drag-to-dismiss del sistema). Props: `member: FamilyMemberStats | null`, `isMe`, `onClose`, y runners `onTransfer/onBlock/onUnblock/onRemove: (m) => Promise<void>`. `visible = member != null`; cachea el último member para que el body sobreviva la animación de salida.

Dos estados internos:
- **Detalle** (default): identidad (avatar 48 + nombre + badge + "Integrante desde …") → **card de métricas 2×2** (gastos del mes · participación · racha · pagos fijos) → `SettingsGroup "Acciones"` con `SettingsRow`s:
  - member: Transferir propiedad (`swap-horiz`) · Bloquear (`block`) · Eliminar de la familia (`person-remove`, destructive).
  - blocked: Desbloquear (`lock-open`) · Eliminar de la familia (destructive).
  - isMe (dueño): sin acciones, nota "Sos el dueño de la familia.".
- **Confirmación inline** (NO apila modales → evita el gotcha de modal-chain de iOS): tocar una acción transiciona el MISMO sheet a un estado confirm (título via `ModalCard.title` + texto + `AppButton` Cancelar(ghost)/CTA(danger|primary) con `loading`). Éxito → `triggerHaptic('success')` + `onClose()` (la invalidación del parent refresca la lista). Error → texto de error in-sheet + `triggerHaptic('error')`.

### Capa de datos (sin cambios)

`use-family-admin.ts` (RPCs `family_transfer_ownership/block/unblock/remove`, `family_member_stats`) intacto. Solo se reemplazan los `Alert`/`ActionSheetIOS` de presentación por el sheet. El parent expone los runners llamando a `mutateAsync({ targetUserId })`.

### Tokens / componentes reutilizados

`Screen`, `ScreenHeader`, `SettingsGroup`, `SettingsRow`, `ModalCard`, `AppButton`, `RiseView`, `AmbientBlobs`, `AvatarAnimal`/`Avatar`, `LinearGradient`, paleta (`heroGradient`, `heroText`, `heroAccent`, `heroMuted`, `surfaceMuted`, `creamCard`, `line`, `primarySurface`, `danger`, `radii`, `spacing`), `triggerHaptic`, `getErrorMessage`.

## Validación

`npm run typecheck` + `eslint` + `npx expo export --platform ios` verdes. Manual: Settings → Familia → Gestionar integrantes; abrir un integrante, probar transferir/bloquear/desbloquear/eliminar (confirm inline), y el propio (solo stats).

## Archivos

- Modificar: `mobile/screens/settings/family-admin-screen.tsx` (reescritura).
- Crear: `mobile/components/settings/sheets/member-action-sheet.tsx`.
- Crear: `mobile/features/family/member-display.ts` (formatters compartidos).
- Sin tocar: `use-family-admin.ts`, las RPCs.

## Pulido + iteraciones finales (2026-06-19) — iOS feel

Pasada de pulido con la skill `ui-ux-pro-max` (confirmada en device). Cambios sobre el diseño base:

- **Spacing hero ↔ lista.** El wrapper del body del `<Screen>` (`Animated.View` con `bodyStyle`) **no trae `gap` propio** → los hijos quedaban pegados/encimados. Fix: `bodyStyle={{ gap: 24 }}` (tier de sección, rhythm de 8) → aire de "grouped list" de iOS. **Regla reusable:** un `<Screen>` con varios bloques de contenido necesita `bodyStyle` con `gap` (el `gap:22` de `styles.content` aplica entre header y body, NO entre los hijos).
- **Sheet centrado (iOS feel).** Todo el contenido del sheet va centrado: identidad tipo contact-card (avatar 64 + nombre + badge + alta), métricas en celdas centradas con `tabular-nums`, acciones como filas centradas icono+label (action-sheet feel) con el destructivo en rojo, y la confirmación tipo alert de iOS (icono en círculo tintado + título + body + botones, todo centrado).
- **Gotcha — botones del confirm parejos.** `AppButton` es `fullWidth` (`alignSelf:'stretch'`), que en un `flexDirection:'row'` estira en el eje **vertical**, no horizontal → quedaban al ancho del texto y pegados a la izquierda. Fix: envolver cada botón en una celda `flex:1` → 50/50, parejos (Cancelar izq · acción der, layout de alert de iOS).
- **Gotcha — salto del owner al cerrar.** El flag `isMe` se derivaba de `selected` en el parent, que pasa a `null` al cerrar → durante la animación de salida del `ModalCard`, `isMe` se volvía `false` mientras el sheet seguía mostrando el integrante **cacheado**, saltando de la nota de dueño (corta) a la card de acciones (alta). Fix: pasar `currentUserId` y derivar `isMe = m.userId === currentUserId` desde el integrante **cacheado** adentro del sheet. **Regla reusable:** cualquier flag que controle la ALTURA del contenido de un sheet con animación de salida debe derivarse del estado **cacheado** (el que sobrevive la salida), no de la prop que se limpia al cerrar — sino salta de altura durante el slide-down.
