// Client-side generation call.
//
// The browser NO LONGER holds any Azure credentials. It sends the prompt +
// a Turnstile token to our own Cloudflare Function at /api/generate, which
// holds the Azure key server-side and does the real work. See
// functions/api/generate.js and the README's "Deploying" section.

import { getTurnstileToken, turnstileConfigured } from './turnstile'

export function isConfigured() {
  // From the browser's point of view, all we can check is that the human-
  // verification site key is present. The Azure secrets live on the server
  // and are validated there.
  return turnstileConfigured()
}

export async function generateHomework(prompt) {
  if (!isConfigured()) {
    throw new Error(
      'Human verification is not configured. Set VITE_TURNSTILE_SITEKEY — see the README.'
    )
  }

  const turnstileToken = await getTurnstileToken()

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, turnstileToken }),
  })

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (data.error) message = data.error
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new Error(message)
  }

  const data = await res.json()
  return data.content
}
