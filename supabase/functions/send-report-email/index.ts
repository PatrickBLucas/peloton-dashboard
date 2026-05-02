// supabase/functions/send-report-email/index.ts
import { serve } from 'https://deno.land/x/sift@0.6.0/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SB_SERVICE_ROLE_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = authHeader.replace('Bearer ', '');

    // Get the user's Google OAuth token from Supabase
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the Google provider token from the session
    // The provider_token is passed from the client in the request body
    const body = await req.json();
    const { providerToken, pdfBase64, fileName, monthName, recipientEmail } = body;

    if (!providerToken) {
      return new Response(JSON.stringify({ error: 'Missing Google provider token. Please sign out and sign back in.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!pdfBase64 || !fileName || !monthName || !recipientEmail) {
      return new Response(JSON.stringify({ error: 'Missing required fields: pdfBase64, fileName, monthName, recipientEmail' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build the RFC 2822 email with PDF attachment
    const boundary = `boundary_${Date.now()}`;
    const emailBody = [
      `To: ${recipientEmail}`,
      `Subject: 10-8 Insurance Report - ${monthName}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      `Please find attached my 10-8 insurance exercise report for ${monthName}.`,
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="${fileName}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${fileName}"`,
      '',
      pdfBase64,
      '',
      `--${boundary}--`,
    ].join('\r\n');

    // Base64url encode the full email (Gmail API requirement)
    const encodedEmail = btoa(emailBody)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send via Gmail API
    const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${providerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedEmail }),
    });

    if (!gmailResponse.ok) {
      const gmailError = await gmailResponse.json();
      console.error('Gmail API error:', gmailError);

      // Token expired is the most common failure -- give a clear message
      if (gmailResponse.status === 401) {
        return new Response(JSON.stringify({ error: 'Google token expired. Please sign out and sign back in.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Gmail API error', detail: gmailError }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const gmailResult = await gmailResponse.json();
    return new Response(JSON.stringify({ success: true, messageId: gmailResult.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send-report-email error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});