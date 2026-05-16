// deno-lint-ignore-file no-explicit-any
import { authedContext } from '../_shared/auth.ts';
import { callAnthropic } from '../_shared/anthropic.ts';
import { logAiCall } from '../_shared/log.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { docToPlaintext } from '../_shared/tiptap.ts';

interface Body {
  page_id: string;
}

const SYSTEM = `the user is stuck on a task. you respond with EITHER one clarifying question OR one tiny action — never both.

rules:
- 40 words MAX. count them.
- pick the form that's more useful right now:
  - "question" when the task is vague or has hidden dependencies. ask the most specific question that would unblock them.
  - "action" when the task is clear enough but motivation is the blocker. give one concrete physical move that takes under 90 seconds.
- never both. one short response, one kind.
- no "you could…" "maybe try…" "have you considered…". direct.
- no motivation-speak ("you've got this!"). no apologies.

output format: { "response": string, "kind": "question" | "action" }`;

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
  const checklist = Array.isArray(props.checklist) ? props.checklist : [];
  const done = checklist.filter((c: any) => c.done).map((c: any) => c.text);
  const open = checklist.filter((c: any) => !c.done).map((c: any) => c.text);

  const prompt =
    `task: ${page.title || '(untitled)'}\n\n` +
    (plain ? `notes:\n${plain}\n\n` : '') +
    (done.length ? `already ticked:\n- ${done.join('\n- ')}\n\n` : '') +
    (open.length ? `still open:\n- ${open.join('\n- ')}\n` : '');

  try {
    const result = await callAnthropic<{ response: string; kind: string }>({
      system: SYSTEM,
      user: prompt,
      maxTokens: 150,
      jsonMode: true,
    });

    const response = typeof result.parsed?.response === 'string'
      ? result.parsed.response.trim().slice(0, 400)
      : '';
    const kind = result.parsed?.kind === 'action' ? 'action' : 'question';

    if (!response) throw new Error('empty response');

    await logAiCall({
      adminClient: ctx.adminClient,
      userId: ctx.userId,
      feature: 'stuck',
      pageId: page.id,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      succeeded: true,
    });

    return new Response(JSON.stringify({ response, kind }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAiCall({
      adminClient: ctx.adminClient,
      userId: ctx.userId,
      feature: 'stuck',
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
