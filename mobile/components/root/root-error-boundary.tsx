import { Component, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import i18n from '@/lib/i18n'

interface RootErrorBoundaryProps {
  children: ReactNode
}

interface RootErrorBoundaryState {
  error: Error | null
}

/**
 * Top-level safety net. Any uncaught render-time error bubbles up to
 * this boundary instead of showing a white screen. Recovery is a hard
 * reset of the boundary's state — user-initiated so we can retry
 * rendering with the same caches.
 */
export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    if (__DEV__) {
      console.error('[RootErrorBoundary] uncaught render error', error)
    }
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.root}>
          <Text style={styles.title}>{i18n.t('states:errorBoundary.title')}</Text>
          <Text style={styles.body}>
            {i18n.t('states:errorBoundary.body')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.t('states:errorBoundary.retry')}
            onPress={this.handleReset}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>{i18n.t('states:errorBoundary.retry')}</Text>
          </Pressable>
        </View>
      )
    }
    return this.props.children
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDFCF9',
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#0F2A1E' },
  body: { fontSize: 14, color: '#48584E', textAlign: 'center', lineHeight: 20 },
  cta: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#0F2A1E',
  },
  ctaText: { color: '#F6FBEF', fontWeight: '700', fontSize: 14 },
})
