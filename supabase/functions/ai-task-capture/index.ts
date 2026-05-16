// deno-lint-ignore-file no-explicit-any
import { authedContext } from '../_shared/auth.ts';
import { callAnthropic } from '../_shared/anthropic.ts';
import { logAiCall } from '../_shared/log.ts';
import { corsHeaders } from '../_shared/cors.ts';

interface Body {
  text: string;
  default_board_id?: string | null;
}

const SYSTEM = `you turn a brain-dump into discrete task pages.

how to think:
- one concrete next-action per task. "buy oats" not "groceries".
- if the dump mixes contexts (work, personal, errands), split them.
- a task title is short, action-led: "reply to mum", "fix tax-code bug".
- the "body_text" field is optional context the user wrote that doesn't fit the title — keep it tiny, only when actually useful. otherwise empty string.
- if the user wrote something that's clearly a note, not a task (a thought, a quote), skip it.
- never invent details that aren't in the input.
- "suggested_board" is a one-word label like "work", "personal", "errands". optional.
- if the input is too vague to split, return a single task with the input as the title.

output format: { "tasks": [{ "title": string, "body_text": string, "suggested_board": string }] }`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let ctx;
  try {
    ctx = await authedContext(req);
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response(JSON.stringify({ error: 'auth failed' }), {
      status: 401,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad json' }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  if (!body.text || typeof body.text !== 'string' || body.text.length > 5000) {
    return new Response(JSON.stringify({ error: 'text must be a string under 5000 chars' }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  try {
    const result = await callAnthropic<{ tasks: Array<any> }>({
      system: SYSTEM,
      user: body.text,
      maxTokens: 1000,
      jsonMode: true,
    });

    const tasks = Array.isArray(result.parsed?.tasks)
      ? result.parsed.tasks
          .filter((t) => t && typeof t.title === 'string' && t.title.trim().length > 0)
          .map((t) => ({
            title: String(t.title).trim().slice(0, 200),
            body_text: typeof t.body_text === 'string' ? t.body_text.slice(0, 1000) : '',
            suggested_board:
              typeof t.suggested_board === 'string' ? t.suggested_board.slice(0, 40) : '',
          }))
      : [];

    await logAiCall({
      adminClient: ctx.adminClient,
      userId: ctx.userId,
      feature: 'task_capture',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      succeeded: true,
    });

    return new Response(JSON.stringify({ tasks }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAiCall({
      adminClient: ctx.adminClient,
      userId: ctx.userId,
      feature: 'task_capture',
      succeeded: false,
      error: msg.slice(0, 500),
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
