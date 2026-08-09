// Cloudflare Turnstile — invisible "prove you're human" check.
//
// The site key is PUBLIC by design (unlike the secret, which lives only in the
// Function), so it's fine to ship via a VITE_ env var. Each generate request
// gets a fresh, single-use token that the Function verifies server-side.
//
// We render one hidden widget in "execute" mode and trigger it on demand,
// resolving a promise with the token via Turnstile's callback.

const SITEKEY = import.meta.env.VITE_TURNSTILE_SITEKEY

let widgetId = null
let pending = null // { resolve, reject } for the in-flight execute()

export function turnstileConfigured() {
  return !!SITEKEY
}

function ensureWidget() {
  if (widgetId !== null) return
  if (!window.turnstile) throw new Error('Turnstile script not loaded')

  // Kept in normal layout (not display:none) so Turnstile can actually
  // measure and render its iframe into it — display:none takes it out of
  // the render tree entirely and the widget silently never mounts.
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.top = '-9999px'
  document.body.appendChild(container)

  widgetId = window.turnstile.render(container, {
    sitekey: SITEKEY,
    execution: 'execute',
    callback: token => {
      if (pending) { pending.resolve(token); pending = null }
    },
    'error-callback': () => {
      if (pending) { pending.reject(new Error('Verification failed')); pending = null }
      return true // suppress Turnstile's own error UI
    },
  })
}

// Returns a fresh single-use token, or throws if verification can't run.
export function getTurnstileToken() {
  if (!SITEKEY) return Promise.reject(new Error('Turnstile not configured'))
  return new Promise((resolve, reject) => {
    try {
      ensureWidget()
      pending = { resolve, reject }
      window.turnstile.reset(widgetId) // clear any prior token
      window.turnstile.execute(widgetId)
    } catch (err) {
      pending = null
      reject(err)
    }
  })
}
