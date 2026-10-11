/**
 * The only module that talks to an AI provider. Swap providers by changing this file.
 * Throws AiHttpError on non-2xx so the caller can back off on 429.
 */
export class AiHttpError extends Error {
  status: number
  constructor(status: number, msg: string) {
    super(msg)
    this.status = status
  }
}

export function providerConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY && process.env.AI_MOCK !== '1'
}

export async function generateJsonText(prompt: string, timeoutMs: number): Promise<string> {
  const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 2048 },
      }),
    })
    if (!res.ok) throw new AiHttpError(res.status, `AI HTTP ${res.status}`)
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!text) throw new Error('Empty AI response')
    return text
  } finally {
    clearTimeout(timer)
  }
}
