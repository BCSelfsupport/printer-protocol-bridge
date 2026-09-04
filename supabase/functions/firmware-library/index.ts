// Firmware library — license-gated access to private firmware packages.
//
// Actions:
//   list            -> published packages (any active licensed install)
//   sign_download   -> signed URLs for every file in a package
//   sign_upload     -> signed upload URLs (developer keys only)
//   create          -> register a package after upload (developer keys only)
//   delete          -> remove a package and its files (developer keys only)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-license-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BUCKET = "firmware";

/** Normalise a relative path so a package can never escape its own folder. */
function safeRelPath(input: string): string | null {
  const cleaned = String(input ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
  if (!cleaned) return null;
  if (cleaned.split("/").some((seg) => seg === "." || seg === ".." || seg === "")) return null;
  if (cleaned.length > 240) return null;
  return cleaned;
}

async function resolveLicense(productKey: string | null) {
  if (!productKey) return { license: null, isDeveloper: false };
  const { data: license } = await supabase
    .from("licenses")
    .select("id, is_active")
    .eq("product_key", productKey.trim().toUpperCase())
    .maybeSingle();
  if (!license || !license.is_active) return { license: null, isDeveloper: false };
  const { data: dev } = await supabase
    .from("developer_licenses")
    .select("id")
    .eq("license_id", license.id)
    .maybeSingle();
  return { license, isDeveloper: !!dev };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "list");
    const productKey: string | null =
      body.product_key ?? req.headers.get("x-license-key") ?? null;

    const { license, isDeveloper } = await resolveLicense(productKey);
    if (!license) return json({ error: "license_required" }, 403);

    const requireDev = () => {
      if (!isDeveloper) throw new Error("developer_required");
    };

    switch (action) {
      case "list": {
        let q = supabase
          .from("firmware_packages")
          .select("id, version, model, notes, files, total_bytes, is_published, created_at")
          .order("created_at", { ascending: false });
        if (!isDeveloper) q = q.eq("is_published", true);
        const { data, error } = await q;
        if (error) throw error;
        return json({ packages: data ?? [], is_developer: isDeveloper });
      }

      case "sign_download": {
        const { data: pkg, error } = await supabase
          .from("firmware_packages")
          .select("id, version, model, files, is_published")
          .eq("id", body.id)
          .maybeSingle();
        if (error) throw error;
        if (!pkg) return json({ error: "not_found" }, 404);
        if (!pkg.is_published && !isDeveloper) return json({ error: "not_found" }, 404);

        const files = (pkg.files as Array<{ path: string; storage_path: string; size: number }>) ?? [];
        const signed = await Promise.all(
          files.map(async (f) => {
            const { data } = await supabase.storage
              .from(BUCKET)
              .createSignedUrl(f.storage_path, 60 * 30);
            return { path: f.path, size: f.size, url: data?.signedUrl ?? null };
          }),
        );
        if (signed.some((f) => !f.url)) return json({ error: "sign_failed" }, 500);
        return json({ version: pkg.version, model: pkg.model, files: signed });
      }

      case "sign_upload": {
        requireDev();
        const folder = `${crypto.randomUUID()}`;
        const paths: string[] = Array.isArray(body.paths) ? body.paths : [];
        if (!paths.length) return json({ error: "paths_required" }, 400);
        const uploads = [];
        for (const raw of paths) {
          const rel = safeRelPath(raw);
          if (!rel) return json({ error: `invalid_path: ${raw}` }, 400);
          const storagePath = `${folder}/${rel}`;
          const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUploadUrl(storagePath);
          if (error) throw error;
          uploads.push({ path: rel, storage_path: storagePath, token: data.token, url: data.signedUrl });
        }
        return json({ folder, uploads });
      }

      case "create": {
        requireDev();
        const files = Array.isArray(body.files) ? body.files : [];
        if (!body.version || !files.length) return json({ error: "version_and_files_required" }, 400);
        const totalBytes = files.reduce((n: number, f: any) => n + (Number(f.size) || 0), 0);
        const { data, error } = await supabase
          .from("firmware_packages")
          .insert({
            version: String(body.version).trim(),
            model: body.model ? String(body.model).trim() : null,
            notes: body.notes ? String(body.notes) : null,
            files,
            total_bytes: totalBytes,
            is_published: body.is_published !== false,
            created_by_license_id: license.id,
          })
          .select()
          .single();
        if (error) throw error;
        return json({ package: data });
      }

      case "update": {
        requireDev();
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.notes !== undefined) patch.notes = body.notes;
        if (body.model !== undefined) patch.model = body.model;
        if (body.is_published !== undefined) patch.is_published = !!body.is_published;
        const { data, error } = await supabase
          .from("firmware_packages")
          .update(patch)
          .eq("id", body.id)
          .select()
          .single();
        if (error) throw error;
        return json({ package: data });
      }

      case "delete": {
        requireDev();
        const { data: pkg } = await supabase
          .from("firmware_packages")
          .select("files")
          .eq("id", body.id)
          .maybeSingle();
        const storagePaths =
          ((pkg?.files as Array<{ storage_path: string }>) ?? []).map((f) => f.storage_path);
        if (storagePaths.length) {
          await supabase.storage.from(BUCKET).remove(storagePaths);
        }
        const { error } = await supabase.from("firmware_packages").delete().eq("id", body.id);
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "developer_required") return json({ error: "developer_required" }, 403);
    console.error("firmware-library error:", msg);
    return json({ error: "server_error", detail: msg }, 500);
  }
});
