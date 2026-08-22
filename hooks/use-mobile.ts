import * as React from 'react'

const MOBILE_BREAKPOINT = 768

const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Reads the media query through useSyncExternalStore rather than seeding state
 * from inside an effect.
 *
 * The previous version called setIsMobile() synchronously in the effect body
 * purely to capture the initial value, which triggers a second render pass on
 * every mount (and is what react-hooks/set-state-in-effect flags). This
 * subscribes properly instead, and the server snapshot returns false so SSR
 * and the first client paint agree.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
