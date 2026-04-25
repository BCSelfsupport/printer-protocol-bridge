// Developer access — license-key + TOTP 2FA
// Replaces the old shared DEV_PORTAL_PASSWORD scheme.
//
// Flow:
//  1. POST { product_key }                  → check if license is a developer
//                                              and whether TOTP is enrolled
//     → { is_developer: bool, enrolled: bool }
//
//  2. POST { product_key, action: "enroll" } (only if !enrolled)
//     → { secret, otpauth_uri }   (one-time, never sent again)
//
//  3. POST { product_key, totp_code }       → verify and "sign in"
//     → { valid: bool, is_owner: bool }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOTP_ISSUER = "BestCode CodeSync Dev";
const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;

function base32Encode(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 0x1f];
  return out;
}

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
  const counter = Math.floor(time / TOTP_PERIOD);
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
  return (code % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

async function verifyTotp(secretBase32: string, submitted: string): Promise<boolean> {
  const t = Math.floor(Date.now() / 1000);
  for (const offset of [-TOTP_PERIOD, 0, TOTP_PERIOD]) {
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

async function encrypt(plain: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv, 0);
  combined.set(ct, iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(stored: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

function generateSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { product_key, totp_code, action } = body ?? {};

    if (!product_key || typeof product_key !== "string") {
      return json({ error: "product_key required" }, 400);
    }

    const { data: license } = await supabase
      .from("licenses")
      .select("id, is_active")
      .eq("product_key", product_key.trim().toUpperCase())
      .maybeSingle();

    if (!license || !license.is_active) {
      return json({ is_developer: false }, 200);
    }

    const { data: dev } = await supabase
      .from("developer_licenses")
      .select("id, totp_secret_encrypted, totp_enrolled_at, is_owner")
      .eq("license_id", license.id)
      .maybeSingle();

    if (!dev) {
      return json({ is_developer: false }, 200);
    }

    const enrolled = !!dev.totp_secret_encrypted;

    // STATUS check
    if (!action && !totp_code) {
      return json({ is_developer: true, enrolled, is_owner: dev.is_owner });
    }

    // ENROLL — only if not yet enrolled
    if (action === "enroll") {
      if (enrolled) return json({ error: "already enrolled" }, 409);
      const secret = generateSecret();
      const enc = await encrypt(secret);
      await supabase
        .from("developer_licenses")
        .update({ totp_secret_encrypted: enc, totp_enrolled_at: new Date().toISOString() })
        .eq("id", dev.id);
      const label = encodeURIComponent(`${TOTP_ISSUER}:${product_key}`);
      const issuer = encodeURIComponent(TOTP_ISSUER);
      const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&period=${TOTP_PERIOD}&digits=${TOTP_DIGITS}`;
      return json({ secret, otpauth_uri: otpauth });
    }

    // VERIFY
    if (totp_code && enrolled) {
      const secret = await decrypt(dev.totp_secret_encrypted!);
      const ok = await verifyTotp(secret, String(totp_code).replace(/\s/g, ""));
      if (ok) {
        await supabase
          .from("developer_licenses")
          .update({ last_signin_at: new Date().toISOString() })
          .eq("id", dev.id);
        return json({ valid: true, is_owner: dev.is_owner, license_id: license.id });
      }
      return json({ valid: false }, 401);
    }

    return json({ error: "invalid request" }, 400);
  } catch (err) {
    console.error("verify-dev-access error:", err);
    return json({ error: "server error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
