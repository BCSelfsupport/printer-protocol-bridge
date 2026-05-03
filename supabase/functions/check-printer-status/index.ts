import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-license-key, x-admin-token',
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function authorize(req: Request): Promise<Response | null> {
  const adminExpected = Deno.env.get("DEV_PORTAL_PASSWORD");
  const adminProvided = req.headers.get("x-admin-token") ?? "";
  if (adminExpected && adminProvided && adminExpected.length === adminProvided.length) {
    let mismatch = 0;
    for (let i = 0; i < adminExpected.length; i++) {
      mismatch |= adminExpected.charCodeAt(i) ^ adminProvided.charCodeAt(i);
    }
    if (mismatch === 0) return null;
  }
  const licenseKey = req.headers.get("x-license-key") ?? "";
  if (/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(licenseKey)) {
    const { data: license } = await supabaseAdmin
      .from("licenses")
      .select("is_active, expires_at")
      .eq("product_key", licenseKey)
      .maybeSingle();
    if (license && license.is_active && (!license.expires_at || new Date(license.expires_at) > new Date())) {
      return null;
    }
  }
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface PrinterStatus {
  id: number;
  isAvailable: boolean;
  status: 'ready' | 'not_ready' | 'error' | 'offline';
  responseTime?: number;
  version?: string;
  error?: string;
}

// --- Input validation guards ---
const MAX_PRINTERS_PER_REQUEST = 16; // ample for fleet ops, blocks bulk scanning abuse
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;
// Block private/loopback/link-local + multicast/reserved to prevent SSRF / internal probes
function isDisallowedIp(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}
function validatePrinter(p: unknown): { ok: true; value: { id: number; ipAddress: string; port: number } } | { ok: false; error: string } {
  if (!p || typeof p !== 'object') return { ok: false, error: 'printer must be an object' };
  const obj = p as Record<string, unknown>;
  const id = obj.id;
  const ipAddress = obj.ipAddress;
  const port = obj.port;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) return { ok: false, error: 'invalid id' };
  if (typeof ipAddress !== 'string' || !IPV4_RE.test(ipAddress)) return { ok: false, error: 'invalid ipAddress (IPv4 required)' };
  if (isDisallowedIp(ipAddress)) return { ok: false, error: 'private / reserved IP ranges are not allowed' };
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: 'invalid port' };
  return { ok: true, value: { id, ipAddress, port } };
}

async function checkPrinter(printer: { id: number; ipAddress: string; port: number }): Promise<PrinterStatus> {
  const startTime = Date.now();

  try {
    // Attempt TCP connection with timeout
    const conn = await Promise.race([
      Deno.connect({ hostname: printer.ipAddress, port: printer.port }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 3000)
      )
    ]) as Deno.Conn;

    const responseTime = Date.now() - startTime;

    try {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      await conn.write(encoder.encode("^S\r"));

      const buffer = new Uint8Array(1024);
      const bytesRead = await Promise.race([
        conn.read(buffer),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
      ]);

      conn.close();

      if (bytesRead && bytesRead > 0) {
        const response = decoder.decode(buffer.subarray(0, bytesRead));
        const isReady = response.includes('READY') || response.includes('OK');
        return {
          id: printer.id,
          isAvailable: true,
          status: isReady ? 'ready' : 'not_ready',
          responseTime,
          version: extractVersion(response),
        };
      }

      return {
        id: printer.id,
        isAvailable: true,
        status: 'not_ready',
        responseTime,
      };

    } catch (_readError) {
      conn.close();
      return {
        id: printer.id,
        isAvailable: true,
        status: 'error',
        responseTime,
        error: 'Communication error',
      };
    }

  } catch (_error) {
    // Don't leak internal error detail to client; keep details on server side only.
    return {
      id: printer.id,
      isAvailable: false,
      status: 'offline',
      error: 'Connection failed',
    };
  }
}

function extractVersion(response: string): string | undefined {
  const versionMatch = response.match(/v?(\d+\.\d+\.\d+\.\d+)/i);
  return versionMatch ? `v${versionMatch[1]}` : undefined;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const denied = await authorize(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => null) as { printers?: unknown } | null;
    if (!body || !Array.isArray(body.printers)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: printers array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (body.printers.length === 0) {
      return new Response(
        JSON.stringify({ printers: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (body.printers.length > MAX_PRINTERS_PER_REQUEST) {
      return new Response(
        JSON.stringify({ error: `Too many printers (max ${MAX_PRINTERS_PER_REQUEST} per request)` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const validated: { id: number; ipAddress: string; port: number }[] = [];
    for (const p of body.printers) {
      const r = validatePrinter(p);
      if (!r.ok) {
        return new Response(
          JSON.stringify({ error: `Invalid printer entry: ${r.error}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      validated.push(r.value);
    }

    const results = await Promise.all(validated.map(checkPrinter));

    return new Response(
      JSON.stringify({ printers: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (_error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
