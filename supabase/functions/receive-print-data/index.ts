import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "push";

    // GET: list data sources or fetch rows
    if (req.method === "GET") {
      const sourceId = url.searchParams.get("source_id");
      if (sourceId) {
        const { data, error } = await supabase
          .from("data_source_rows")
          .select("*")
          .eq("data_source_id", sourceId)
          .order("row_index", { ascending: true })
          .limit(1000);
        if (error) throw error;
        return new Response(JSON.stringify({ rows: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await supabase
        .from("data_sources")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ sources: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: push data (JSON or CSV)
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";

      let sourceName: string;
      let columns: string[];
      let rows: Record<string, string>[];

      if (contentType.includes("text/csv")) {
        // CSV body
        const csvText = await req.text();
        sourceName =
          url.searchParams.get("name") ||
          `API Import ${new Date().toISOString().slice(0, 16)}`;
        const lines = csvText.trim().split("\n");
        if (lines.length < 2) {
          return new Response(
            JSON.stringify({ error: "CSV must have header + at least 1 row" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        columns = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        rows = lines.slice(1).map((line) => {
          const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
          const obj: Record<string, string> = {};
          columns.forEach((c, i) => (obj[c] = vals[i] || ""));
          return obj;
        });
      } else {
        // JSON body
        const body = await req.json();
        sourceName =
          body.name ||
          url.searchParams.get("name") ||
          `API Import ${new Date().toISOString().slice(0, 16)}`;

        if (body.columns && body.rows) {
          columns = body.columns;
          rows = body.rows;
        } else if (Array.isArray(body.data)) {
          // Array of flat objects
          columns = Object.keys(body.data[0] || {});
          rows = body.data.map((item: Record<string, unknown>) => {
            const obj: Record<string, string> = {};
            columns.forEach((c) => (obj[c] = String(item[c] ?? "")));
            return obj;
          });
        } else {
          return new Response(
            JSON.stringify({
              error:
                'Provide { columns, rows } or { data: [...] } or send text/csv',
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Upsert: check if source with same name exists
      const appendMode = url.searchParams.get("mode") === "append";
      let sourceId: string;

      if (appendMode) {
        const { data: existing } = await supabase
          .from("data_sources")
          .select("id")
          .eq("name", sourceName)
          .maybeSingle();

        if (existing) {
          sourceId = existing.id;
          // Get current max row_index
          const { data: lastRow } = await supabase
            .from("data_source_rows")
            .select("row_index")
            .eq("data_source_id", sourceId)
            .order("row_index", { ascending: false })
            .limit(1)
            .maybeSingle();
          const startIdx = (lastRow?.row_index ?? -1) + 1;

          const batchRows = rows.map((values, idx) => ({
            data_source_id: sourceId,
            row_index: startIdx + idx,
            values,
          }));
          for (let i = 0; i < batchRows.length; i += 100) {
            const { error } = await supabase
              .from("data_source_rows")
              .insert(batchRows.slice(i, i + 100));
            if (error) throw error;
          }

          return new Response(
            JSON.stringify({
              success: true,
              source_id: sourceId,
              rows_added: rows.length,
              mode: "append",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Create new source
      const { data: source, error: createErr } = await supabase
        .from("data_sources")
        .insert({ name: sourceName, columns })
        .select()
        .single();
      if (createErr || !source) throw createErr || new Error("Failed to create data source");
      sourceId = source.id;

      // Insert rows in batches
      const batchRows = rows.map((values, idx) => ({
        data_source_id: sourceId,
        row_index: idx,
        values,
      }));
      for (let i = 0; i < batchRows.length; i += 100) {
        const { error } = await supabase
          .from("data_source_rows")
          .insert(batchRows.slice(i, i + 100));
        if (error) throw error;
      }

      return new Response(
        JSON.stringify({
          success: true,
          source_id: sourceId,
          source_name: sourceName,
          columns,
          rows_imported: rows.length,
          mode: "create",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("receive-print-data error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
