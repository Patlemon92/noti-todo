import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

interface LogInput {
  adminClient: SupabaseClient;
  userId: string;
  feature: string;
  pageId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  succeeded: boolean;
  error?: string | null;
}

export async function logAiCall(input: LogInput): Promise<void> {
  try {
    await input.adminClient.from('ai_calls').insert({
      user_id: input.userId,
      feature: input.feature,
      page_id: input.pageId ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      duration_ms: input.durationMs ?? null,
      succeeded: input.succeeded,
      error: input.error ?? null,
    });
  } catch (e) {
    // never let logging failures bubble up
    console.error('[log_ai_call]', e);
  }
}
