import OpenAI from 'openai';
import { NextRequest } from 'next/server';

const client = new OpenAI({
  apiKey: process.env.BIGMODEL_API_KEY,
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
});

export async function POST(req: NextRequest) {
  const { transcript, speaker } = await req.json();

  if (!transcript?.trim()) {
    return new Response(JSON.stringify({ error: 'Transcript is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = `You are a business English coach. The transcript may be in English only, or a mix of Chinese and English (code-switching). Your job is to find the 5 most impactful English expression upgrades for the specified speaker.

Transcript:
"""
${transcript}
"""

${speaker?.trim() ? `Focus ONLY on lines spoken by: "${speaker.trim()}"` : 'Analyse the most active speaker in the transcript.'}

⚠️ CRITICAL: Only analyse ENGLISH phrases. Ignore any Chinese sentences entirely. Even if the transcript is mostly Chinese, find the English words/phrases the speaker used and suggest better alternatives.

Return ONLY valid JSON, no markdown:
{
  "speaker": "exact name or label used in transcript",
  "level": "B1",
  "theme": "one short phrase — the main English communication gap",
  "meeting": "short meeting title or topic inferred from transcript, or null if unclear",
  "expressions": [
    {
      "original": "exact weak ENGLISH phrase they used — must appear verbatim in the transcript",
      "sentence": "the complete original sentence copied verbatim from transcript — do NOT change a single word",
      "replacement": "the better ENGLISH phrase that replaces 'original' only — short, NOT the full sentence",
      "context": "2-4 word situation label",
      "tip": "advice in under 6 words"
    }
  ],
  "takeaway": "one memorable sentence for this speaker"
}

Rules:
- expressions must be exactly 5 items
- ⚠️ "original" must be an ENGLISH phrase — never Chinese
- ⚠️ "replacement" must be an ENGLISH phrase — never Chinese
- "sentence" must be the EXACT verbatim sentence from the transcript — copy it character for character, no edits at all. It may contain Chinese words if the speaker was code-switching.
- "replacement" is ONLY the improved phrase that replaces "original" — it is short, NOT the full sentence. Example: if original is "I think maybe we should", replacement is "I recommend we"
- "context" is a SHORT Chinese label for the situation, e.g. "汇报进展"、"提出建议"、"确认时间线"
- "tip" must be in Chinese, under 10 characters, e.g. "直接说结论"、"去掉犹豫词"
- "theme" must be in Chinese, e.g. "表达过于模糊，缺乏自信"
- "takeaway" must be in Chinese, one sentence
- "meeting" must be in Chinese if inferable, e.g. "功能上线延期讨论"，or null
- level is one of: B1 / B2 / C1`;

  const stream = await client.chat.completions.create({
    model: 'glm-4-flash',
    max_tokens: 1200,
    stream: true,
    messages: [{ role: 'user', content: prompt }],
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? '';
          if (text) controller.enqueue(encoder.encode(text));
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
