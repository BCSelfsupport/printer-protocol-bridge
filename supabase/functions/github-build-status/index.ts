import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-license-key, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = await authorize(req);
  if (denied) return denied;

  try {

    const githubPat = Deno.env.get('GITHUB_PAT');
    if (!githubPat) {
      console.error('GITHUB_PAT not configured');
      return new Response(JSON.stringify({ error: 'Server configuration error: GITHUB_PAT not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const repo = 'BCSelfsupport/printer-protocol-bridge';

    // Fetch both production and dev workflow runs in parallel
    const [prodResponse, devResponse] = await Promise.all([
      fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/build-windows.yml/runs?per_page=5`,
        {
          headers: {
            'Authorization': `Bearer ${githubPat}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      ),
      fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/build-dev.yml/runs?per_page=5`,
        {
          headers: {
            'Authorization': `Bearer ${githubPat}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      ),
    ]);

    const mapRuns = (data: any) =>
      (data.workflow_runs || []).map((run: any) => ({
        id: run.id,
        run_number: run.run_number,
        status: run.status,
        conclusion: run.conclusion,
        created_at: run.created_at,
        updated_at: run.updated_at,
        head_branch: run.head_branch,
        actor: run.actor?.login || 'unknown',
        html_url: run.html_url,
      }));

    let prodRuns: any[] = [];
    let devRuns: any[] = [];

    if (prodResponse.ok) {
      prodRuns = mapRuns(await prodResponse.json());
    }
    if (devResponse.ok) {
      devRuns = mapRuns(await devResponse.json());
    }

    return new Response(JSON.stringify({ runs: prodRuns, devRuns }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Build status error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
