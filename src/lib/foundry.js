// Azure AI Foundry / Azure OpenAI client
//
// Endpoint detection:
//   *.services.ai.azure.com  → new Foundry inference API
//   *.openai.azure.com        → classic Azure OpenAI
//   *.cognitiveservices.azure.com → Cognitive Services gateway (same as openai.azure.com path)

const ENDPOINT = import.meta.env.VITE_FOUNDRY_ENDPOINT
const API_KEY  = import.meta.env.VITE_FOUNDRY_API_KEY
const MODEL    = import.meta.env.VITE_FOUNDRY_DEPLOYMENT

export function isConfigured() {
  return !!(ENDPOINT && API_KEY && MODEL)
}

function buildRequest(endpoint, model) {
  // Strip any portal path suffix like /api/projects/my-project — only the
  // scheme + host (+ optional port) is used for inference requests.
  const { origin, hostname } = new URL(endpoint)
  const base = origin  // e.g. https://homework-creator-resource.services.ai.azure.com

  if (hostname.includes('.services.ai.azure.com')) {
    // New Azure AI Foundry (ai.azure.com projects)
    const url = `${base}/models/chat/completions?api-version=2024-05-01-preview`
    return { url, modelInBody: true }
  }

  // Classic Azure OpenAI or Cognitive Services gateway
  const url = `${base}/openai/deployments/${model}/chat/completions?api-version=2024-10-21`
  return { url, modelInBody: false }
}

export async function generateHomework(prompt) {
  if (!isConfigured()) {
    throw new Error('Azure AI Foundry is not configured. See .env.example for setup instructions.')
  }

  const { url, modelInBody } = buildRequest(ENDPOINT, MODEL)

  const body = {
    messages: [
      {
        role: 'system',
        content: "You are a creative, energetic homework designer for children. You write fun, engaging exercises tailored to each child's interests and grade level. Always respond with clean markdown.",
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.8,
    max_tokens: 2500,
    ...(modelInBody ? { model: MODEL } : {}),
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': API_KEY,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    // Include the URL (minus the key) so it's easy to debug
    throw new Error(
      `API error ${res.status} calling:\n${url}\n\n${errText}`
    )
  }

  const data = await res.json()
  return data.choices[0].message.content
}
