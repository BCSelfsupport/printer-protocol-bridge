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

        const { data, error } = await supabase
          .from("fleet_sites")
          .select("*, fleet_printers(id, name, ip_address, port, firmware_version, serial_number, last_seen, status), licenses(product_key, tier, created_at)")
          .order("created_at", { referencedTable: "licenses", ascending: true });
        if (error) throw error;
        return new Response(JSON.stringify({ sites: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "printer-detail": {
        const printerId = url.searchParams.get("printerId");
        if (!printerId) throw new Error("printerId required");

        const [telemetry, events, telemetryHistory] = await Promise.all([
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
            .limit(200),
          // Last 50 telemetry snapshots for viscosity/phase history tabs
          supabase
            .from("fleet_telemetry")
            .select("recorded_at, viscosity, phase_qual, pressure, modulation, rps")
            .eq("printer_id", printerId)
            .order("recorded_at", { ascending: false })
            .limit(50),
        ]);

        if (telemetry.error) throw telemetry.error;
        if (events.error) throw events.error;

        return new Response(
          JSON.stringify({
            telemetry: telemetry.data?.[0] || null,
            events: events.data || [],
            telemetry_history: telemetryHistory.data || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "push-telemetry": {
        const body = await req.json();
        const { printer_id, firmware_version, serial_number, ...metrics } = body;
        if (!printer_id) throw new Error("printer_id required");

        // Fetch previous telemetry for event detection
        const { data: prevRows } = await supabase
          .from("fleet_telemetry")
          .select("jet_running, hv_on, ink_level, makeup_level, viscosity, pressure, phase_qual, modulation, filter_hours_remaining")
          .eq("printer_id", printer_id)
          .order("recorded_at", { ascending: false })
          .limit(1);
        const prev = prevRows?.[0] || null;

        // Insert telemetry
        const { error: telError } = await supabase
          .from("fleet_telemetry")
          .insert({ printer_id, ...metrics });
        if (telError) throw telError;

        // ── Event Detection ──────────────────────────────────────────────
        // Categories match the printer's native Event Log tabs:
        // event    – Faults, jet start/stop, HV on/off, system events
        // viscosity – Viscosity value logged on every change, makeup adds
        // phase    – Phase quality changes (quality, point, width, accuracy, threshold)
        // smartfill – Ink/makeup level changes (tank fill events)
        // filter   – Filter life milestones (250hr warning, expiry, replacement)
        const events: any[] = [];
        const now = new Date().toISOString();

        // ── EVENT category ──
        // Jet start / stop
        if (prev && prev.jet_running !== metrics.jet_running) {
          events.push({
            printer_id,
            category: "event",
            event_type: metrics.jet_running ? "jet_start" : "jet_stop",
            severity: "info",
            message: metrics.jet_running ? "Running script XstartJet" : "Running script XstopJet",
            occurred_at: now,
          });
        }

        // HV on / off
        if (prev && prev.hv_on !== metrics.hv_on) {
          events.push({
            printer_id,
            category: "event",
            event_type: metrics.hv_on ? "hv_on" : "hv_off",
            severity: "info",
            message: metrics.hv_on ? "High Voltage enabled" : "High Voltage disabled",
            occurred_at: now,
          });
        }

        // Pressure fault — only on significant absolute change (±5 PSI) per v2.6 protocol
        if (prev?.pressure != null && metrics.pressure != null && prev.pressure > 0) {
          const absDelta = Math.abs(metrics.pressure - prev.pressure);
          if (absDelta >= 5) {
            const direction = metrics.pressure > prev.pressure ? "High" : "Low";
            events.push({
              printer_id,
              category: "event",
              event_type: "pressure_fault",
              severity: absDelta >= 10 ? "warning" : "info",
              message: `Pump Rotation ${direction} T:${metrics.pressure} PSI:${prev.pressure} RPS:${metrics.rps?.toFixed(2) ?? '—'}`,
              occurred_at: now,
              metadata: { previous: prev.pressure, current: metrics.pressure },
            });
          }
        }

        // Modulation change — only on significant absolute change (±10)
        if (prev?.modulation != null && metrics.modulation != null && prev.modulation > 0) {
          const absDelta = Math.abs(metrics.modulation - prev.modulation);
          if (absDelta >= 10) {
            events.push({
              printer_id,
              category: "event",
              event_type: "modulation_change",
              severity: absDelta >= 20 ? "warning" : "info",
              message: `Modulation changed: ${prev.modulation} → ${metrics.modulation}`,
              occurred_at: now,
              metadata: { previous: prev.modulation, current: metrics.modulation },
            });
          }
        }

        // ── VISCOSITY category ──
        // Log viscosity on any change (printer logs every viscosity control add)
        if (prev?.viscosity != null && metrics.viscosity != null) {
          const viscDelta = Math.abs(metrics.viscosity - prev.viscosity);
          if (viscDelta >= 0.01) {
            // Determine if this was a makeup add (viscosity dropping = solvent added)
            const isAdd = metrics.viscosity < prev.viscosity;
            events.push({
              printer_id,
              category: "viscosity",
              event_type: isAdd ? "viscosity_add" : "viscosity_change",
              severity: "info",
              message: isAdd
                ? `Viscosity control add. Viscosity: ${prev.viscosity.toFixed(2)} → ${metrics.viscosity.toFixed(2)}`
                : `Viscosity: ${prev.viscosity.toFixed(2)} → ${metrics.viscosity.toFixed(2)}`,
              occurred_at: now,
              metadata: { previous: prev.viscosity, current: metrics.viscosity },
            });
          }
        }

        // ── PHASE category ──
        // Log phase quality on any significant change (±5%)
        if (prev?.phase_qual != null && metrics.phase_qual != null) {
          const phaseDelta = Math.abs(metrics.phase_qual - prev.phase_qual);
          if (phaseDelta >= 5) {
            const sev = metrics.phase_qual < 70 ? "warning" : "info";
            events.push({
              printer_id,
              category: "phase",
              event_type: "phase_quality_change",
              severity: sev,
              message: `Phase Quality: ${prev.phase_qual}% → ${metrics.phase_qual}%`,
              occurred_at: now,
              metadata: { previous: prev.phase_qual, current: metrics.phase_qual },
            });
          }
        }

        // ── SMARTFILL category ──
        // Ink level change (tracks tank fills and consumption)
        if (prev && prev.ink_level !== metrics.ink_level && metrics.ink_level) {
          const isFill = (prev.ink_level === "LOW" || prev.ink_level === "EMPTY") && (metrics.ink_level === "GOOD" || metrics.ink_level === "FULL");
          const sev = (metrics.ink_level === "LOW" || metrics.ink_level === "EMPTY") ? "warning" : "info";
          events.push({
            printer_id,
            category: "smartfill",
            event_type: isFill ? "ink_fill" : "ink_level_change",
            severity: sev,
            message: isFill
              ? `Ink tank filled. Level: ${prev.ink_level} → ${metrics.ink_level}`
              : `Ink level: ${prev.ink_level} → ${metrics.ink_level}`,
            occurred_at: now,
            metadata: { previous_level: prev.ink_level, current_level: metrics.ink_level },
          });
        }

        // Makeup level change
        if (prev && prev.makeup_level !== metrics.makeup_level && metrics.makeup_level) {
          const isFill = (prev.makeup_level === "LOW" || prev.makeup_level === "EMPTY") && (metrics.makeup_level === "GOOD" || metrics.makeup_level === "FULL");
          const sev = (metrics.makeup_level === "LOW" || metrics.makeup_level === "EMPTY") ? "warning" : "info";
          events.push({
            printer_id,
            category: "smartfill",
            event_type: isFill ? "makeup_fill" : "makeup_level_change",
            severity: sev,
            message: isFill
              ? `Makeup tank filled. Level: ${prev.makeup_level} → ${metrics.makeup_level}`
              : `Makeup level: ${prev.makeup_level} → ${metrics.makeup_level}`,
            occurred_at: now,
            metadata: { previous_level: prev.makeup_level, current_level: metrics.makeup_level },
          });
        }

        // ── FILTER category ──
        // Filter hours remaining milestones
        if (metrics.filter_hours_remaining != null) {
          const prevFilter = prev?.filter_hours_remaining;
          const curr = metrics.filter_hours_remaining;

          // Crossed below 250 hours
          if (prevFilter != null && prevFilter > 250 && curr <= 250) {
            events.push({
              printer_id,
              category: "filter",
              event_type: "filter_warning",
              severity: "warning",
              message: `Filter life below 250 hours. Remaining: ${curr.toFixed(0)}h`,
              occurred_at: now,
              metadata: { previous: prevFilter, current: curr },
            });
          }
          // Crossed below 0 (expired)
          if (prevFilter != null && prevFilter > 0 && curr <= 0) {
            events.push({
              printer_id,
              category: "filter",
              event_type: "filter_expired",
              severity: "warning",
              message: `Filter life expired. Replace filter now.`,
              occurred_at: now,
            });
          }
          // Filter replaced (hours jumped up significantly — new filter installed)
          if (prevFilter != null && curr > prevFilter + 100) {
            events.push({
              printer_id,
              category: "filter",
              event_type: "filter_replaced",
              severity: "info",
              message: `New filter installed. Filter life: ${curr.toFixed(0)}h`,
              occurred_at: now,
              metadata: { previous: prevFilter, current: curr },
            });
          }
        }

        // Insert any detected events
        if (events.length > 0) {
          await supabase.from("fleet_events").insert(events);
        }

        // Update printer last_seen, status, firmware, and serial number if provided
        const printerUpdate: any = { last_seen: new Date().toISOString(), status: "online" };
        if (firmware_version) printerUpdate.firmware_version = firmware_version;
        if (serial_number) printerUpdate.serial_number = serial_number;
        const { error: prError } = await supabase
          .from("fleet_printers")
          .update(printerUpdate)
          .eq("id", printer_id);
        if (prError) throw prError;

        return new Response(JSON.stringify({ success: true, events_generated: events.length }), {
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

      case "add-site": {
        const body = await req.json();
        const { name, company, location, contact_email, license_id, license_key } = body;
        if (!name) throw new Error("name is required");

        const insertData: any = { name };
        if (company) insertData.company = company;
        if (location) insertData.location = location;
        if (contact_email) insertData.contact_email = contact_email;
        if (license_id) {
          insertData.license_id = license_id;
        } else if (license_key) {
          const { data: lic, error: licErr } = await supabase
            .from("licenses")
            .select("id")
            .eq("product_key", license_key)
            .single();
          if (licErr || !lic) throw new Error(`License key not found: ${license_key}`);
          insertData.license_id = lic.id;
        }

        const { data, error } = await supabase
          .from("fleet_sites")
          .insert(insertData)
          .select()
          .single();
        if (error) throw error;

        return new Response(JSON.stringify({ success: true, site: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "edit-site": {
        const body = await req.json();
        const { site_id, name, company, location, contact_email, license_key } = body;
        if (!site_id) throw new Error("site_id required");

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (company !== undefined) updateData.company = company;
        if (location !== undefined) updateData.location = location;
        if (contact_email !== undefined) updateData.contact_email = contact_email;

        // Resolve license_key to license_id
        if (license_key !== undefined) {
          if (license_key === '') {
            updateData.license_id = null;
          } else {
            const { data: lic, error: licErr } = await supabase
              .from("licenses")
              .select("id")
              .eq("product_key", license_key)
              .single();
            if (licErr || !lic) throw new Error(`License key not found: ${license_key}`);
            updateData.license_id = lic.id;
          }
        }

        const { data, error } = await supabase
          .from("fleet_sites")
          .update(updateData)
          .eq("id", site_id)
          .select("*, fleet_printers(id, name, ip_address, port, firmware_version, serial_number, last_seen, status), licenses(product_key, tier)")
          .single();
        if (error) throw error;

        return new Response(JSON.stringify({ success: true, site: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "resolve-license-key": {
        const body = await req.json();
        const { product_key } = body;
        if (!product_key) throw new Error("product_key required");

        const { data, error } = await supabase
          .from("licenses")
          .select("id, product_key, tier, is_active")
          .eq("product_key", product_key)
          .single();
        if (error) throw new Error(`License key not found`);

        return new Response(JSON.stringify({ license: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "add-printer": {
        const body = await req.json();
        const { site_id, name, ip_address, port, serial_number, firmware_version } = body;
        if (!site_id || !name || !ip_address) throw new Error("site_id, name, and ip_address are required");

        const { data, error } = await supabase
          .from("fleet_printers")
          .insert({
            site_id,
            name,
            ip_address,
            port: port || 23,
            serial_number: serial_number || null,
            firmware_version: firmware_version || null,
            status: "offline",
          })
          .select()
          .single();
        if (error) throw error;

        return new Response(JSON.stringify({ success: true, printer: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete-site": {
        const body = await req.json();
        const { site_id } = body;
        if (!site_id) throw new Error("site_id required");

        // Delete printers first (and their telemetry/events)
        const { data: printers } = await supabase
          .from("fleet_printers")
          .select("id")
          .eq("site_id", site_id);
        
        if (printers && printers.length > 0) {
          const printerIds = printers.map((p: any) => p.id);
          await supabase.from("fleet_telemetry").delete().in("printer_id", printerIds);
          await supabase.from("fleet_events").delete().in("printer_id", printerIds);
          await supabase.from("fleet_firmware_updates").delete().in("printer_id", printerIds);
          await supabase.from("fleet_printers").delete().eq("site_id", site_id);
        }

        const { error } = await supabase.from("fleet_sites").delete().eq("id", site_id);
        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete-printer": {
        const body = await req.json();
        const { printer_id } = body;
        if (!printer_id) throw new Error("printer_id required");

        await supabase.from("fleet_telemetry").delete().eq("printer_id", printer_id);
        await supabase.from("fleet_events").delete().eq("printer_id", printer_id);
        await supabase.from("fleet_firmware_updates").delete().eq("printer_id", printer_id);
        const { error } = await supabase.from("fleet_printers").delete().eq("id", printer_id);
        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "register-printer": {
        // Auto-register: customer's app phones home with license key + printer config
        const body = await req.json();
        const { product_key, printer_name, ip_address, port, serial_number, firmware_version } = body;
        if (!product_key || !ip_address) throw new Error("product_key and ip_address are required");

        // Find the license
        const { data: license, error: licErr } = await supabase
          .from("licenses")
          .select("id")
          .eq("product_key", product_key)
          .eq("is_active", true)
          .single();
        if (licErr || !license) throw new Error("Invalid or inactive license key");

        // Find site linked to this license
        const { data: site } = await supabase
          .from("fleet_sites")
          .select("id, name")
          .eq("license_id", license.id)
          .single();

        // If no site exists for this license, skip auto-registration
        // Sites must be created manually via the Fleet Telemetry UI
        if (!site) {
          return new Response(JSON.stringify({ success: false, action: "no_site", message: "No fleet site configured for this license" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check if printer already registered (by IP + site)
        const { data: existing } = await supabase
          .from("fleet_printers")
          .select("id")
          .eq("site_id", site!.id)
          .eq("ip_address", ip_address)
          .maybeSingle();

        if (existing) {
          // Update existing printer
          const updateData: any = {
            name: printer_name || existing.id,
            status: "online",
            last_seen: new Date().toISOString(),
          };
          if (firmware_version) updateData.firmware_version = firmware_version;
          if (serial_number) updateData.serial_number = serial_number;

          await supabase
            .from("fleet_printers")
            .update(updateData)
            .eq("id", existing.id);

          // Also propagate firmware/serial to any other fleet printers with the same IP
          // (e.g. same physical printer registered under multiple sites)
          if (firmware_version || serial_number) {
            const crossUpdate: any = {};
            if (firmware_version) crossUpdate.firmware_version = firmware_version;
            if (serial_number) crossUpdate.serial_number = serial_number;
            await supabase
              .from("fleet_printers")
              .update(crossUpdate)
              .eq("ip_address", ip_address)
              .neq("id", existing.id);
          }

          return new Response(JSON.stringify({ success: true, action: "updated", printer_id: existing.id }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Register new printer
        const { data: printer, error: pErr } = await supabase
          .from("fleet_printers")
          .insert({
            site_id: site!.id,
            name: printer_name || `Printer @ ${ip_address}`,
            ip_address,
            port: port || 23,
            serial_number: serial_number || null,
            firmware_version: firmware_version || null,
            status: "online",
            last_seen: new Date().toISOString(),
          })
          .select()
          .single();
        if (pErr) throw pErr;

        return new Response(JSON.stringify({ success: true, action: "registered", printer_id: printer.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "seed-demo": {
        // Seed demo data for exhibition
        // Create demo sites
        const sites = [
          { name: "Dairy Fresh Co.", company: "Dairy Fresh", location: "Dublin, Ireland", contact_email: "ops@dairyfresh.ie" },
          { name: "PackRight Industries", company: "PackRight", location: "Houston, TX", contact_email: "service@packright.com" },
          { name: "Atlantic Beverages", company: "Atlantic Bev", location: "Atlanta, GA", contact_email: "maint@atlanticbev.com" },
          { name: "MedPharma Solutions", company: "MedPharma", location: "Boston, MA", contact_email: "production@medpharma.com" },
          { name: "EuroSnacks Inc.", company: "EuroSnacks", location: "Chicago, IL", contact_email: "ops@eurosnacks.com" },
          { name: "Nordic Aquaculture AS", company: "Nordic Aqua", location: "Bergen, Norway", contact_email: "drift@nordicaqua.no" },
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
    // Site 3: MedPharma Solutions - 12 printers (large pharma plant)
    { site_id: siteIds[3], name: "Blister Pack Line 1", ip_address: "10.10.1.10", port: 23, firmware_version: "01-09-00-20", serial_number: "25-01-08-001", status: "online" },
    { site_id: siteIds[3], name: "Blister Pack Line 2", ip_address: "10.10.1.11", port: 23, firmware_version: "01-09-00-20", serial_number: "25-01-08-002", status: "online" },
    { site_id: siteIds[3], name: "Blister Pack Line 3", ip_address: "10.10.1.12", port: 23, firmware_version: "01-09-00-14", serial_number: "24-11-20-001", status: "online" },
    { site_id: siteIds[3], name: "Vial Labeller A", ip_address: "10.10.1.20", port: 23, firmware_version: "01-09-00-20", serial_number: "25-01-08-003", status: "online" },
    { site_id: siteIds[3], name: "Vial Labeller B", ip_address: "10.10.1.21", port: 23, firmware_version: "01-09-00-14", serial_number: "24-07-15-002", status: "online" },
    { site_id: siteIds[3], name: "Carton Coder 1", ip_address: "10.10.2.10", port: 23, firmware_version: "01-09-00-20", serial_number: "25-02-01-001", status: "online" },
    { site_id: siteIds[3], name: "Carton Coder 2", ip_address: "10.10.2.11", port: 23, firmware_version: "01-09-00-20", serial_number: "25-02-01-002", status: "online" },
    { site_id: siteIds[3], name: "Carton Coder 3", ip_address: "10.10.2.12", port: 23, firmware_version: "01-09-00-14", serial_number: "24-05-10-001", status: "error" },
    { site_id: siteIds[3], name: "Serialisation Line", ip_address: "10.10.3.10", port: 23, firmware_version: "01-09-00-20", serial_number: "25-01-22-001", status: "online" },
    { site_id: siteIds[3], name: "Tamper Evidence Coder", ip_address: "10.10.3.11", port: 23, firmware_version: "01-09-00-20", serial_number: "25-01-22-002", status: "online" },
    { site_id: siteIds[3], name: "Batch Printer - Warehouse", ip_address: "10.10.4.10", port: 23, firmware_version: "01-09-00-14", serial_number: "23-09-30-001", status: "offline" },
    { site_id: siteIds[3], name: "QC Label Printer", ip_address: "10.10.4.11", port: 23, firmware_version: "01-09-00-20", serial_number: "25-02-01-003", status: "online" },
    // Site 4: EuroSnacks GmbH - 10 printers
    { site_id: siteIds[4], name: "Crisps Line 1", ip_address: "192.168.10.50", port: 23, firmware_version: "01-09-00-20", serial_number: "24-12-01-001", status: "online" },
    { site_id: siteIds[4], name: "Crisps Line 2", ip_address: "192.168.10.51", port: 23, firmware_version: "01-09-00-20", serial_number: "24-12-01-002", status: "online" },
    { site_id: siteIds[4], name: "Crisps Line 3", ip_address: "192.168.10.52", port: 23, firmware_version: "01-09-00-14", serial_number: "24-03-18-001", status: "online" },
    { site_id: siteIds[4], name: "Nuts Packing A", ip_address: "192.168.10.60", port: 23, firmware_version: "01-09-00-20", serial_number: "24-12-01-003", status: "online" },
    { site_id: siteIds[4], name: "Nuts Packing B", ip_address: "192.168.10.61", port: 23, firmware_version: "01-09-00-14", serial_number: "24-06-22-001", status: "error" },
    { site_id: siteIds[4], name: "Chocolate Bar Line", ip_address: "192.168.10.70", port: 23, firmware_version: "01-09-00-20", serial_number: "25-01-15-001", status: "online" },
    { site_id: siteIds[4], name: "Multipack Overwrap", ip_address: "192.168.10.71", port: 23, firmware_version: "01-09-00-20", serial_number: "25-01-15-002", status: "online" },
    { site_id: siteIds[4], name: "Case Coder - Dispatch", ip_address: "192.168.10.80", port: 23, firmware_version: "01-09-00-14", serial_number: "23-10-05-001", status: "online" },
    { site_id: siteIds[4], name: "Pallet Label Printer", ip_address: "192.168.10.81", port: 23, firmware_version: "01-09-00-20", serial_number: "25-01-15-003", status: "online" },
    { site_id: siteIds[4], name: "R&D Lab Coder", ip_address: "192.168.10.90", port: 23, firmware_version: "01-09-00-14", serial_number: "24-04-12-001", status: "offline" },
    // Site 5: Nordic Aquaculture AS - 5 printers
    { site_id: siteIds[5], name: "Salmon Tray Coder", ip_address: "10.20.1.10", port: 23, firmware_version: "01-09-00-20", serial_number: "25-01-28-001", status: "online" },
    { site_id: siteIds[5], name: "Fillet Pack Line", ip_address: "10.20.1.11", port: 23, firmware_version: "01-09-00-20", serial_number: "25-01-28-002", status: "online" },
    { site_id: siteIds[5], name: "Smoked Products Coder", ip_address: "10.20.1.12", port: 23, firmware_version: "01-09-00-14", serial_number: "24-08-20-001", status: "online" },
    { site_id: siteIds[5], name: "Cold Store Labeller", ip_address: "10.20.2.10", port: 23, firmware_version: "01-09-00-14", serial_number: "24-02-14-001", status: "error" },
    { site_id: siteIds[5], name: "Export Pallet Coder", ip_address: "10.20.2.11", port: 23, firmware_version: "01-09-00-20", serial_number: "25-01-28-003", status: "online" },
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
      filter_hours_remaining: 200 + Math.floor(Math.random() * 4800),
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
    { event_type: "firmware_update", severity: "info", message: "Firmware updated to 01-09-00-20" },
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
