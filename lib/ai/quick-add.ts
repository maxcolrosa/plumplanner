// lib/ai/quick-add.ts
import Anthropic from '@anthropic-ai/sdk'

export interface ParsedTask {
  name: string
  resource_id: string
  duration_hours: number
  type: 'fluid' | 'fixed'
  start_date: string | null
}

const client = new Anthropic()

export async function parseQuickAdd(
  text: string,
  resources: Array<{ id: string; name: string }>,
  today: string,
): Promise<ParsedTask | { error: string }> {
  const systemPrompt = `You are a scheduling assistant. Parse the user's task description into JSON.
Available resources: ${JSON.stringify(resources)}
Today's date: ${today}
Return ONLY valid JSON matching this shape exactly:
{ "name": string, "resource_id": string, "duration_hours": number, "type": "fluid" | "fixed", "start_date": "YYYY-MM-DD" | null }
start_date must be null for fluid tasks. start_date is required for fixed tasks.
If you cannot parse the input confidently, return { "error": "short reason" }.`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: text }],
  })

  const raw =
    message.content[0].type === 'text' ? message.content[0].text.trim() : ''

  try {
    const parsed = JSON.parse(raw)
    if ('error' in parsed) return { error: parsed.error }
    return parsed as ParsedTask
  } catch {
    return { error: 'Could not parse AI response' }
  }
}
