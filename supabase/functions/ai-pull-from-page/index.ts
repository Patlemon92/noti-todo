// deno-lint-ignore-file no-explicit-any
import { authedContext } from '../_shared/auth.ts';
import { callAnthropic } from '../_shared/anthropic.ts';
import { logAiCall } from '../_shared/log.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { docToPlaintext } from '../_shared/tiptap.ts';

interface Body {
  page_id: string;
}

const SYSTEM = `you read a note or document and pull out the actionable tasks hiding inside it.

how to think:
- only return tasks the author would clearly recognize as work-to-do.
- ignore observations, plans, references that aren't actions.
- titles are short, action-led: "send recap to anna", "test in preview env".
- "body_text" is empty unless there's a non-obvious detail worth carrying over.
- if nothing actionable is in the source, return { "tasks": [] }.
- never invent tasks that aren't in the text.

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

  if (!body.page_id || typeof body.page_id !== 'string') {
    return new Response(JSON.stringify({ error: 'page_id required' }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  // fetch the page using the user's client (RLS-protected)
  const { data: page, error: pageErr } = await ctx.userClient
    .from('pages')
    .select('id,title,body,body_text,properties,type')
    .eq('id', body.page_id)
    .maybeSingle();
  if (pageErr || !page) {
    return new Response(JSON.stringify({ error: 'page not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const plain = page.body_text || docToPlaintext(page.body) || '';
  const prompt = `title: ${page.title || '(untitled)'}\n\nbody:\n${plain || '(empty)'}`;

  try {
    const result = await callAnthropic<{ tasks: Array<any> }>({
      system: SYSTEM,
      user: prompt,
      maxTokens: 1500,
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
            source_page_id: page.id,
          }))
      : [];

    await logAiCall({
      adminClient: ctx.adminClient,
      userId: ctx.userId,
      feature: 'pull_from_page',
      pageId: page.id,
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
      feature: 'pull_from_page',
      pageId: page.id,
      succeeded: false,
      error: msg.slice(0, 500),
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
