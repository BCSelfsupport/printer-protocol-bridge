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

function generatePairingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
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

      // Deactivate any previous sessions (single device only)
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

    // ── GENERATE PAIRING CODE: PC requests a code to display as QR ──
    if (action === "generate-pair-code") {
      const { product_key, machine_id } = await req.json();
      if (!product_key || !machine_id) {
        return new Response(
          JSON.stringify({ error: "product_key and machine_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate the license is active on this machine
      const { data: license } = await supabaseAdmin
        .from("licenses")
        .select("id, tier, is_active, expires_at")
        .eq("product_key", product_key)
        .maybeSingle();

      if (!license || !license.is_active) {
        return new Response(
          JSON.stringify({ error: "License invalid or inactive" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: activation } = await supabaseAdmin
        .from("license_activations")
        .select("id")
        .eq("license_id", license.id)
        .eq("machine_id", machine_id)
        .eq("is_current", true)
        .maybeSingle();

      if (!activation) {
        return new Response(
          JSON.stringify({ error: "License not active on this device" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Invalidate any existing pending codes for this license
      await supabaseAdmin
        .from("companion_sessions")
        .update({ status: "expired" })
        .eq("license_id", license.id)
        .eq("status", "pending");

      // Generate a 6-char pairing code, valid for 5 minutes
      const pairingCode = generatePairingCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const body = await req.json().catch(() => ({}));
      const printerConfig = body.printer_config || null;

      await supabaseAdmin.from("companion_sessions").insert({
        license_id: license.id,
        pairing_code: pairingCode,
        status: "pending",
        expires_at: expiresAt,
        printer_config: printerConfig,
      });

      return new Response(
        JSON.stringify({ pairing_code: pairingCode, expires_at: expiresAt }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── PAIR COMPANION: mobile sends pairing code + its machine_id ──
    if (action === "pair-companion") {
      const { pairing_code, machine_id } = await req.json();
      if (!pairing_code || !machine_id) {
        return new Response(
          JSON.stringify({ error: "pairing_code and machine_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: session } = await supabaseAdmin
        .from("companion_sessions")
        .select("*, licenses(tier, is_active, expires_at)")
        .eq("pairing_code", pairing_code.toUpperCase())
        .eq("status", "pending")
        .maybeSingle();

      if (!session) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired pairing code" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (new Date(session.expires_at) < new Date()) {
        await supabaseAdmin
          .from("companion_sessions")
          .update({ status: "expired" })
          .eq("id", session.id);
        return new Response(
          JSON.stringify({ error: "Pairing code has expired" }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const license = session.licenses as any;
      if (!license || !license.is_active) {
        return new Response(
          JSON.stringify({ error: "Associated license is inactive" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark session as paired
      await supabaseAdmin
        .from("companion_sessions")
        .update({
          status: "active",
          companion_machine_id: machine_id,
          paired_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        })
        .eq("id", session.id);

      return new Response(
        JSON.stringify({
          tier: license.tier,
          session_id: session.id,
          companion: true,
          printer_config: session.printer_config || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── VALIDATE COMPANION: heartbeat from mobile companion ──
    if (action === "validate-companion") {
      const { session_id, machine_id } = await req.json();

      const { data: session } = await supabaseAdmin
        .from("companion_sessions")
        .select("*, licenses(tier, is_active, expires_at)")
        .eq("id", session_id)
        .eq("companion_machine_id", machine_id)
        .eq("status", "active")
        .maybeSingle();

      if (!session) {
        return new Response(
          JSON.stringify({ valid: false, error: "Companion session not found or revoked" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const license = session.licenses as any;
      if (!license || !license.is_active) {
        return new Response(
          JSON.stringify({ valid: false, error: "Parent license deactivated" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (license.expires_at && new Date(license.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ valid: false, error: "Parent license expired" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update last_seen
      await supabaseAdmin
        .from("companion_sessions")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", session.id);

      return new Response(
        JSON.stringify({ valid: true, tier: license.tier }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ADMIN: create license (dev panel) ──
    if (action === "create") {
      const { tier, customer_name, customer_email, customer_company, expires_in_days } = await req.json();

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

      // Delete companion sessions first
      await supabaseAdmin
        .from("companion_sessions")
        .delete()
        .eq("license_id", license_id);

      // Delete activations (FK constraint)
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
    console.error('License function error:', err);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
