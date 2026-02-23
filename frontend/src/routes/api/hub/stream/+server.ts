import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const { content, model, systemPrompt, history } = await request.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const messages = [
    ...(history ?? []).map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
    { role: 'user', content },
  ];

  const body: Record<string, unknown> = {
    model: model ?? 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages,
    stream: true,
  };

  // Only include system if non-empty
  if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
    body.system = systemPrompt;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      const status = response.status;
      return json(
        { error: `Claude API returned status ${status}` },
        { status },
      );
    }

    // Return the stream directly as SSE
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
};
