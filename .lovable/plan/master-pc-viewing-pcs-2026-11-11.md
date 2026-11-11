# Master PC & Viewing PCs

## Confirmed scope
- One **Master control PC** manages the customer's 10 printers and remains the only computer connecting to them.
- Other PCs on the **factory network** connect to the Master for **read-only** printer overview, reporting and service-data screens.
- Viewing PCs are **included with the Master PC licence**; they do not need their own keys.
- No remote access, second control point or automatic takeover in this first release.

## What the customer gets

### Master PC
- A **Master PC Sharing** setting, off until enabled.
- A displayed local address and a short-lived pairing code.
- Approval of each viewing PC, identified by a name such as “Production Office”.
- A list of paired PCs with connection status and a **Remove access** action.
- Normal printer operation continues on the Master. Adding viewers must not open extra printer connections or interrupt production.

### Viewing PCs
- A **Connect to Master PC** option before the licence-key screen. Use the same Windows app in viewing mode.
- Enter the Master's local address and pairing code, then wait for approval.
- Three available views:
  - **Printer overview:** all configured printers, names/IDs, status, current message, counts, ink/makeup levels and reported faults.
  - **Reports:** the Master's existing production, shift and OEE records, plus saved custom reports where supported by its licence. Filter, view and download; no editing production records or shared templates.
  - **Service data:** select a printer to see its latest available pressure, viscosity, temperatures, hours and other supported readings.
- Prominent **View only**, Master name, connection state and last-updated time.
- No message editing/sending, jet start/stop, Force Print, counter reset, printer configuration, firmware actions or floor-layout editing.

## Safe behaviour
- Viewers receive the Master's collected data—not a separate connection to each printer.
- Opening a service screen never changes the Master's selected printer or pauses its polling.
- Missing or unsupported readings display as unavailable, not as zero or a healthy state.
- A stopped Master or lost network connection changes the viewing screen to **Master offline / data out of date**, rather than leaving apparently live green indicators.
- Reconnect automatically when the Master returns; removed PCs must pair again.
- Keep sharing active while the Master app is running, even if minimised. Prevent sleep while sharing is enabled; closing or quitting the app ends sharing.
- The factory PCs must be able to reach each other; Windows may require a Private-network firewall permission. No router port forwarding.
- Live sharing stays on the factory network. Existing licence activation/validation can still require internet access; this is not a promise of permanently offline licensing.

## Development stages
1. **Secure sharing foundation:** Master/viewer modes, pairing approval, revocation, licence entitlement and authenticated local data exchange.
2. **Printer overview:** share the configured printer list and timestamped live status without new printer connections.
3. **Service and reports:** publish available service readings and the Master's reporting history; reuse existing screens in genuinely read-only mode.
4. **Reliability and release:** reconnect/offline handling, multiple-viewer load checks, factory-network setup guidance and a new Windows installer.

## Technical approach
- Extend the existing Electron local relay rather than creating a separate server application. Desktop viewer traffic goes through a narrow Electron bridge, not unrestricted renderer network access.
- The mobile QR pairing is a useful UX reference, but it currently pairs licences/configuration; it is not already a read-only shared-screen feature.
- Use authenticated, encrypted LAN sessions with a locally generated Master identity and explicitly pinned trust on approval. Use expiring single-use pairing codes, rate limits, per-viewer credentials and immediate revocation. No product keys in shared snapshots or viewer storage.
- Authorise the Master against its licence and machine activation. View-only entitlement cannot rely on a client-side tier flag or copied licence key. Extend the existing licence service only as needed to issue/validate a bounded Master entitlement; preserve existing offline licensing behaviour.
- The existing relay exposes command endpoints without a viewer permission boundary. Secure that boundary before shipping: viewer credentials must be rejected by **every** command/connect/disconnect/polling-control endpoint, including legacy paths. Preserve existing mobile functions through authenticated, explicitly scoped access—not an unauthenticated fallback.
- Share versioned, timestamped, allowlisted snapshots from the Master: printer catalogue, observed status, available service readings and report records/templates. Exclude secrets, arbitrary commands and unrelated files.
- Reuse the existing command queue and transport ownership. Collect service data only through the Master's safe polling schedule; measure coverage and load for 10 printers before choosing final update intervals. Never fall back to opening a viewer socket or switching the active message to obtain missing data.
- Read reports from the Master's production storage, with paginated initial history and incremental updates. Viewer exports are local copies and do not modify the Master.
- Confirm how production records are currently collected before promising automatic reporting for all 10 printers. This release shares the records the Master actually has; it does not invent missing history or introduce a new OEE formula. Service scope is current diagnostics, not a new historical maintenance ledger.
- Make floor-layout sharing a later addition; this first release covers the three requested viewing screens.

## Acceptance checks
- One licensed Master with 10 emulated printers and at least two independent viewers; then a customer-site check with real printers.
- Verify both viewers see a changed printer status, fault, consumable level, service reading and report record from the Master.
- Confirm service-screen navigation leaves the Master's active printer and production operation unchanged.
- Attempt prohibited commands directly, not just through buttons: all viewer write/control requests must fail, including legacy relay endpoints.
- Test invalid/expired pairing, reused codes, approval, access removal, licence failure, connection loss, Master restart and incompatible app versions.
- Compare report totals and downloaded output with the Master's records; verify no report-history writes are possible from viewers.
- Add focused automated tests for read-only permissions, included viewer entitlement, timestamp freshness, pairing and report synchronisation.
- One concise **What's New** entry with feature bullets; no separate entries for every stage or tweak.

## Approval
Approving this plan confirms building the factory-only **Master PC + read-only viewing PCs** feature above. The existing two keys remain valid for ordinary independent use; viewing mode will not require consuming the second key.