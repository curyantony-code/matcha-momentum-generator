// Ollama's cloud models, through its OpenAI-compatible API. Only https://ollama.com/v1 answers like that: the bare
// host, /api (Ollama's own API), www. (a redirect, which never gets the key) or the Anthropic kind all list no models.

export const OLLAMA_CLOUD = {
  kind: 'openai' as const,
  baseURL: 'https://ollama.com/v1',
  label: 'Ollama Cloud',
  keyPage: 'ollama.com/settings/keys'
}

/** The working Ollama Cloud address when `raw` is any address on ollama.com that is not it, else null. */
export function ollamaAddress(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (!/^(www\.)?ollama\.com$/i.test(url.hostname)) return null
  return url.toString().replace(/\/+$/, '') === OLLAMA_CLOUD.baseURL ? null : OLLAMA_CLOUD.baseURL
}
