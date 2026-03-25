// supabase/functions/claude-proxy/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE_KEY    = Deno.env.get('SB_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SB_SERVICE_KEY);

Deno.serve(async (req) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verify the user is authenticated
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = await req.json();
    const { messages, max_tokens = 1000, system } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid request: messages array required', { status: 400 });
    }

    const requestBody: any = {
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      messages,
    };

    if (system) requestBody.system = system;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    return new Response(JSON.stringify({ text }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e: any) {
    console.error('Claude proxy error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});