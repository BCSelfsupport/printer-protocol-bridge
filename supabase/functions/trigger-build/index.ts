import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-license-key, x-admin-token',
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Authorize the request: either a valid active license key, OR the dev-portal admin token.
async function authorize(req: Request): Promise<Response | null> {
  const adminExpected = Deno.env.get("DEV_PORTAL_PASSWORD");
  const adminProvided = req.headers.get("x-admin-token") ?? "";
  if (adminExpected && adminProvided && adminExpected.length === adminProvided.length) {
    let mismatch = 0;
    for (let i = 0; i < adminExpected.length; i++) {
      mismatch |= adminExpected.charCodeAt(i) ^ adminProvided.charCodeAt(i);
    }
    if (mismatch === 0) return null;
  }
  const licenseKey = req.headers.get("x-license-key") ?? "";
  if (/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(licenseKey)) {
    const { data: license } = await supabaseAdmin
      .from("licenses")
      .select("is_active, expires_at")
      .eq("product_key", licenseKey)
      .maybeSingle();
    if (license && license.is_active && (!license.expires_at || new Date(license.expires_at) > new Date())) {
      return null;
    }
  }
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = await authorize(req);
  if (denied) return denied;

  try {

    const githubPat = Deno.env.get('GITHUB_PAT');
    if (!githubPat) {
      console.error('GITHUB_PAT not configured');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let target: 'production' | 'dev' = 'production';
    let workflow = 'build-windows.yml';
    let workflowRef = 'main';

    try {
      const body = await req.json();
      if (body?.branch === 'dev' || body?.target === 'dev') {
        target = 'dev';
        workflow = 'build-dev.yml';
        workflowRef = 'main';
      }
    } catch {
      // No body or invalid JSON — use defaults
    }

    const repo = 'BCSelfsupport/printer-protocol-bridge';

    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: workflowRef }),
      }
    );

    if (response.status === 204) {
      return new Response(JSON.stringify({ success: true, message: `${target === 'dev' ? 'Dev test' : 'Production'} build triggered from ${workflowRef}!` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const errorText = await response.text();
    console.error('GitHub API error:', response.status, errorText);
    return new Response(JSON.stringify({ error: 'Failed to trigger build' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Trigger build error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
