// Brokers a single scan from a paired mobile companion to the PC application.
//
// PC actions (auth = product_key):
//   create  → opens a pending scan_requests row, returns its id
//   cancel  → marks an outstanding pending row as cancelled
//   poll    → fallback to realtime; returns row if status changed
//
// Mobile actions (auth = companion_session_id + machine_id):
//   list-pending → all pending scan requests for this license
//   fulfill      → submit scanned value for a specific request id
//
// All clients reach this function with the publishable apikey; we authorise
// the actor (PC vs mobile) from the request body, not from the JWT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const body = await req.json().catch(() => ({}));

    // ── PC: create a pending scan request ─────────────────────────────
    if (action === "create") {
      const { product_key, machine_id, message_name, prompt_label, max_length } =
        body ?? {};
      if (!product_key || !machine_id || !message_name || !prompt_label) {
        return jsonResponse(
          { error: "product_key, machine_id, message_name, prompt_label required" },
          400,
        );
      }

      const { data: license } = await supabaseAdmin
        .from("licenses")
        .select("id, is_active, expires_at")
        .eq("product_key", product_key)
        .maybeSingle();

      if (!license || !license.is_active) {
        return jsonResponse({ error: "Invalid or inactive license" }, 401);
      }

      // Cancel any older pending requests for this PC + message so we never
      // have two competing rows.
      await supabaseAdmin
        .from("scan_requests")
        .update({ status: "cancelled" })
        .eq("license_id", license.id)
        .eq("pc_machine_id", machine_id)
        .eq("status", "pending");

      const { data: row, error } = await supabaseAdmin
        .from("scan_requests")
        .insert({
          license_id: license.id,
          pc_machine_id: machine_id,
          message_name,
          prompt_label,
          max_length: typeof max_length === "number" ? max_length : 24,
        })
        .select("id, expires_at")
        .single();

      if (error || !row) {
        return jsonResponse({ error: error?.message ?? "Insert failed" }, 500);
      }

      return jsonResponse({ id: row.id, expires_at: row.expires_at });
    }

    // ── PC: cancel an outstanding pending request ─────────────────────
    if (action === "cancel") {
      const { product_key, request_id } = body ?? {};
      if (!product_key || !request_id) {
        return jsonResponse({ error: "product_key, request_id required" }, 400);
      }
      const { data: license } = await supabaseAdmin
        .from("licenses")
        .select("id")
        .eq("product_key", product_key)
        .maybeSingle();
      if (!license) return jsonResponse({ error: "Invalid license" }, 401);

      await supabaseAdmin
        .from("scan_requests")
        .update({ status: "cancelled" })
        .eq("id", request_id)
        .eq("license_id", license.id)
        .eq("status", "pending");
      return jsonResponse({ ok: true });
    }

    // ── PC: poll a single request (fallback if realtime drops) ────────
    if (action === "poll") {
      const { product_key, request_id } = body ?? {};
      if (!product_key || !request_id) {
        return jsonResponse({ error: "product_key, request_id required" }, 400);
      }
      const { data: license } = await supabaseAdmin
        .from("licenses")
        .select("id")
        .eq("product_key", product_key)
        .maybeSingle();
      if (!license) return jsonResponse({ error: "Invalid license" }, 401);

      const { data: row } = await supabaseAdmin
        .from("scan_requests")
        .select("id, status, scanned_value, expires_at, message_name, prompt_label")
        .eq("id", request_id)
        .eq("license_id", license.id)
        .maybeSingle();
      return jsonResponse({ request: row ?? null });
    }

    // ── Mobile: list pending scan requests for paired license ─────────
    if (action === "list-pending") {
      const { session_id, machine_id } = body ?? {};
      if (!session_id || !machine_id) {
        return jsonResponse({ error: "session_id, machine_id required" }, 400);
      }
      const { data: session } = await supabaseAdmin
        .from("companion_sessions")
        .select("license_id, status")
        .eq("id", session_id)
        .eq("companion_machine_id", machine_id)
        .eq("status", "active")
        .maybeSingle();
      if (!session) return jsonResponse({ error: "Invalid companion session" }, 401);

      const { data: rows } = await supabaseAdmin
        .from("scan_requests")
        .select("id, message_name, prompt_label, max_length, created_at, expires_at")
        .eq("license_id", session.license_id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(5);

      return jsonResponse({ requests: rows ?? [] });
    }

    // ── Mobile: fulfil a specific scan request with the captured value ─
    if (action === "fulfill") {
      const { session_id, machine_id, request_id, value } = body ?? {};
      if (!session_id || !machine_id || !request_id || typeof value !== "string") {
        return jsonResponse(
          { error: "session_id, machine_id, request_id, value required" },
          400,
        );
      }
      const { data: session } = await supabaseAdmin
        .from("companion_sessions")
        .select("license_id, status")
        .eq("id", session_id)
        .eq("companion_machine_id", machine_id)
        .eq("status", "active")
        .maybeSingle();
      if (!session) return jsonResponse({ error: "Invalid companion session" }, 401);

      const { data: row } = await supabaseAdmin
        .from("scan_requests")
        .select("id, status, max_length, expires_at")
        .eq("id", request_id)
        .eq("license_id", session.license_id)
        .maybeSingle();
      if (!row) return jsonResponse({ error: "Request not found" }, 404);
      if (row.status !== "pending") {
        return jsonResponse({ error: `Request already ${row.status}` }, 409);
      }
      if (new Date(row.expires_at) < new Date()) {
        await supabaseAdmin
          .from("scan_requests")
          .update({ status: "expired" })
          .eq("id", row.id);
        return jsonResponse({ error: "Request expired" }, 410);
      }

      const trimmed = value.trim().slice(0, row.max_length);
      const { error: updateError } = await supabaseAdmin
        .from("scan_requests")
        .update({
          status: "fulfilled",
          scanned_value: trimmed,
          fulfilled_by_machine_id: machine_id,
          fulfilled_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500);
      }
      return jsonResponse({ ok: true, value: trimmed });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[scan-request]", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
