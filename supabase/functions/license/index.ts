import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function generateKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segments = 4;
  const segLen = 5;
  const parts: string[] = [];
  for (let s = 0; s < segments; s++) {
    let seg = "";
    for (let i = 0; i < segLen; i++) {
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    parts.push(seg);
  }
  return parts.join("-");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ── ACTIVATE: client sends product_key + machine_id ──
    if (action === "activate") {
      const { product_key, machine_id } = await req.json();
      if (!product_key || !machine_id) {
        return new Response(
          JSON.stringify({ error: "product_key and machine_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: license, error: licErr } = await supabaseAdmin
        .from("licenses")
        .select("*")
        .eq("product_key", product_key)
        .maybeSingle();

      if (licErr || !license) {
        return new Response(
          JSON.stringify({ error: "Invalid product key" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!license.is_active) {
        return new Response(
          JSON.stringify({ error: "License has been deactivated" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (license.expires_at && new Date(license.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "License has expired" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Deactivate any previous sessions
      await supabaseAdmin
        .from("license_activations")
        .update({ is_current: false })
        .eq("license_id", license.id)
        .eq("is_current", true);

      // Create new activation
      await supabaseAdmin.from("license_activations").insert({
        license_id: license.id,
        machine_id,
        is_current: true,
      });

      return new Response(
        JSON.stringify({ tier: license.tier, license_id: license.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── VALIDATE: heartbeat from client ──
    if (action === "validate") {
      const { product_key, machine_id } = await req.json();

      const { data: license } = await supabaseAdmin
        .from("licenses")
        .select("id, tier, is_active, expires_at")
        .eq("product_key", product_key)
        .maybeSingle();

      if (!license || !license.is_active) {
        return new Response(
          JSON.stringify({ valid: false, error: "License invalid or deactivated" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (license.expires_at && new Date(license.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ valid: false, error: "License expired" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if this machine is the current active session
      const { data: activation } = await supabaseAdmin
        .from("license_activations")
        .select("*")
        .eq("license_id", license.id)
        .eq("machine_id", machine_id)
        .eq("is_current", true)
        .maybeSingle();

      if (!activation) {
        return new Response(
          JSON.stringify({ valid: false, error: "Session active on another device" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update last_seen
      await supabaseAdmin
        .from("license_activations")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", activation.id);

      return new Response(
        JSON.stringify({ valid: true, tier: license.tier }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ADMIN: create license (dev panel) ──
    if (action === "create") {
      const { tier, customer_name, customer_email, customer_company, expires_in_days } = await req.json();

      // Create or find customer
      let customerId: string | null = null;
      if (customer_email) {
        const { data: existing } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("email", customer_email)
          .maybeSingle();

        if (existing) {
          customerId = existing.id;
        } else {
          const { data: newCust } = await supabaseAdmin
            .from("customers")
            .insert({ name: customer_name || "", email: customer_email, company: customer_company || null })
            .select("id")
            .single();
          customerId = newCust?.id || null;
        }
      }

      const product_key = generateKey();
      const expiresAt = expires_in_days
        ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
        : null;
      const { data: license, error } = await supabaseAdmin
        .from("licenses")
        .insert({
          product_key,
          tier: tier || "lite",
          customer_id: customerId,
          expires_at: expiresAt,
        })
        .select("*")
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ license }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ADMIN: list licenses ──
    if (action === "list") {
      const { data: licenses } = await supabaseAdmin
        .from("licenses")
        .select("*, customers(*), license_activations(*)");

      return new Response(
        JSON.stringify({ licenses }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ADMIN: deactivate license ──
    if (action === "deactivate") {
      const { license_id } = await req.json();
      await supabaseAdmin
        .from("licenses")
        .update({ is_active: false })
        .eq("id", license_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ADMIN: delete license ──
    if (action === "delete") {
      const { license_id } = await req.json();

      // Delete activations first (FK constraint)
      await supabaseAdmin
        .from("license_activations")
        .delete()
        .eq("license_id", license_id);

      await supabaseAdmin
        .from("licenses")
        .delete()
        .eq("id", license_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
