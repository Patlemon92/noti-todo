// deno-lint-ignore-file no-explicit-any
import { authedContext } from '../_shared/auth.ts';
import { callAnthropic } from '../_shared/anthropic.ts';
import { logAiCall } from '../_shared/log.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { docToPlaintext } from '../_shared/tiptap.ts';

interface Body {
  page_id: string;
}

const SYSTEM = `you break a task into 3–5 concrete starter steps.

rules:
- exactly 3, 4, or 5 steps. no fewer, no more.
- each step is under 10 minutes of work.
- action verb first ("open …", "draft …", "send …", "test …").
- step 1 is the absolute easiest entry — opening a file, drafting one sentence, finding a phone number. low friction.
- no filler ("get started", "think about it"). no meta ("decide what matters").
- be specific to the task as written. don't invent details.
- if the task is too vague to break down, return { "steps": ["clarify what this task actually is"] }.

output format: { "steps": [string, string, ...] }`;

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

  const { data: page, error: pageErr } = await ctx.userClient
    .from('pages')
    .select('id,title,body,body_text,properties')
    .eq('id', body.page_id)
    .maybeSingle();
  if (pageErr || !page) {
    return new Response(JSON.stringify({ error: 'page not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const plain = page.body_text || docToPlaintext(page.body) || '';
  const props = (page.properties as any) ?? {};
  const ticked = Array.isArray(props.checklist)
    ? props.checklist.filter((c: any) => c.done).map((c: any) => c.text)
    : [];

  const prompt =
    `task: ${page.title || '(untitled)'}\n\n` +
    (plain ? `context:\n${plain}\n\n` : '') +
    (ticked.length ? `already done in this session:\n- ${ticked.join('\n- ')}\n` : '');

  try {
    const result = await callAnthropic<{ steps: string[] }>({
      system: SYSTEM,
      user: prompt,
      maxTokens: 400,
      jsonMode: true,
    });

    const raw = Array.isArray(result.parsed?.steps) ? result.parsed.steps : [];
    const steps = raw
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .map((s) => String(s).trim().slice(0, 200))
      .slice(0, 5);

    await logAiCall({
      adminClient: ctx.adminClient,
      userId: ctx.userId,
      feature: 'break_down',
      pageId: page.id,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      succeeded: true,
    });

    return new Response(JSON.stringify({ steps }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAiCall({
      adminClient: ctx.adminClient,
      userId: ctx.userId,
      feature: 'break_down',
      pageId: body.page_id,
      succeeded: false,
      error: msg.slice(0, 500),
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
