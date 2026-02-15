import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    switch (action) {
      case "sites": {
        // Update last_seen for all online printers on each fetch
        await supabase
          .from("fleet_printers")
          .update({ last_seen: new Date().toISOString() })
          .neq("status", "offline");

        const { data, error } = await supabase
          .from("fleet_sites")
          .select("*, fleet_printers(id, name, ip_address, port, firmware_version, serial_number, last_seen, status)")
          .order("name");
        if (error) throw error;
        return new Response(JSON.stringify({ sites: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "printer-detail": {
        const printerId = url.searchParams.get("printerId");
        if (!printerId) throw new Error("printerId required");

        const [telemetry, events] = await Promise.all([
          supabase
            .from("fleet_telemetry")
            .select("*")
            .eq("printer_id", printerId)
            .order("recorded_at", { ascending: false })
            .limit(1),
          supabase
            .from("fleet_events")
            .select("*")
            .eq("printer_id", printerId)
            .order("occurred_at", { ascending: false })
            .limit(50),
        ]);

        if (telemetry.error) throw telemetry.error;
        if (events.error) throw events.error;

        return new Response(
          JSON.stringify({
            telemetry: telemetry.data?.[0] || null,
            events: events.data || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "push-telemetry": {
        const body = await req.json();
        const { printer_id, ...metrics } = body;
        if (!printer_id) throw new Error("printer_id required");

        // Insert telemetry
        const { error: telError } = await supabase
          .from("fleet_telemetry")
          .insert({ printer_id, ...metrics });
        if (telError) throw telError;

        // Update printer last_seen and status
        const { error: prError } = await supabase
          .from("fleet_printers")
          .update({ last_seen: new Date().toISOString(), status: "online" })
          .eq("id", printer_id);
        if (prError) throw prError;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "firmware-list": {
        const { data, error } = await supabase
          .from("fleet_firmware")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return new Response(JSON.stringify({ firmware: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "firmware-update": {
        const body = await req.json();
        const { printer_id, firmware_id } = body;
        
        const { data, error } = await supabase
          .from("fleet_firmware_updates")
          .insert({
            printer_id,
            firmware_id,
            status: "pending",
            progress: 0,
          })
          .select()
          .single();
        if (error) throw error;

        return new Response(JSON.stringify({ update: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "firmware-update-progress": {
        const updateId = url.searchParams.get("updateId");
        if (!updateId) throw new Error("updateId required");

        const { data, error } = await supabase
          .from("fleet_firmware_updates")
          .select("*, fleet_firmware(*)")
          .eq("id", updateId)
          .single();
        if (error) throw error;

        return new Response(JSON.stringify({ update: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "seed-demo": {
        // Seed demo data for exhibition
        // Create demo sites
        const sites = [
          { name: "Dairy Fresh Co.", company: "Dairy Fresh", location: "Dublin, Ireland", contact_email: "ops@dairyfresh.ie" },
          { name: "PackRight Industries", company: "PackRight", location: "Cork, Ireland", contact_email: "service@packright.ie" },
          { name: "Atlantic Beverages", company: "Atlantic Bev", location: "Galway, Ireland", contact_email: "maint@atlanticbev.ie" },
        ];

        const { data: siteData, error: siteErr } = await supabase
          .from("fleet_sites")
          .upsert(sites, { onConflict: "name" })
          .select();
        if (siteErr) {
          // If upsert fails (no unique constraint on name), try insert
          const { data: sd, error: se } = await supabase
            .from("fleet_sites")
            .insert(sites)
            .select();
          if (se) throw se;
          // Continue with sd
          const siteIds = sd!.map((s: any) => s.id);
          await seedPrintersAndData(supabase, siteIds, sd!);
          return new Response(JSON.stringify({ success: true, sites: sd }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const siteIds = siteData!.map((s: any) => s.id);
        await seedPrintersAndData(supabase, siteIds, siteData!);

        return new Response(JSON.stringify({ success: true, sites: siteData }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function seedPrintersAndData(supabase: any, siteIds: string[], sites: any[]) {
  const printerConfigs = [
    // Site 0: Dairy Fresh - 3 printers
    { site_id: siteIds[0], name: "Line 1 - Milk Cartons", ip_address: "192.168.1.55", port: 23, firmware_version: "01-09-00-20", serial_number: "24-08-12-002", status: "online" },
    { site_id: siteIds[0], name: "Line 2 - Yogurt Pots", ip_address: "192.168.1.56", port: 23, firmware_version: "01-09-00-14", serial_number: "24-06-03-001", status: "online" },
    { site_id: siteIds[0], name: "Line 3 - Cheese Blocks", ip_address: "192.168.1.57", port: 23, firmware_version: "01-09-00-14", serial_number: "23-11-15-003", status: "offline" },
    // Site 1: PackRight - 2 printers
    { site_id: siteIds[1], name: "Primary Coder", ip_address: "10.0.1.20", port: 23, firmware_version: "01-09-00-20", serial_number: "24-09-22-001", status: "online" },
    { site_id: siteIds[1], name: "Secondary Coder", ip_address: "10.0.1.21", port: 23, firmware_version: "01-09-00-14", serial_number: "24-09-22-002", status: "online" },
    // Site 2: Atlantic Beverages - 4 printers
    { site_id: siteIds[2], name: "Bottling Line A", ip_address: "172.16.0.10", port: 23, firmware_version: "01-09-00-20", serial_number: "24-10-05-001", status: "online" },
    { site_id: siteIds[2], name: "Bottling Line B", ip_address: "172.16.0.11", port: 23, firmware_version: "01-09-00-14", serial_number: "24-10-05-002", status: "online" },
    { site_id: siteIds[2], name: "Can Line 1", ip_address: "172.16.0.12", port: 23, firmware_version: "01-09-00-14", serial_number: "23-07-18-001", status: "error" },
    { site_id: siteIds[2], name: "Can Line 2", ip_address: "172.16.0.13", port: 23, firmware_version: "01-09-00-20", serial_number: "24-10-05-003", status: "online" },
  ];

  const { data: printers, error: pErr } = await supabase
    .from("fleet_printers")
    .insert(printerConfigs.map(p => ({ ...p, last_seen: p.status !== 'offline' ? new Date().toISOString() : null })))
    .select();
  if (pErr) throw pErr;

  // Seed telemetry for each online printer
  const telemetryRows = printers!
    .filter((p: any) => p.status !== "offline")
    .map((p: any) => ({
      printer_id: p.id,
      pressure: 38 + Math.random() * 7,
      viscosity: 2.1 + Math.random() * 0.8,
      modulation: 140 + Math.floor(Math.random() * 20),
      charge: 85 + Math.floor(Math.random() * 15),
      rps: 60 + Math.random() * 20,
      phase_qual: 75 + Math.floor(Math.random() * 25),
      ink_level: p.status === "error" ? "LOW" : "FULL",
      makeup_level: Math.random() > 0.3 ? "FULL" : "GOOD",
      printhead_temp: 38 + Math.random() * 5,
      electronics_temp: 32 + Math.random() * 8,
      power_hours: `${1000 + Math.floor(Math.random() * 5000)}`,
      stream_hours: `${500 + Math.floor(Math.random() * 3000)}`,
      hv_on: p.status === "online",
      jet_running: p.status === "online",
      print_count: Math.floor(Math.random() * 500000),
      current_message: "BESTBEFORE",
    }));

  if (telemetryRows.length > 0) {
    await supabase.from("fleet_telemetry").insert(telemetryRows);
  }

  // Seed events
  const eventTypes = [
    { event_type: "ink_tag_scan", severity: "info", message: "Ink cartridge scanned - BC-INK-2024-BLK" },
    { event_type: "makeup_tag_scan", severity: "info", message: "Makeup cartridge scanned - BC-MU-2024-STD" },
    { event_type: "fault", severity: "error", message: "Gutter fault detected - auto-recovered" },
    { event_type: "startup", severity: "info", message: "Printer powered on" },
    { event_type: "jet_start", severity: "info", message: "Ink jet started successfully" },
    { event_type: "firmware_update", severity: "info", message: "Firmware updated to V2.6.1" },
    { event_type: "low_ink", severity: "warning", message: "Ink level LOW - replacement recommended" },
    { event_type: "pressure_warning", severity: "warning", message: "Pressure outside optimal range (36 PSI)" },
  ];

  const events: any[] = [];
  for (const p of printers!) {
    const numEvents = 3 + Math.floor(Math.random() * 8);
    for (let i = 0; i < numEvents; i++) {
      const evt = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      events.push({
        printer_id: p.id,
        ...evt,
        occurred_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }
  await supabase.from("fleet_events").insert(events);

  // Seed firmware versions
  const firmwareVersions = [
    { version: "01-09-00-20", release_notes: "Latest stable - improved gutter detection, new Auto Encoder Reverse mode, expanded ^SU fields", file_size: 2048576, is_latest: true },
    { version: "01-09-00-14", release_notes: "Previous release - basic remote communication, viscosity calculation, temperature monitoring via ^TP command", file_size: 1966080, is_latest: false },
  ];
  await supabase.from("fleet_firmware").insert(firmwareVersions);
}
