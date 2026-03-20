import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { transcript, speaker } = await req.json();

  if (!transcript?.trim()) {
    return new Response(JSON.stringify({ error: 'Transcript is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = `You are a business English coach. Analyse this meeting transcript and find the 5 most impactful expression upgrades for the specified speaker.

Transcript:
"""
${transcript}
"""

${speaker?.trim() ? `Focus ONLY on lines spoken by: "${speaker.trim()}"` : 'Analyse the most active speaker in the transcript.'}

Return ONLY valid JSON, no markdown:
{
  "speaker": "exact name or label used in transcript",
  "level": "B1",
  "theme": "one short phrase — the main communication gap",
  "meeting": "short meeting title or topic inferred from transcript, or null if unclear",
  "expressions": [
    {
      "original": "exact weak phrase they used — must appear verbatim in the sentence",
      "sentence": "the complete original sentence copied verbatim from transcript — do NOT change a single word",
      "replacement": "the better phrase that replaces 'original' only — a short phrase, NOT the full sentence",
      "context": "2-4 word situation label",
      "tip": "advice in under 6 words"
    }
  ],
  "takeaway": "one memorable sentence for this speaker"
}

Rules:
- expressions must be exactly 5 items
- "original" must be a short phrase actually spoken by the target speaker
- "sentence" must be the EXACT verbatim sentence from the transcript — copy it character for character, no edits at all
- "replacement" is ONLY the improved phrase that replaces "original" — it is short, NOT the full sentence. Example: if original is "I think maybe we should", replacement is "I recommend we"
- ⚠️ "original", "sentence", "replacement" must ALWAYS be in the SAME language as the transcript — NEVER translate them, NEVER mix in Chinese
- "context" is a SHORT Chinese label for the situation, e.g. "汇报进展"、"提出建议"、"确认时间线"
- "tip" must be in Chinese, under 10 characters, e.g. "直接说结论"、"去掉犹豫词"
- "theme" must be in Chinese, e.g. "表达过于模糊，缺乏自信"
- "takeaway" must be in Chinese, one sentence
- "meeting" must be in Chinese if inferable, e.g. "功能上线延期讨论"，or null
- level is one of: B1 / B2 / C1`;

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-5@20250929',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
