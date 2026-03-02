import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * One-time migration helper: copies fault-code images from the public web URL
 * into the private "proprietary-assets" storage bucket.
 * 
 * Requires x-api-key header matching DEV_PORTAL_PASSWORD for security.
 * 
 * POST body: { "files": ["01-0002.png", "01-0003.png", ...], "folder": "fault-codes" }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require dev portal password
    const apiKey = req.headers.get("x-api-key");
    const devPassword = Deno.env.get("DEV_PORTAL_PASSWORD");
    if (!apiKey || !devPassword || apiKey.toUpperCase() !== devPassword.toUpperCase()) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { files, folder = "fault-codes", sourceBaseUrl } = await req.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: "files array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Use the published app URL as source, or allow override
    const baseUrl = sourceBaseUrl || "https://bestcode-codesync.lovable.app";
    
    const results: { file: string; status: "ok" | "error"; error?: string }[] = [];

    for (const fileName of files) {
      try {
        // Fetch from public URL
        const response = await fetch(`${baseUrl}/${folder}/${fileName}`);
        if (!response.ok) {
          results.push({ file: fileName, status: "error", error: `HTTP ${response.status}` });
          continue;
        }

        const blob = await response.blob();
        
        // Upload to private bucket
        const storagePath = `${folder}/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("proprietary-assets")
          .upload(storagePath, blob, {
            contentType: response.headers.get("content-type") || "application/octet-stream",
            upsert: true,
          });

        if (uploadError) {
          results.push({ file: fileName, status: "error", error: uploadError.message });
        } else {
          results.push({ file: fileName, status: "ok" });
        }
      } catch (err) {
        results.push({ file: fileName, status: "error", error: String(err) });
      }
    }

    const succeeded = results.filter(r => r.status === "ok").length;
    const failed = results.filter(r => r.status === "error").length;

    return new Response(
      JSON.stringify({ succeeded, failed, total: files.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("migrate-assets error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
