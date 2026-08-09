// Cloudflare Pages Function — POST /api/generate
//
// This is the ONLY place the Azure AI Foundry key lives. It runs on
// Cloudflare's edge (not in the browser), so the key is never shipped to
// visitors. The React app calls this endpoint instead of Azure directly.
//
// Lockdown layers (all must pass):
//   1. Method + content-type check
//   2. Same-origin check      (ALLOWED_ORIGIN)
//   3. Cloudflare Turnstile    (TURNSTILE_SECRET) — proves a real human
//   4. Per-IP rate limiting     (RATE_LIMIT KV)    — burst + daily caps
//   5. Input validation         — prompt must be a sane, bounded string
//   6. Server-fixed model params — client can't crank max_tokens/temperature
//
// Required bindings (set in the Cloudflare dashboard or via wrangler — see README):
//   Secrets:   FOUNDRY_ENDPOINT, FOUNDRY_API_KEY, FOUNDRY_DEPLOYMENT, TURNSTILE_SECRET
//   Vars:      ALLOWED_ORIGIN   (e.g. https://homework-creator.pages.dev)
//   KV:        RATE_LIMIT       (a KV namespace binding)

// ---- Tunable lockdown knobs -------------------------------------------------
const MAX_PROMPT_CHARS = 8000     // built prompt is ~3–4k; leaves headroom
const MIN_PROMPT_CHARS = 20
const BURST_MAX = 3               // requests allowed per BURST_WINDOW
const BURST_WINDOW_SECONDS = 60
const DAILY_MAX = 30              // requests allowed per IP per day
// -----------------------------------------------------------------------------

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export async function onRequestPost(context) {
  const { request, env } = context

  // --- Layer 1: content-type ---------------------------------------------
  const contentType = request.headers.get('Content-Type') || ''
  if (!contentType.includes('application/json')) {
    return json({ error: 'Expected application/json' }, 415)
  }

  // --- Layer 2: same-origin ----------------------------------------------
  if (env.ALLOWED_ORIGIN) {
    const origin = request.headers.get('Origin') || ''
    const referer = request.headers.get('Referer') || ''
    const ok = origin === env.ALLOWED_ORIGIN || referer.startsWith(env.ALLOWED_ORIGIN)
    if (!ok) return json({ error: 'Forbidden origin' }, 403)
  }

  // --- Parse body early (needed for validation + Turnstile token) --------
  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { prompt, turnstileToken } = payload || {}

  // --- Layer 3: Turnstile (human verification) ---------------------------
  const ip = request.headers.get('CF-Connecting-IP') || ''
  if (!env.TURNSTILE_SECRET) {
    return json({ error: 'Server not configured: TURNSTILE_SECRET missing' }, 500)
  }
  if (typeof turnstileToken !== 'string' || !turnstileToken) {
    return json({ error: 'Human verification failed' }, 403)
  }
  const human = await verifyTurnstile(env.TURNSTILE_SECRET, turnstileToken, ip)
  if (!human) {
    return json({ error: 'Human verification failed' }, 403)
  }

  // --- Layer 4: per-IP rate limiting -------------------------------------
  const limited = await checkRateLimit(env.RATE_LIMIT, ip)
  if (limited) {
    return json({ error: limited }, 429)
  }

  // --- Layer 5: input validation -----------------------------------------
  if (typeof prompt !== 'string') {
    return json({ error: 'prompt must be a string' }, 400)
  }
  const trimmed = prompt.trim()
  if (trimmed.length < MIN_PROMPT_CHARS || trimmed.length > MAX_PROMPT_CHARS) {
    return json({ error: 'prompt length out of bounds' }, 400)
  }

  // --- Config check -------------------------------------------------------
  if (!env.FOUNDRY_ENDPOINT || !env.FOUNDRY_API_KEY || !env.FOUNDRY_DEPLOYMENT) {
    return json({ error: 'Server not configured: Azure Foundry vars missing' }, 500)
  }

  // --- Call Azure (Layer 6: server fixes the model params) ---------------
  try {
    const content = await callFoundry(env, trimmed)
    return json({ content })
  } catch (err) {
    // Never leak the upstream key or full error to the client.
    return json({ error: 'Upstream generation failed' }, 502)
  }
}

// Verify the Turnstile token against Cloudflare's siteverify endpoint.
async function verifyTurnstile(secret, token, ip) {
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)

  const resp = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body: form }
  )
  const data = await resp.json().catch(() => ({}))
  return data.success === true
}

// Best-effort per-IP rate limiting using two KV windows (burst + daily).
// Returns null if allowed, or an error message string if the request should
// be rejected. KV is eventually consistent, so this is an abuse-mitigation
// layer, not a hard financial guarantee — pair with Azure spend caps + WAF.
async function checkRateLimit(kv, ip) {
  if (!kv || !ip) return null // no KV bound → skip (documented in README)
  const now = Math.floor(Date.now() / 1000)

  const burstBucket = Math.floor(now / BURST_WINDOW_SECONDS)
  const burstKey = `burst:${ip}:${burstBucket}`
  const dayBucket = Math.floor(now / 86400)
  const dayKey = `day:${ip}:${dayBucket}`

  const [burstCount, dayCount] = await Promise.all([
    kv.get(burstKey).then(v => parseInt(v || '0', 10)),
    kv.get(dayKey).then(v => parseInt(v || '0', 10)),
  ])

  if (burstCount >= BURST_MAX) return 'Too many requests — slow down a moment.'
  if (dayCount >= DAILY_MAX) return 'Daily limit reached. Try again tomorrow.'

  await Promise.all([
    kv.put(burstKey, String(burstCount + 1), { expirationTtl: BURST_WINDOW_SECONDS * 2 }),
    kv.put(dayKey, String(dayCount + 1), { expirationTtl: 90000 }), // ~25h
  ])
  return null
}

// Build + send the Azure AI Foundry / Azure OpenAI chat request.
// The system prompt and generation params are fixed here, server-side.
async function callFoundry(env, userPrompt) {
  const { origin, hostname } = new URL(env.FOUNDRY_ENDPOINT)
  const model = env.FOUNDRY_DEPLOYMENT

  let url
  let modelInBody
  if (hostname.includes('.services.ai.azure.com')) {
    url = `${origin}/models/chat/completions?api-version=2024-05-01-preview`
    modelInBody = true
  } else {
    url = `${origin}/openai/deployments/${model}/chat/completions?api-version=2024-10-21`
    modelInBody = false
  }

  const body = {
    messages: [
      {
        role: 'system',
        content:
          "You are a creative, energetic homework designer for children. You write fun, engaging exercises tailored to each child's interests and grade level. Always respond with clean markdown.",
      },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: 2500,
    ...(modelInBody ? { model } : {}),
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.FOUNDRY_API_KEY,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Azure error ${res.status}`)
  }
  const data = await res.json()
  return data.choices[0].message.content
}
