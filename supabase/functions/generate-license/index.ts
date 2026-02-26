import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function generateKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const parts: string[] = [];
  for (let s = 0; s < 4; s++) {
    let seg = "";
    for (let i = 0; i < 5; i++) {
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
    // Authenticate with shared secret
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = Deno.env.get("CROSS_PROJECT_API_KEY");

    if (!apiKey || apiKey !== expectedKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { tier, email, orderId, customerName, customerCompany } = await req.json();

    // Validate required fields
    if (!tier || !email) {
      return new Response(
        JSON.stringify({ error: "tier and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validTiers = ["lite", "full", "database", "demo"];
    if (!validTiers.includes(tier)) {
      return new Response(
        JSON.stringify({ error: `Invalid tier. Must be one of: ${validTiers.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find or create customer
    let customerId: string | null = null;
    const { data: existing } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      customerId = existing.id;
    } else {
      const { data: newCust } = await supabaseAdmin
        .from("customers")
        .insert({
          name: customerName || email.split("@")[0],
          email,
          company: customerCompany || null,
          notes: orderId ? `PayPal Order: ${orderId}` : null,
        })
        .select("id")
        .single();
      customerId = newCust?.id || null;
    }

    // Generate and store the license
    const product_key = generateKey();
    const expiresAt = tier === "demo"
      ? new Date(Date.now() + 30 * 86400000).toISOString() // 30-day demo
      : null;

    const { data: license, error: licErr } = await supabaseAdmin
      .from("licenses")
      .insert({
        product_key,
        tier,
        customer_id: customerId,
        expires_at: expiresAt,
      })
      .select("id, product_key, tier, expires_at")
      .single();

    if (licErr) {
      console.error("License insert error:", licErr);
      return new Response(
        JSON.stringify({ error: "Failed to generate license" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`License generated: ${product_key} (${tier}) for ${email}, order: ${orderId || "N/A"}`);

    // TODO: Trigger email via CRM project's Graph integration
    // For now, return the key so the store can display it to the customer

    return new Response(
      JSON.stringify({
        success: true,
        license: {
          product_key: license.product_key,
          tier: license.tier,
          expires_at: license.expires_at,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-license error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
