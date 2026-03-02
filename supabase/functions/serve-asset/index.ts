import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  bmp: "image/bmp",
  webp: "image/webp",
  bin: "application/octet-stream",
  BIN: "application/octet-stream",
  csv: "text/csv",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get("path");
    const productKey = url.searchParams.get("key");
    const machineId = url.searchParams.get("mid");

    if (!path) {
      return new Response(
        JSON.stringify({ error: "Missing path parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!productKey || !machineId) {
      return new Response(
        JSON.stringify({ error: "Missing license credentials" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate the license
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: license, error: licenseError } = await supabase
      .from("licenses")
      .select("id, is_active, tier, expires_at")
      .eq("product_key", productKey.toUpperCase())
      .single();

    if (licenseError || !license) {
      return new Response(
        JSON.stringify({ error: "Invalid license key" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!license.is_active) {
      return new Response(
        JSON.stringify({ error: "License is deactivated" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "License has expired" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate machine activation
    const { data: activation } = await supabase
      .from("license_activations")
      .select("id")
      .eq("license_id", license.id)
      .eq("machine_id", machineId)
      .eq("is_current", true)
      .single();

    if (!activation) {
      return new Response(
        JSON.stringify({ error: "License not activated on this machine" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize path to prevent directory traversal
    const sanitized = path.replace(/\.\./g, "").replace(/^\/+/, "");

    // Download from private storage bucket
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("proprietary-assets")
      .download(sanitized);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "Asset not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine content type from extension
    const ext = sanitized.split(".").pop()?.toLowerCase() || "";
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // Return the file with aggressive caching (assets rarely change)
    return new Response(fileData, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400", // 24 hours, private (not CDN-cached)
      },
    });
  } catch (err) {
    console.error("serve-asset error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
