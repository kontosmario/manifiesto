let isAuthTransitionSplashVisible = false

export function showAuthTransitionSplash() {
  isAuthTransitionSplashVisible = true
}

export function hideAuthTransitionSplash() {
  isAuthTransitionSplashVisible = false
}

export function getIsAuthTransitionSplashVisible() {
  return isAuthTransitionSplashVisible
}
