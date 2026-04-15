import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
