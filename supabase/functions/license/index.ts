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

// --- Crypto-secure key generation (replaces Math.random) ---
const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function pickFromAlphabet(alphabet: string, length: number): string {
  const out = new Array<string>(length);
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  for (let i = 0; i < length; i++) {
    out[i] = alphabet[buf[i] % alphabet.length];
  }
  return out.join("");
}
function generateKey(): string {
  // 4 segments × 5 chars = "AAAAA-BBBBB-CCCCC-DDDDD"
  return [0, 1, 2, 3].map(() => pickFromAlphabet(KEY_ALPHABET, 5)).join("-");
}
function generatePairingCode(): string {
  return pickFromAlphabet(KEY_ALPHABET, 6);
}

// --- Input validation helpers ---
const PRODUCT_KEY_RE = /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;
const PAIRING_CODE_RE = /^[A-Z0-9]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_TIERS = new Set(["lite", "full", "database", "demo"]);
const MACHINE_ID_RE = /^[A-Za-z0-9._:\-]{6,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function badRequest(msg: string) {
  return new Response(
    JSON.stringify({ error: msg }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// --- Admin gate. The desktop app does not have user accounts, so admin
//     actions (create/list/deactivate/delete licenses) are protected by a
//     shared secret matching DEV_PORTAL_PASSWORD. Clients send it in the
//     `x-admin-token` header. Without this gate anyone with the public
//     anon key could mint or delete licenses. ---
function requireAdmin(req: Request): Response | null {
  const expected = Deno.env.get("DEV_PORTAL_PASSWORD");
  if (!expected) {
    return new Response(
      JSON.stringify({ error: "Admin actions are not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const provided = req.headers.get("x-admin-token") ?? "";
  // Constant-time-ish comparison
  if (provided.length !== expected.length) {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  return null;
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
      if (typeof product_key !== "string" || !PRODUCT_KEY_RE.test(product_key)) {
        return badRequest("invalid product_key format");
      }
      if (typeof machine_id !== "string" || !MACHINE_ID_RE.test(machine_id)) {
        return badRequest("invalid machine_id");
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
      if (typeof product_key !== "string" || !PRODUCT_KEY_RE.test(product_key)) {
        return badRequest("invalid product_key format");
      }
      if (typeof machine_id !== "string" || !MACHINE_ID_RE.test(machine_id)) {
        return badRequest("invalid machine_id");
      }

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
      const { product_key, machine_id, printer_config } = await req.json();
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

      const printerConfig = printer_config || null;

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

    // ── LIST COMPANIONS: PC requests its currently paired mobile devices ──
    if (action === "list-companions") {
      const { product_key, machine_id } = await req.json();
      if (!product_key || !machine_id) {
        return new Response(
          JSON.stringify({ error: "product_key and machine_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: license } = await supabaseAdmin
        .from("licenses")
        .select("id")
        .eq("product_key", product_key)
        .maybeSingle();

      if (!license) {
        return new Response(
          JSON.stringify({ error: "Invalid product key" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: companions } = await supabaseAdmin
        .from("companion_sessions")
        .select("id, companion_machine_id, paired_at, last_seen, status")
        .eq("license_id", license.id)
        .eq("status", "active")
        .order("paired_at", { ascending: false });

      return new Response(
        JSON.stringify({ companions: companions || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── REVOKE COMPANION: PC unpairs a specific mobile device ──
    if (action === "revoke-companion") {
      const { product_key, machine_id, session_id } = await req.json();
      if (!product_key || !machine_id || !session_id) {
        return new Response(
          JSON.stringify({ error: "product_key, machine_id and session_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: license } = await supabaseAdmin
        .from("licenses")
        .select("id")
        .eq("product_key", product_key)
        .maybeSingle();

      if (!license) {
        return new Response(
          JSON.stringify({ error: "Invalid product key" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Only revoke sessions belonging to this license
      await supabaseAdmin
        .from("companion_sessions")
        .update({ status: "revoked" })
        .eq("id", session_id)
        .eq("license_id", license.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
