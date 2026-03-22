import OpenAI from 'openai';
import { NextRequest } from 'next/server';

const client = new OpenAI({
  apiKey: process.env.BIGMODEL_API_KEY,
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
});

export async function POST(req: NextRequest) {
  const { transcript, speaker, lang } = await req.json();
  const isZh = lang === 'zh';

  if (!transcript?.trim()) {
    return new Response(JSON.stringify({ error: 'Transcript is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = isZh
    ? `你是一位职场普通话沟通教练。你的任务是找出指定发言者在会议中最值得改进的 5 个中文表达。

会议记录：
"""
${transcript}
"""

${speaker?.trim() ? `只分析以下发言者的内容："${speaker.trim()}"` : '分析发言最多的主要发言者。'}

⚠️ 重要：只分析中文表达。如果记录中有英文，忽略英文部分，只找中文表达的改进点。

只返回合法 JSON，不要 markdown：
{
  "speaker": "记录中使用的确切姓名或标签",
  "theme": "一句话 — 该发言者主要的中文表达问题",
  "meeting": "从记录推断的会议主题，中文，无法判断则为 null",
  "expressions": [
    {
      "original": "发言者使用的原始中文表达 — 必须逐字出现在记录中",
      "sentence": "包含该表达的完整原句 — 逐字复制，不得修改任何字",
      "replacement": "替换 original 的更好中文表达 — 简短，不是整句话",
      "context": "2-4字的场景标签，如「汇报进展」",
      "tip": "10字以内的改进建议，如「少用模糊词，直说结论」"
    }
  ],
  "takeaway": "给该发言者最核心的一句建议"
}

规则：
- expressions 必须恰好 5 条
- "original" 必须是中文表达，逐字出现在记录中
- "replacement" 是替换 original 的简短表达，不是完整句子
- "sentence" 必须逐字复制原文，一个字都不能改
- "theme"、"context"、"tip"、"takeaway"、"meeting" 全部用中文`
    : `You are a business English coach. The transcript may be in English only, or a mix of Chinese and English (code-switching). Your job is to find the 5 most impactful English expression upgrades for the specified speaker.

Transcript:
"""
${transcript}
"""

${speaker?.trim() ? `Focus ONLY on lines spoken by: "${speaker.trim()}"` : 'Analyse the most active speaker in the transcript.'}

⚠️ CRITICAL: Only analyse ENGLISH phrases. Ignore any Chinese sentences entirely. Even if the transcript is mostly Chinese, find the English words/phrases the speaker used and suggest better alternatives.

Return ONLY valid JSON, no markdown:
{
  "speaker": "exact name or label used in transcript",
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
- "meeting" must be in Chinese if inferable, e.g. "功能上线延期讨论"，or null`;

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
