const SEEN_KEY = 'stack-monitor:intro-seen'

// The intro plays once per window: a reload while developing doesn't play it again.
export function introSeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markIntroSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Private windows can refuse storage; the intro just plays again next load.
  }
}
