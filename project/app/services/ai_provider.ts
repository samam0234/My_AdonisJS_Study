import Anthropic from '@anthropic-ai/sdk'
import env from '#start/env'

export type Part = { text?: string; inputTokens?: number; outputTokens?: number }

export async function* modelParts(
  system: string,
  prompt: string,
  signal: AbortSignal
): AsyncGenerator<Part> {
  const provider = env.get('AI_PROVIDER') ?? 'mock'
  if (provider === 'mock') {
    const { sources } = JSON.parse(prompt) as { sources: { text: string; number: number }[] }
    for (const source of sources) {
      yield { text: source.text.slice(0, 160) + ' (발췌 ' + source.number + ')\n' }
    }
    return
  }

  const model = env.get('AI_MODEL')
  if (!model) throw new Error('AI_MODEL is required')

  if (provider === 'anthropic') {
    const key = env.get('ANTHROPIC_API_KEY')
    if (!key) throw new Error('ANTHROPIC_API_KEY is required')
    const client = new Anthropic({ apiKey: key, maxRetries: 0 })
    const stream = client.messages.stream(
      {
        model,
        system,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal }
    )
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { text: event.delta.text }
      }
    }
    const result = await stream.finalMessage()
    yield { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens }
    return
  }

  const endpoint = new URL('/api/chat', env.get('OLLAMA_URL') ?? 'http://127.0.0.1:11434')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      options: { num_predict: 512 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
    signal,
  })
  if (!response.ok || !response.body) throw new Error('Ollama request failed')

  let pending = ''
  let completed = false
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      pending += value
      if (pending.length > 1_000_000) throw new Error('Ollama frame too large')
      const lines = pending.split('\n')
      pending = lines.pop()!
      for (const line of lines) {
        if (!line.trim()) continue
        const row = JSON.parse(line)
        if (row.error) throw new Error('Ollama stream failed')
        if (row.message?.content) yield { text: row.message.content }
        if (row.done) {
          completed = true
          yield { inputTokens: row.prompt_eval_count, outputTokens: row.eval_count }
        }
      }
    }
    if (!completed) throw new Error('Ollama stream ended early')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
