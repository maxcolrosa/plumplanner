// lib/ai/status-report.ts
import Anthropic from '@anthropic-ai/sdk'
import type { EngineTask } from '@/lib/engine/types'

let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic()
  return _client
}

const SYSTEM_PROMPT = `You are a project management assistant for a team scheduling app called Plum Planner.
Generate a concise status report in plain text with exactly these four sections:

## Overview
## Per-Resource Summary
## Risks
## Recommendations

Be specific and actionable. Use bullet points within sections. Keep the total under 400 words.`

interface ResourceSummary {
  resourceName: string
  fluidTasks: Array<{ name: string; duration_hours: number }>
  fixedTasks: Array<{ name: string; start_date: string; end_date: string }>
}

export function buildStatusReportPrompt(
  tasks: EngineTask[],
  resourceNames: Record<string, string>,
): string {
  const byResource: Record<string, ResourceSummary> = {}

  for (const task of tasks) {
    if (!task.resource_id) continue
    const name = resourceNames[task.resource_id] ?? 'Unknown'
    if (!byResource[task.resource_id]) {
      byResource[task.resource_id] = {
        resourceName: name,
        fluidTasks: [],
        fixedTasks: [],
      }
    }
    if (task.type === 'fluid') {
      byResource[task.resource_id].fluidTasks.push({
        name: task.name,
        duration_hours: task.duration_hours,
      })
    } else {
      byResource[task.resource_id].fixedTasks.push({
        name: task.name,
        start_date: task.start_date.toISOString().slice(0, 10),
        end_date: task.end_date.toISOString().slice(0, 10),
      })
    }
  }

  return JSON.stringify(Object.values(byResource), null, 2)
}

export async function streamStatusReport(
  tasks: EngineTask[],
  resourceNames: Record<string, string>,
): Promise<ReadableStream<Uint8Array>> {
  const userPrompt = buildStatusReportPrompt(tasks, resourceNames)
  const encoder = new TextEncoder()

  const stream = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    stream: true,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  })

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(event.delta.text))
        }
      }
      controller.close()
    },
  })
}
