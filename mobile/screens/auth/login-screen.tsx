import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { RequireGuest } from '@/components/guards'
import { LoginHero } from '@/components/auth/login-hero'
import { LoginPanel } from '@/components/auth/login-panel'
import { useLoginController } from '@/features/auth/use-login-controller'
import { authPalette } from '@/theme/auth-theme'

export function LoginScreen() {
  const router = useRouter()
  const controller = useLoginController()
  const {
    actions,
    animation,
    biometricState,
    containerMinHeight,
    contentGap,
    displayName,
    email,
    errorMessage,
    helperCopy,
    infoMessage,
    isBusy,
    isCompact,
    isKeyboardVisible,
    isReducedMotionEnabled,
    keyboardHeight,
    mode,
    nameInputRef,
    panelGap,
    panelPadding,
    panelWidth,
    password,
    passwordInputRef,
    scrollBottomPadding,
    scrollTopPadding,
    useReferenceSignInLayout,
    emailInputRef,
  } = controller
  const {
    heroOpacity,
    heroScale,
    heroTranslateY,
    keyboardShift,
    modeContentOpacity,
    modeContentTranslateY,
    panelOpacity,
    panelTranslateY,
  } = animation

  return (
    <RequireGuest allowFamilylessSession>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <StatusBar style="light" />

        <TouchableWithoutFeedback accessible={false} onPress={actions.dismissKeyboard}>
          <View style={styles.root}>
            <LinearGradient
              colors={authPalette.canvas.gradient}
              end={{ x: 0.86, y: 1 }}
              start={{ x: 0.12, y: 0.02 }}
              style={StyleSheet.absoluteFillObject}
            />

            <View
              onLayout={(event) => {
                actions.handleViewportLayout(event.nativeEvent.layout.height)
              }}
              style={styles.flex}
            >
              <ScrollView
                alwaysBounceVertical={isKeyboardVisible}
                automaticallyAdjustKeyboardInsets={false}
                bounces={isKeyboardVisible}
                contentContainerStyle={[
                  styles.scrollContent,
                  {
                    minHeight: containerMinHeight,
                    paddingBottom: scrollBottomPadding + (isKeyboardVisible ? keyboardHeight : 0),
                    paddingTop: scrollTopPadding,
                  },
                ]}
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={isKeyboardVisible}
                showsVerticalScrollIndicator={false}
              >
                <Animated.View
                  style={[
                    styles.content,
                    {
                      gap: contentGap,
                      transform: [{ translateY: keyboardShift }],
                    },
                  ]}
                >
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.heroWrap,
                      {
                        opacity: heroOpacity,
                        transform: [{ translateY: heroTranslateY }, { scale: heroScale }],
                      },
                    ]}
                  >
                    <LoginHero
                      compact={isCompact}
                      dense={useReferenceSignInLayout}
                      reducedMotion={isReducedMotionEnabled}
                    />
                  </Animated.View>

                  <Animated.View
                    style={[
                      styles.panelShadowWrap,
                      {
                        opacity: panelOpacity,
                        transform: [{ translateY: panelTranslateY }],
                      },
                    ]}
                  >
                    <LoginPanel
                      biometricState={biometricState}
                      displayName={displayName}
                      email={email}
                      emailInputRef={emailInputRef}
                      errorMessage={errorMessage}
                      helperCopy={helperCopy}
                      infoMessage={infoMessage}
                      isBusy={isBusy}
                      isReducedMotionEnabled={isReducedMotionEnabled}
                      mode={mode}
                      modeContentOpacity={modeContentOpacity}
                      modeContentTranslateY={modeContentTranslateY}
                      nameInputRef={nameInputRef}
                      onBiometricSignIn={() => {
                        void actions.handleBiometricSignIn()
                      }}
                      onDevSpikePress={() => {
                        router.push('/(auth)/filament-spike')
                      }}
                      onFieldBlur={actions.handleFieldBlur}
                      onFieldFocus={actions.handleFieldFocus}
                      onPasswordChange={actions.setPassword}
                      onPasswordSubmit={() => {
                        void actions.handleSubmit()
                      }}
                      onSubmit={() => {
                        void actions.handleSubmit()
                      }}
                      onUpdateDisplayName={actions.setDisplayName}
                      onUpdateEmail={actions.setEmail}
                      onUpdateMode={actions.updateMode}
                      panelGap={panelGap}
                      panelPadding={panelPadding}
                      panelWidth={panelWidth}
                      password={password}
                      passwordInputRef={passwordInputRef}
                      useReferenceSignInLayout={useReferenceSignInLayout}
                    />
                  </Animated.View>
                </Animated.View>
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </SafeAreaView>
    </RequireGuest>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: authPalette.canvas.background,
  },
  root: {
    flex: 1,
    backgroundColor: authPalette.canvas.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  heroWrap: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 0,
  },
  panelShadowWrap: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 6,
  },
})
