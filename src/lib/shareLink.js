// Share links are entirely client-side: the homework text is gzip-compressed
// and base64url-encoded into the URL fragment (after '#'), which browsers
// never send to a server. Nothing is stored anywhere — opening the link just
// decodes the fragment locally. Answers are never included, only homework.

const PREFIX = 's='

function toBase64Url(bytes) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function buildShareLink(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()
  const encoded = toBase64Url(new Uint8Array(buffer))

  const url = new URL(window.location.href)
  url.hash = PREFIX + encoded
  return url.toString()
}

export async function readSharedHomework() {
  const hash = window.location.hash.slice(1)
  if (!hash.startsWith(PREFIX)) return null

  const bytes = fromBase64Url(hash.slice(PREFIX.length))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()
  return new TextDecoder().decode(buffer)
}
