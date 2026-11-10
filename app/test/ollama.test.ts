import { describe, expect, it } from 'vitest'
import { OLLAMA_CLOUD, ollamaAddress } from '../src/shared/ollama'

describe('the Ollama Cloud address', () => {
  it('turns any ollama.com address that lists no models into the one that does', () => {
    for (const raw of ['https://ollama.com', 'https://ollama.com/', 'https://ollama.com/api', 'https://www.ollama.com/v1', 'http://ollama.com/v1', ' https://OLLAMA.com/v2 '])
      expect(ollamaAddress(raw)).toBe(OLLAMA_CLOUD.baseURL)
  })

  it('leaves the right address and every other server alone', () => {
    expect(ollamaAddress('https://ollama.com/v1')).toBeNull()
    expect(ollamaAddress('https://ollama.com/v1/')).toBeNull()
    expect(ollamaAddress('http://127.0.0.1:11434/v1')).toBeNull()        // Ollama on this Mac
    expect(ollamaAddress('https://notollama.com/v1')).toBeNull()
    expect(ollamaAddress('ollama.com')).toBeNull()                       // not an address yet
  })
})
