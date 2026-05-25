// deno-lint-ignore-file no-explicit-any
//
// Reads a photographed journal page from the `journal-snaps` storage bucket,
// asks Claude to extract dated items / loose to-dos / notes, runs the date
// sanity layer over the result, and writes everything back to the
// `journal_snaps` row.
//
// Idempotent: if the row already has `processed_at` set, returns the cached
// extraction without calling the model again.

import { authedContext } from '../_shared/auth.ts';
import { callAnthropic } from '../_shared/anthropic.ts';
import { logAiCall } from '../_shared/log.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { applyDateSanity, type ProcessedExtraction } from '../_shared/dateSanity.ts';

interface Body {
  snap_id?: string;
}

const SYSTEM = `you read a photographed page from a paper traveler's notebook and extract items.

the writer is patrick — sydney-based, lowercase, minimal punctuation, mixed cursive + print. proper nouns (people, businesses, accounting software like myob, eft) are often work-specific names you can't verify; set confidence low when uncertain rather than guessing.

extract three categories, each as a discrete item:
1. "reminder" — has a date, day name, time, or other explicit "when" ("1pm meeting", "thursday", "may 13th")
2. "task" — action-shaped to-do without an explicit when ("enter invoices into myob", "follow up travis")
3. "note" — informational, figures, references, prose without an action ("retail avg: $4.91", "overdraft")

when you see a date / day-of-week / month on the page, parse it into structured fields:
- day_name: "monday" .. "sunday", or null
- date_number: 1-31, or null
- month_name: full month name (e.g. "may"), or null
- year: 4-digit integer, or null
when you see a time like "1pm", "3:30", "9am", parse:
- raw_time_text: literal string from the page
- hour: 0-23 (24h)
- minute: 0-59

rules:
- never invent items not visible on the page. an empty/sparse page returns few or zero items.
- titles: short, verbatim-ish from the page. don't paraphrase wildly.
- if you can't read a word, leave "[unclear]" in raw_text and set confidence low.
- one date header on a page (e.g. "monday 23rd may") is the page header, NOT an item — apply that date to items below it that look dated.

output strict json. no markdown, no fences, no commentary. schema:

{
  "items": [
    {
      "title": "string (cleaned for display)",
      "category": "reminder" | "task" | "note",
      "raw_text": "exact text you read from the page",
      "day_name": "string or null",
      "date_number": number or null,
      "month_name": "string or null",
      "year": number or null,
      "raw_time_text": "string or null",
      "hour": number 0-23 or null,
      "minute": number 0-59 or null,
      "confidence": 0.0-1.0
    }
  ],
  "notes_blocks": [
    { "text": "string (preserve newlines as \\n)", "confidence": 0.0-1.0 }
  ]
}

confidence scale:
  0.9+ = clear print, unambiguous, no proper-noun guesswork
  0.6-0.9 = readable cursive, some uncertain words
  < 0.6 = significant guesswork — surface for user check`;

const USER_PROMPT = 'extract the items from this page using the schema. return only the json.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // -------- auth --------
  let ctx;
  try {
    ctx = await authedContext(req);
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonResponse({ error: 'auth failed' }, 401);
  }

  // -------- body --------
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'bad json' }, 400);
  }
  if (!body.snap_id || typeof body.snap_id !== 'string') {
    return jsonResponse({ error: 'snap_id required' }, 400);
  }

  // -------- load row, verify ownership --------
  const { data: snap, error: snapErr } = await ctx.adminClient
    .from('journal_snaps')
    .select('id, owner_id, photo_storage_path, processed_at, raw_extraction')
    .eq('id', body.snap_id)
    .maybeSingle();

  if (snapErr) return jsonResponse({ error: snapErr.message }, 500);
  if (!snap) return jsonResponse({ error: 'snap not found' }, 404);
  if (snap.owner_id !== ctx.userId) return jsonResponse({ error: 'forbidden' }, 403);

  // idempotent: serve cached
  if (snap.processed_at && snap.raw_extraction) {
    return jsonResponse({ extraction: snap.raw_extraction, cached: true });
  }

  // -------- signed url for the photo --------
  const { data: signed, error: signErr } = await ctx.adminClient.storage
    .from('journal-snaps')
    .createSignedUrl(snap.photo_storage_path, 60 * 10); // 10 min
  if (signErr || !signed) {
    return jsonResponse({ error: signErr?.message ?? 'failed to sign url' }, 500);
  }

  // -------- call claude vision --------
  try {
    const result = await callAnthropic<{ items?: unknown[]; notes_blocks?: unknown[] }>({
      system: SYSTEM,
      user: USER_PROMPT,
      images: [{ url: signed.signedUrl }],
      maxTokens: 2000,
      jsonMode: true,
    });

    const processed: ProcessedExtraction = applyDateSanity(result.parsed ?? {}, new Date());

    await ctx.adminClient
      .from('journal_snaps')
      .update({
        processed_at: new Date().toISOString(),
        raw_extraction: processed,
        error: null,
      })
      .eq('id', body.snap_id);

    await logAiCall({
      adminClient: ctx.adminClient,
      userId: ctx.userId,
      feature: 'extract_journal_snap',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      succeeded: true,
    });

    return jsonResponse({ extraction: processed, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    await ctx.adminClient
      .from('journal_snaps')
      .update({
        processed_at: new Date().toISOString(),
        error: msg.slice(0, 500),
      })
      .eq('id', body.snap_id);

    await logAiCall({
      adminClient: ctx.adminClient,
      userId: ctx.userId,
      feature: 'extract_journal_snap',
      succeeded: false,
      error: msg.slice(0, 500),
    });

    return jsonResponse({ error: msg }, 500);
  }
});

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
