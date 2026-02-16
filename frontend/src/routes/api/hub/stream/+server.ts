import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const { sessionId, content, model, systemPrompt, history } = await request.json();

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

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model ?? 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: systemPrompt ?? '',
        messages,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      return json({ error: `API error: ${response.status} - ${errorText}` }, { status: response.status });
    }

    // Return the stream directly as SSE
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
};
