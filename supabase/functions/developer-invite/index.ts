// Owner-only invite system for promoting new developer license keys.
//
// Two actions:
//
//  POST { action: "create", owner_key, owner_totp_code }
//    → { code, expires_at }      — fresh 12-char invite, valid 24h
//
//  POST { action: "redeem", product_key, invite_code }
//    → { ok: true }              — license is added to developer_licenses;
//                                  caller still has to enroll TOTP next.
//
// Both paths require valid TOTP from the owner (for create) or simply
// the matching unconsumed invite code (for redeem). Invites are single-use.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Reuse base32 / TOTP / crypto helpers (kept self-contained on purpose —
// edge functions can't share modules cleanly).

function base32Decode(s: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

async function totpCode(secretBase32: string, time: number): Promise<string> {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(time / 30);
  const buf = new ArrayBuffer(8);
  new DataView(buf).setUint32(4, counter, false);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, buf));
  const offset = sig[sig.length - 1] & 0x0f;
  const code =
    ((sig[offset] & 0x7f) << 24) |
    (sig[offset + 1] << 16) |
    (sig[offset + 2] << 8) |
    sig[offset + 3];
  return (code % 1_000_000).toString().padStart(6, "0");
}

async function verifyTotp(secretBase32: string, submitted: string): Promise<boolean> {
  const t = Math.floor(Date.now() / 1000);
  for (const offset of [-30, 0, 30]) {
    if ((await totpCode(secretBase32, t + offset)) === submitted) return true;
  }
  return false;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("DEV_TOTP_ENCRYPTION_KEY");
  if (!raw) throw new Error("DEV_TOTP_ENCRYPTION_KEY not configured");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function decrypt(stored: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

function generateInviteCode(): string {
  // 12-char, no ambiguous chars
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { action } = body ?? {};

    // ----- CREATE INVITE (owner only) -------------------------------
    if (action === "create") {
      const { owner_key, owner_totp_code } = body;
      if (!owner_key || !owner_totp_code) {
        return json({ error: "owner_key and owner_totp_code required" }, 400);
      }

      const { data: license } = await supabase
        .from("licenses")
        .select("id")
        .eq("product_key", String(owner_key).trim().toUpperCase())
        .maybeSingle();
      if (!license) return json({ error: "invalid owner key" }, 403);

      const { data: dev } = await supabase
        .from("developer_licenses")
        .select("id, totp_secret_encrypted, is_owner")
        .eq("license_id", license.id)
        .maybeSingle();
      if (!dev || !dev.is_owner) return json({ error: "owner only" }, 403);
      if (!dev.totp_secret_encrypted) return json({ error: "owner not enrolled" }, 403);

      const secret = await decrypt(dev.totp_secret_encrypted);
      const ok = await verifyTotp(secret, String(owner_totp_code).replace(/\s/g, ""));
      if (!ok) return json({ error: "invalid TOTP" }, 401);

      const code = generateInviteCode();
      const { data: invite, error } = await supabase
        .from("developer_invites")
        .insert({ code, created_by_license_id: license.id })
        .select("code, expires_at")
        .single();
      if (error) {
        console.error("invite insert", error);
        return json({ error: "could not create invite" }, 500);
      }
      return json({ code: invite.code, expires_at: invite.expires_at });
    }

    // ----- REDEEM INVITE --------------------------------------------
    if (action === "redeem") {
      const { product_key, invite_code } = body;
      if (!product_key || !invite_code) {
        return json({ error: "product_key and invite_code required" }, 400);
      }

      const { data: license } = await supabase
        .from("licenses")
        .select("id, is_active")
        .eq("product_key", String(product_key).trim().toUpperCase())
        .maybeSingle();
      if (!license || !license.is_active) return json({ error: "invalid product_key" }, 403);

      const { data: invite } = await supabase
        .from("developer_invites")
        .select("id, expires_at, consumed_at, created_by_license_id")
        .eq("code", String(invite_code).trim().toUpperCase())
        .maybeSingle();
      if (!invite) return json({ error: "invalid invite" }, 404);
      if (invite.consumed_at) return json({ error: "invite already used" }, 410);
      if (new Date(invite.expires_at).getTime() < Date.now()) {
        return json({ error: "invite expired" }, 410);
      }

      // Insert (or do nothing if already a developer)
      const { error: insertErr } = await supabase
        .from("developer_licenses")
        .insert({ license_id: license.id, created_by_license_id: invite.created_by_license_id });
      if (insertErr && !String(insertErr.message).includes("duplicate")) {
        console.error("dev insert", insertErr);
        return json({ error: "could not promote license" }, 500);
      }

      await supabase
        .from("developer_invites")
        .update({ consumed_at: new Date().toISOString(), consumed_by_license_id: license.id })
        .eq("id", invite.id);

      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error("developer-invite error:", err);
    return json({ error: "server error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
