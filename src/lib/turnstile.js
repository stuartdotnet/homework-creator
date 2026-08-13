// Cloudflare Turnstile — "prove you're human" check.
//
// The site key is PUBLIC by design (unlike the secret, which lives only in the
// Function), so it's fine to ship via a VITE_ env var. Each generate request
// gets a fresh, single-use token that the Function verifies server-side.
//
// WIDGET MODE: this expects the widget to be configured as **Non-Interactive**
// in the Cloudflare dashboard. In "Managed" mode Turnstile may decide it needs
// a checkbox click, which hangs forever if the widget isn't reachable by the
// user. Non-Interactive shows a visible badge that always solves on its own.
//
// The widget renders VISIBLY into a container in the form (see App.jsx) and
// solves itself on page load, so a token is normally sitting ready by the time
// anyone presses Generate. We never call turnstile.execute() — tokens arrive
// via the callback, and we reset() after spending one to pre-fetch the next.

const SITEKEY = import.meta.env.VITE_TURNSTILE_SITEKEY

let widgetId = null
let currentToken = null   // freshest unspent token, or null while solving
let waiters = []          // [{ resolve, reject }] awaiting the next token

export function turnstileConfigured() {
  return !!SITEKEY
}

// Hand every queued caller the same outcome, then clear the queue.
function settleWaiters(err, token) {
  const queued = waiters
  waiters = []
  for (const w of queued) {
    if (err) w.reject(err)
    else w.resolve(token)
  }
}

// Ask Turnstile for a new token. In render mode (no `execution` option) a
// reset immediately re-runs the challenge, so this is all it takes.
function refresh() {
  currentToken = null
  if (widgetId !== null && window.turnstile) {
    window.turnstile.reset(widgetId)
  }
}

// Mount the visible widget into `container`. Safe to call more than once —
// only the first call renders. The Turnstile script is loaded `async defer`
// (index.html), so it may not be on `window` yet when React first mounts;
// we retry briefly rather than failing outright.
export function mountTurnstile(container) {
  if (widgetId !== null || !SITEKEY || !container) return

  if (!window.turnstile) {
    const retry = setInterval(() => {
      if (window.turnstile) {
        clearInterval(retry)
        mountTurnstile(container)
      }
    }, 100)
    setTimeout(() => clearInterval(retry), 10000)
    return
  }

  widgetId = window.turnstile.render(container, {
    sitekey: SITEKEY,

    callback: token => {
      currentToken = token
      settleWaiters(null, token)
    },

    // Every path below is terminal. Leaving any of them unwired is what let
    // the old implementation hang: the promise had no way to learn it had
    // lost, so it stayed pending and the spinner span forever.
    'error-callback': () => {
      settleWaiters(new Error('Human verification failed. Please reload the page.'))
      return true // suppress Turnstile's own error UI; we show our own
    },
    'timeout-callback': () => {
      settleWaiters(new Error('Human verification timed out. Please try again.'))
      refresh()
    },
    'expired-callback': () => {
      // Token went stale before it was spent — quietly fetch another.
      refresh()
    },
    'unsupported-callback': () => {
      settleWaiters(new Error('This browser cannot complete human verification.'))
      return true
    },
  })
}

// Returns a fresh single-use token. Resolves immediately in the common case,
// where the widget already solved during page load.
export function getTurnstileToken() {
  if (!SITEKEY) return Promise.reject(new Error('Turnstile not configured'))

  if (currentToken) {
    const token = currentToken
    refresh() // tokens are single-use — start solving the next one now
    return Promise.resolve(token)
  }

  return waitForToken()
}

// TODO(stuart): decide the wait policy — see the notes in the chat.
//
// Called only when Generate is pressed before a token is ready: the widget is
// still solving, or a previous attempt failed. Queue the caller by pushing
// { resolve, reject } onto `waiters` (settleWaiters drains it), and decide how
// long to wait before giving up and with what message.
function waitForToken() {
  return new Promise((resolve, reject) => {
    waiters.push({ resolve, reject })
    // ...
  })
}
