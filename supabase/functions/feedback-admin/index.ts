import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'list';

    if (action === 'list') {
      const { data, error } = await supabaseAdmin
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Generate signed URLs for screenshots
      for (const item of data || []) {
        if (item.screenshot_urls?.length) {
          const signedUrls: string[] = [];
          for (const path of item.screenshot_urls) {
            const { data: signedData } = await supabaseAdmin.storage
              .from('feedback-screenshots')
              .createSignedUrl(path, 3600);
            if (signedData?.signedUrl) signedUrls.push(signedData.signedUrl);
          }
          item.signed_screenshot_urls = signedUrls;
        }
      }

      return new Response(JSON.stringify({ feedback: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      const { id } = await req.json();
      if (!id) throw new Error('Missing feedback id');

      // Get the feedback to delete screenshots
      const { data: fb } = await supabaseAdmin
        .from('feedback')
        .select('screenshot_urls')
        .eq('id', id)
        .single();

      if (fb?.screenshot_urls?.length) {
        await supabaseAdmin.storage
          .from('feedback-screenshots')
          .remove(fb.screenshot_urls);
      }

      const { error } = await supabaseAdmin
        .from('feedback')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Feedback admin error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
