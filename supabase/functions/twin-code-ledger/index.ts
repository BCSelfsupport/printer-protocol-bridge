/**
 * Twin Code — Cloud Ledger Sync
 *
 * Operations:
 *   - claim:        atomically reserve a serial as printed in the global ledger.
 *                   Returns 409 if another PC already printed it (cross-PC dup guard).
 *   - record-miss:  log a miss-print (no uniqueness constraint).
 *   - run-start:    register a new production run.
 *   - run-update:   update counts + heartbeat for an active run.
 *   - run-stop:     mark a run completed.
 *   - query:        return all printed serials for a catalog fingerprint
 *                   (used by client to skip already-claimed rows on resume).
 *   - active-runs:  return active runs for a catalog fingerprint
 *                   (used by Resume-on-backup to find an interrupted run).
 *
 * All requests require a license_id + pc_machine_id so we can attribute
 * activity and detect cross-PC contention.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ClaimBody {
  op: "claim";
  catalog_fingerprint: string;
  serial: string;
  bottle_index: number;
  run_id?: string | null;
  license_id?: string | null;
  pc_machine_id: string;
}

interface RecordMissBody {
  op: "record-miss";
  catalog_fingerprint: string;
  bottle_index: number;
  run_id?: string | null;
  license_id?: string | null;
  pc_machine_id: string;
}

interface RunStartBody {
  op: "run-start";
  lot_number: string;
  operator: string;
  note?: string | null;
  catalog_fingerprint: string | null;
  catalog_total_at_start: number;
  live_at_start: boolean;
  license_id?: string | null;
  pc_machine_id: string;
}

interface RunUpdateBody {
  op: "run-update";
  run_id: string;
  printed_count: number;
  missed_count: number;
  pc_machine_id: string;
}

interface RunStopBody {
  op: "run-stop";
  run_id: string;
  printed_count: number;
  missed_count: number;
  pc_machine_id: string;
}

interface QueryBody {
  op: "query";
  catalog_fingerprint: string;
}

interface ActiveRunsBody {
  op: "active-runs";
  catalog_fingerprint: string;
}

type Body =
  | ClaimBody
  | RecordMissBody
  | RunStartBody
  | RunUpdateBody
  | RunStopBody
  | QueryBody
  | ActiveRunsBody;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body || typeof body !== "object" || !("op" in body)) {
    return json({ error: "Missing op field" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return json({ error: "Backend not configured" }, 500);
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // license_id column is a UUID FK; product-key strings (e.g. "53F2G-K94HE-...")
  // are not valid UUIDs and would 22P02 the insert. Coerce to null unless it
  // matches the UUID format.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const asUuid = (v: unknown): string | null =>
    typeof v === "string" && UUID_RE.test(v) ? v : null;

  try {
    switch (body.op) {
      case "claim": {
        if (!body.catalog_fingerprint || !body.serial || !body.pc_machine_id) {
          return json({ error: "Missing required claim fields" }, 400);
        }
        const { data, error } = await supabase
          .from("twin_code_ledger")
          .insert({
            catalog_fingerprint: body.catalog_fingerprint,
            serial: body.serial,
            outcome: "printed",
            bottle_index: body.bottle_index,
            run_id: asUuid(body.run_id),
            pc_machine_id: body.pc_machine_id,
            license_id: asUuid(body.license_id),
          })
          .select("id")
          .single();

        if (error) {
          // 23505 = unique_violation → another PC already printed this serial
          if ((error as any).code === "23505") {
            // Find who claimed it
            const { data: claimer } = await supabase
              .from("twin_code_ledger")
              .select("pc_machine_id, wall_at, run_id")
              .eq("catalog_fingerprint", body.catalog_fingerprint)
              .eq("serial", body.serial)
              .eq("outcome", "printed")
              .maybeSingle();
            return json(
              {
                ok: false,
                duplicate: true,
                claimedBy: claimer?.pc_machine_id ?? "unknown",
                claimedAt: claimer?.wall_at ?? null,
                runId: claimer?.run_id ?? null,
              },
              409,
            );
          }
          throw error;
        }
        return json({ ok: true, id: data.id });
      }

      case "record-miss": {
        if (!body.catalog_fingerprint || !body.pc_machine_id) {
          return json({ error: "Missing required miss fields" }, 400);
        }
        const { error } = await supabase.from("twin_code_ledger").insert({
          catalog_fingerprint: body.catalog_fingerprint,
          serial: "",
          outcome: "missed",
          bottle_index: body.bottle_index,
          run_id: asUuid(body.run_id),
          pc_machine_id: body.pc_machine_id,
          license_id: asUuid(body.license_id),
        });
        if (error) throw error;
        return json({ ok: true });
      }

      case "run-start": {
        if (!body.lot_number || !body.operator || !body.pc_machine_id) {
          return json({ error: "Missing required run-start fields" }, 400);
        }
        const { data, error } = await supabase
          .from("twin_code_runs")
          .insert({
            lot_number: body.lot_number,
            operator: body.operator,
            note: body.note ?? null,
            catalog_fingerprint: body.catalog_fingerprint,
            catalog_total_at_start: body.catalog_total_at_start,
            live_at_start: body.live_at_start,
            pc_machine_id: body.pc_machine_id,
            license_id: asUuid(body.license_id),
            status: "active",
          })
          .select("id, started_at")
          .single();
        if (error) throw error;
        return json({ ok: true, id: data.id, startedAt: data.started_at });
      }

      case "run-update": {
        if (!body.run_id || !body.pc_machine_id) {
          return json({ error: "Missing required run-update fields" }, 400);
        }
        const { error } = await supabase
          .from("twin_code_runs")
          .update({
            printed_count: body.printed_count,
            missed_count: body.missed_count,
            last_heartbeat_at: new Date().toISOString(),
          })
          .eq("id", body.run_id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "run-stop": {
        if (!body.run_id || !body.pc_machine_id) {
          return json({ error: "Missing required run-stop fields" }, 400);
        }
        const { error } = await supabase
          .from("twin_code_runs")
          .update({
            status: "completed",
            printed_count: body.printed_count,
            missed_count: body.missed_count,
            ended_at: new Date().toISOString(),
            last_heartbeat_at: new Date().toISOString(),
          })
          .eq("id", body.run_id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "query": {
        if (!body.catalog_fingerprint) {
          return json({ error: "Missing catalog_fingerprint" }, 400);
        }
        const { data, error } = await supabase
          .from("twin_code_ledger")
          .select("serial, bottle_index, pc_machine_id, wall_at, run_id")
          .eq("catalog_fingerprint", body.catalog_fingerprint)
          .eq("outcome", "printed")
          .order("wall_at", { ascending: true })
          .limit(50000);
        if (error) throw error;
        return json({ ok: true, printed: data ?? [] });
      }

      case "active-runs": {
        if (!body.catalog_fingerprint) {
          return json({ error: "Missing catalog_fingerprint" }, 400);
        }
        const { data, error } = await supabase
          .from("twin_code_runs")
          .select(
            "id, lot_number, operator, note, pc_machine_id, started_at, last_heartbeat_at, printed_count, missed_count, live_at_start",
          )
          .eq("catalog_fingerprint", body.catalog_fingerprint)
          .eq("status", "active")
          .order("started_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        return json({ ok: true, runs: data ?? [] });
      }

      default:
        return json({ error: `Unknown op: ${(body as { op: string }).op}` }, 400);
    }
  } catch (err) {
    console.error("[twin-code-ledger] error:", err);
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
