/**
 * CodeSync User Manual content.
 * Single source of truth for the in-app User Manual viewer
 * and the branded PDF export.
 */

/**
 * Platform tags shown on chapters/sections so readers can quickly tell
 * which surface (Windows desktop, mobile PWA, in-browser preview) a topic
 * applies to. Used by both the in-app viewer and the PDF export.
 */
export type Platform = 'desktop' | 'mobile' | 'web';

export const PLATFORM_LABELS: Record<Platform, string> = {
  desktop: 'Windows Desktop',
  mobile: 'Mobile (iOS / Android PWA)',
  web: 'Browser',
};

export interface ManualSection {
  id: string;
  title: string;
  body: string; // markdown-lite (paragraphs, **bold**, - bullets, ## subheadings)
  screenshot?: string; // path under /manual-screenshots/
  callouts?: { label: string; text: string }[];
  /** Platforms this section applies to. Omit = all platforms. */
  platforms?: Platform[];
}

export interface ManualChapter {
  id: string;
  title: string;
  intro: string;
  sections: ManualSection[];
  /** Platforms this whole chapter applies to. Omit = all platforms. */
  platforms?: Platform[];
}

export const MANUAL_VERSION = 'v2.0';
export const MANUAL_TITLE = 'CodeSync User Manual';

export const MANUAL: ManualChapter[] = [
  {
    id: 'getting-started',
    title: '1. Getting Started',
    intro: 'CodeSync is the BestCode printer management application. It lets you control, monitor, and configure one or many BestCode CIJ (continuous inkjet) printers from a single PC, with optional mobile companion access.',
    sections: [
      {
        id: 'splash',
        title: 'Launching CodeSync',
        body: `When CodeSync starts, you'll see the splash screen with the current version number. The application then connects to your local network and loads the printer list.\n\n**System tray:** When installed on Windows, CodeSync runs in the system tray and starts automatically with Windows.\n\n**First launch:** The first time you open CodeSync you will be prompted to activate your license. See Chapter 3.`,
        screenshot: '/manual-screenshots/00-splash.png',
      },
      {
        id: 'main-layout',
        title: 'Main layout',
        body: `The main screen has three areas:\n\n- **Network Printers** sidebar (left) — your fleet of printers with their connection status\n- **Detail panel** (right) — shows the currently selected printer's dashboard, messages, setup, etc.\n- **Top bar** — quick access to **Pair Mobile** (QR icon — opens the mobile install + pairing dialog), Theme, Fullscreen, Feedback, Training Videos, User Manual, Help, and Diagnostics\n\nClick a printer in the sidebar to connect and view its dashboard.`,
        screenshot: '/manual-screenshots/01-printers.png',
        callouts: [
          { label: 'CodeSync logo & version', text: 'click for app info; version is shown in support tickets' },
          { label: 'Top bar action icons', text: 'Pair Mobile (QR), Theme, Fullscreen, Feedback (💬), Training Videos (🎥), User Manual (📖), Help (?), Diagnostics' },
          { label: 'Network Printers sidebar', text: 'every configured printer with live status badge (READY / OFFLINE / WARNING). Drag rows to reorder.' },
          { label: '+ Add button', text: 'opens the Add Printer dialog (Chapter 4)' },
          { label: 'Printer card', text: 'click to connect; shows model, IP, current message preview, and a pencil icon to edit' },
          { label: 'Activate / tier badge', text: 'shows the active license tier; click to open the activation dialog. 5-tap on the tier badge unlocks developer tools.' },
        ],
      },
      {
        id: 'mobile-layout',
        title: 'Mobile layout',
        platforms: ['mobile'],
        body: `On a phone or tablet the same app runs as an installable PWA. Layout differences:\n\n- **Bottom navigation** replaces the desktop sidebar — Printers, Messages, Service, Reports, More\n- **Pair with PC** is the first thing you do (Chapter 13) — the phone proxies all printer traffic through the desktop\n- **Floating Scan FAB** appears on the bottom-right whenever the PC raises a scan request (Chapter 6)\n- **Polling Pause** button lets the operator on the floor stop the PC's poller while a technician works at the printer's HMI`,
      },
    ],
  },
  {
    id: 'platforms',
    title: '2. Platforms & Editions',
    intro: 'CodeSync ships in several flavors — desktop, mobile, and embedded twin-pair — that share one license and one cloud backend. This chapter explains which surface to use for which job.',
    sections: [
      {
        id: 'platform-overview',
        title: 'Where CodeSync runs',
        body: `CodeSync is delivered as three coordinated surfaces sharing a single license:\n\n- **Windows Desktop (Electron)** — the primary application. Runs as an installer with auto-update, system-tray support, and direct LAN access to printers over TCP port 23. This is where messages are authored, jobs are run, and serial data is stored.\n- **Mobile PWA (iOS Safari / Android Chrome)** — installable from the same URL the desktop uses. After pairing with a PC (Chapter 13) the phone shares the desktop's license and proxies all printer commands through it. Best for floor walks, scanning, and remote pause.\n- **Browser / Lovable Cloud preview** — the same web build, useful for demos and screenshots. No printer access; designed for evaluation and training.\n\n**One license, many devices.** A single product key activates the desktop and any number of paired phones. License state lives in Lovable Cloud (Supabase), so revoking a license from one place revokes it everywhere.`,
      },
      {
        id: 'platform-tiers',
        title: 'Editions / tiers at a glance',
        body: `Every license is one of five tiers. The badge under the Activate button on the Printers screen shows the active tier.\n\n- **DEMO** — 30-day full-feature trial. Watermark on previews and printed messages. Auto-locks at expiry.\n- **LITE** — single printer, USB / Serial only, no network features.\n- **FULL** — unlimited network printers, all message and reporting features.\n- **DATABASE** — Full + Variable Data Printing (CSV / Hotfolder / REST / ODBC), unlocks the Data Source screen and Print Jobs.\n- **TWINCODE** — bonded 2-printer pair with catalog-fed serials. Unlocks the Twin Code screen and the catalog ledger (Chapter 16).\n\nTier gating is enforced both client-side (UI hides screens you can't use) and server-side (the cloud refuses to issue scan requests or twin code ledger writes for tiers that don't include them).`,
      },
      {
        id: 'platform-pick',
        title: 'Which surface for which task?',
        body: `| I want to… | Use |\n|---|---|\n| Author or edit a print message | Desktop |\n| Run a Print Job from a CSV | Desktop |\n| Scan a barcode into a message | Mobile (paired) — or a USB scanner on the desktop |\n| Walk the floor and check printer status | Mobile |\n| Pause the desktop's polling so I can use the printer's HMI | Mobile |\n| Run a bonded twin-pair production line | Desktop (Twin Code screen) |\n| Diagnose a connection problem | Desktop (Diagnostics page) |\n\nIf in doubt: **author on the desktop, observe and scan from the phone.**`,
      },
    ],
  },
  {
    id: 'activation',
    title: '3. Activation & Licensing',
    intro: 'CodeSync requires a license to connect to printers. Four tiers are available.',
    sections: [
      {
        id: 'tiers',
        title: 'License tiers',
        body: `- **DEMO** — 30-day free trial of the full application\n- **LITE** — Standalone operation (USB / Serial), single printer\n- **FULL** — Network printer access, unlimited printers\n- **DATABASE** — Full + Variable Data Printing (VDP) with database integration\n\nYour current tier is shown at the bottom of the printers sidebar. The Activation dialog displays the tier badge alongside the masked product key.`,
        screenshot: '/manual-screenshots/45-license-activation.png',
        callouts: [
          { label: 'Product key field', text: 'paste the 20-character key supplied by BestCode (groups of 5, hyphens optional)' },
          { label: 'Activate button', text: 'validates the key against Lovable Cloud and binds it to this machine ID' },
          { label: 'Help link', text: 'opens the BestCode support contact for licensing issues' },
        ],
      },
      {
        id: 'activate',
        title: 'Activating a license',
        body: `1. Click the **Activate** button at the bottom of the printers sidebar\n2. Enter the 20-character product key supplied by BestCode\n3. Click **Activate**\n\nOnce activated the dialog shows **License active**, the active tier badge, and two action buttons: **Deactivate** (release the license from this PC) and **Pair Mobile** (generate a QR/PIN to add a phone — see Chapter 13).\n\nLicenses are tied to your machine. Moving CodeSync to a new PC requires re-activation; contact BestCode support if you need to transfer.`,
        screenshot: '/manual-screenshots/47-license-active.png',
        callouts: [
          { label: 'License active banner', text: 'green confirmation that the key is bound to this PC' },
          { label: 'Tier badge', text: 'DEMO / LITE / FULL / DATABASE / TWINCODE — drives which screens are available' },
          { label: 'Masked product key', text: 'last 4 characters shown for confirmation; full key never displayed' },
          { label: 'Pair Mobile', text: 'opens the QR / PIN dialog so a phone can join this license (Chapter 13)' },
          { label: 'Deactivate', text: 'releases the license from this PC so it can be activated elsewhere' },
        ],
      },
    ],
  },
  {
    id: 'connecting',
    title: '4. Connecting Printers',
    intro: 'Add printers to your network and connect to them.',
    sections: [
      {
        id: 'add-printer',
        title: 'Adding a printer',
        body: `1. Click **+ Add** at the top of the printers sidebar\n2. Enter a friendly **Name** (e.g. "Line 3 Coder")\n3. Enter the printer's **IP address** (e.g. 192.168.1.55) and **Port** (default 23)\n4. Click **Save**\n\nThe printer will appear in the list and CodeSync will start polling its status every 5 seconds.\n\n**Network requirements:** The PC and printer must be on the same subnet. Telnet / Remote Comms must be enabled on the printer's front panel. See the Connection Setup Guide (❓ icon → Connection Guide) for step-by-step photos.`,
        screenshot: '/manual-screenshots/03-add-printer.png',
        callouts: [
          { label: 'Name', text: 'human-friendly label shown on every screen — use the line or station name' },
          { label: 'IP Address', text: 'static IP set on the printer\'s front panel (Network menu) — must match' },
          { label: 'Port', text: 'TCP port for the Telnet / Remote Comms protocol — default 23, leave unless your IT team has remapped it' },
          { label: 'Test Connection', text: 'optional — opens a one-shot socket to verify reachability before saving' },
          { label: 'Save', text: 'persists the printer record locally and triggers the first connect cycle' },
        ],
      },
      {
        id: 'edit-printer',
        title: 'Editing a printer (Serial, Line ID, Sync Role)',
        body: `Click the small pencil icon on a printer card to edit its settings:\n\n- **Name / IP / Port** — basic connection details\n- **Serial Number** — optional; recorded for asset tracking\n- **Line ID** — optional; resolves dynamically as the value of any Line ID field in messages on this printer (e.g. "Line A", "Packaging 1")\n- **Sync Role** — None / Master / Slave for multi-printer synchronization (Master propagates message content and selection to its slaves)`,
        screenshot: '/manual-screenshots/04-edit-printer.png',
        callouts: [
          { label: 'Connection block', text: 'Name, IP, Port — same fields as Add Printer; changes take effect on next reconnect' },
          { label: 'Serial Number', text: 'asset-tracking only — never derived from the printer\'s ^VV response, so you can set it freely' },
          { label: 'Line ID', text: 'string substituted into any Line ID field in messages on this printer; required if any message uses a Line ID field' },
          { label: 'Sync Role selector', text: 'None / Master / Slave — Master broadcasts message content and ^SM selection to its Slaves on the same network' },
          { label: 'Expiry offset', text: 'number of days added to expiration date fields on this printer; useful for staggering shelf-life across lines' },
          { label: 'Delete printer', text: 'requires the admin password (TEXAS); also clears printer-specific data like consumables history' },
        ],
      },
      {
        id: 'connect',
        title: 'Connecting to a printer',
        body: `Click on a printer card in the sidebar. CodeSync will:\n\n1. Open a TCP connection to port 23\n2. Identify the model (Model 82, 86, 88, 88S, or Q) via the ^VV command\n3. Sync the message list and current status\n4. Open the Dashboard\n\nA green **READY** badge means the printer is online and the jet is running. **OFFLINE** means CodeSync cannot reach the printer (check the cable, IP, and that Remote Comms is enabled).`,
      },
      {
        id: 'reorder',
        title: 'Reordering printers',
        body: `Drag any printer card up or down in the list to change the display order. The order is saved per device.`,
      },
    ],
  },
  {
    id: 'dashboard',
    title: '5. Dashboard',
    intro: 'The Dashboard is your live view of a connected printer.',
    sections: [
      {
        id: 'message-preview',
        title: 'Message preview',
        body: `The center of the dashboard shows a dot-for-dot preview of the message currently selected on the printer, rendered using the same fonts as the physical print head.\n\n**Bottom alignment:** Single-line messages are anchored to the bottom of the template — exactly matching what the printer hardware prints.`,
        screenshot: '/manual-screenshots/05-dashboard.png',
        callouts: [
          { label: 'Sub-page tabs', text: 'Dashboard / Messages / Setup / Service / Clean — switches the right-side panel for the connected printer' },
          { label: 'Status badge', text: 'READY (green) when jet + HV are running; FAULT (red) when ^LE reports active errors; OFFLINE if 5 polls fail in a row' },
          { label: 'Live message preview', text: 'rendered with authentic BestCode fonts at the same dot-resolution as the print head; updates within 30 s of any change at the printer' },
          { label: 'Ink / Makeup / Filter gauges', text: '4-bar segmented gauges (FULL / GOOD / LOW / EMPTY) with predicted days-remaining badges' },
          { label: 'Bottom toolbar', text: 'Adjust, Service, Counters, Force Print, Jet On/Off, HV — the most-used controls one click away' },
          { label: 'Expiry offset card', text: 'per-printer offset added to expiration date fields; slider edits in absolute days' },
        ],
      },
      {
        id: 'jet-control',
        title: 'Jet & High Voltage control',
        body: `**Jet On / Jet Off** controls the ink jet. Starting the jet shows a 1:06 (66s) countdown — wait for it to finish before printing. Stopping the jet shows a 2:14 (134s) shutdown countdown for clean shutdown.\n\n**HV (High Voltage)** is enabled separately. The printer is only ready to print when both Jet and HV are running.`,
      },
      {
        id: 'fluid-status',
        title: 'Fluid status',
        body: `Ink and Makeup levels are shown as 4-bar gauges:\n\n- **FULL** — fresh bottle\n- **GOOD** — normal operating level\n- **LOW** — refill soon (yellow)\n- **EMPTY** — change immediately (red)\n\nFilter life is tracked separately under Service.`,
      },
      {
        id: 'service',
        title: 'Service screen',
        body: `Click **Service** in the bottom toolbar to view live operating metrics: Modulation (V), Pressure (PSI), Charge (%), RPS, Phase Quality (%), Viscosity (cP), printhead/electronics temperatures, subsystem status (V300UP, VLT, GUT, MOD), and runtime hours.\n\n**Force Print** triggers a single print regardless of photo-eye state — useful for setup and diagnostics.`,
        screenshot: '/manual-screenshots/06-service.png',
        callouts: [
          { label: 'Primary metrics', text: 'Modulation (V), Pressure (PSI), Charge (%), RPS, Phase Quality (%), Viscosity (cP) — live values polled via ^SU' },
          { label: 'Subsystem status', text: 'V300UP / VLT / GUT / MOD on/off indicators — all four must be green for jet to be stable' },
          { label: 'Runtime hours', text: 'Power Hours, Stream Hours, Filter Hours, Pump Hours — read independently via ^TM' },
          { label: 'Temperatures', text: 'Printhead and Electronics temperatures with healthy-range colour coding' },
          { label: 'Force Print', text: 'sends a single print regardless of the photocell — used for ribbon/setup checks' },
        ],
      },
      {
        id: 'adjust',
        title: 'Adjust settings',
        body: `**Adjust** opens the global print-engine settings dialog with editable Width, Height, Delay, Bold, Gap, Pitch, Rotation, and Speed values. Each numeric parameter pairs an inline pencil edit with up/down arrow steppers — perfect for both touchscreen and mouse use. These values apply to all messages on the connected printer.`,
        screenshot: '/manual-screenshots/44-adjust-settings.png',
        callouts: [
          { label: 'Width / Height', text: 'message bounding box on the print head; Width also feeds ^GM Speed and ^PH PadHeight' },
          { label: 'Delay', text: 'milliseconds from photocell trigger to first dot — calibrate this when the print is offset from the product' },
          { label: 'Bold / Gap', text: 'Bold (1-8) horizontal stretch of every dot; Gap (1-8) extra space between characters' },
          { label: 'Pitch', text: 'distance between repeated prints in continuous-flag mode' },
          { label: 'Rotation', text: '0 / 90 / 180 / 270 — rotates the entire message at the print engine' },
          { label: 'Speed', text: 'Fastest or 1-9 — caps the maximum print speed independently of the conveyor encoder' },
          { label: 'Pencil / steppers', text: 'every numeric value supports inline keyboard edit (pencil) and ± steppers (touch-friendly)' },
        ],
      },
      {
        id: 'counters',
        title: 'Counters',
        body: `Click the counter display to open the Counters dialog and view or reset Print Count, Product Count, and any user counters.`,
      },
    ],
  },
  {
    id: 'messages',
    title: '6. Messages',
    intro: 'Create, edit, select, and manage print messages.',
    sections: [
      {
        id: 'message-list',
        title: 'Message list & thumbnail grid',
        body: `The Messages screen shows all messages stored on the printer plus any read-only test messages (BESTCODE, QUANTUM). Use the icons in the top-right to switch between **List view** (compact rows) and **Thumbnail view** (dot-matrix previews of each message rendered in real BestCode fonts).\n\n- **Select** — Make this message the active print job\n- **Edit** — Open the message editor\n- **New** — Create a blank message from a template\n- **Delete** — Remove the message (a 20-second guard prevents accidental re-add)`,
        screenshot: '/manual-screenshots/39-messages-thumbnail.png',
        callouts: [
          { label: 'Message thumbnail', text: 'live dot-matrix preview using the same fonts as the print head; the highlighted card is the currently SELECTED message' },
          { label: 'View toggle', text: 'switches between list (compact rows) and thumbnail (visual grid) — preference is saved per device' },
          { label: 'Search', text: 'live filter across message names; useful when the printer holds 50+ messages' },
          { label: '+ New', text: 'opens the editor with a blank canvas sized for the connected printer\'s template' },
          { label: 'Sticky footer actions', text: 'Select / Edit / Duplicate / Delete on the highlighted message; Broadcast appears for Master printers' },
        ],
      },
      {
        id: 'editor',
        title: 'Message editor',
        body: `The editor is a dot-matrix canvas matching the print head's physical resolution.\n\n**Adding fields:** Click **+ New** and choose Text, Line ID, User Define, AutoCode, Barcode, or Graphic.\n\n**Moving fields:** Click and drag. Use marquee selection (drag in empty space) to select multiple fields.\n\n**Field settings:** With a field selected, the bottom panel shows font size, template, bold, gap (character spacing), rotation, and auto-numerals.\n\n**Saving:** Click **Save**. CodeSync sends ^NM and ^SV to the printer and waits for confirmation. If the printer rejects the message, the exact reason is displayed.`,
        screenshot: '/manual-screenshots/09-message-editor.png',
        callouts: [
          { label: 'Editor toolbar', text: 'Save, Settings, Advanced, Data, Undo/Redo, Zoom — the headline actions for the message' },
          { label: 'Dot-matrix canvas', text: 'every cell is a single printer dot; the grid matches the print head template (25/19/32 dots tall depending on model)' },
          { label: 'Selected field', text: 'click any field to select; drag-to-move; marquee in empty space to multi-select' },
          { label: 'Field Settings panel', text: 'font / template / bold / gap / rotation / auto-numerals for the selected field; updates live as you type' },
          { label: '+ New Field', text: 'opens the field type chooser (Text, Scanned, Line ID, User Define, AutoCode, Barcode, Graphic)' },
          { label: 'Save', text: 'sends ^NM + ^SV to the printer; rejection reason from the firmware is surfaced verbatim if it fails' },
        ],
      },
      {
        id: 'message-settings',
        title: 'Message settings',
        body: `Click **Settings** in the editor toolbar to configure per-message **Speed** (Fastest / 1-9), **Orientation** (Normal / Inverted with one-tap rotate), and **Print Mode** (Normal, Reverse, Mirror, Reverse+Mirror, etc). These settings travel with the message via the ^CM command.`,
        screenshot: '/manual-screenshots/43-message-settings.png',
        callouts: [
          { label: 'Speed', text: 'Fastest or 1-9 — caps the print engine speed for this message regardless of the encoder' },
          { label: 'Orientation', text: 'Normal / Inverted (180° rotate); affects rendering on both the canvas and the print head' },
          { label: 'Print Mode', text: 'Normal, Reverse, Mirror, Reverse+Mirror — sent via the ^CM integer mapping' },
          { label: 'Width', text: 'maps to ^PW PadWidth; also influences ^GM Speed and ^PH PadHeight per HMI parity rules' },
          { label: 'Save', text: 'persists settings with the message; takes effect on the next ^SM select' },
        ],
      },
      {
        id: 'new-field',
        title: 'Adding a new field',
        body: `Click **+ New** to open the field type chooser:\n\n- **Text Field** — static or mixed-case text\n- **Scanned Field** — value supplied by a barcode scan (PC USB scanner or paired mobile camera) at message-select time\n- **Line ID** — resolves to the printer's configured Line ID at print time\n- **User Define** — operator is prompted at message-select time\n- **AutoCode Field** — Time, Date, Counter, or Shift codes\n- **Barcode Field** — 1D & 2D barcodes\n- **Graphic Field** — bitmap from the printer's graphic library`,
        screenshot: '/manual-screenshots/09c-new-field.png',
        callouts: [
          { label: 'Text Field', text: 'static text — supports mixed case (no forced uppercase) and {TOKEN} substitution from prompted/scanned fields' },
          { label: 'Scanned Field', text: 'specialized prompted field — value comes from a barcode scan at select time (USB scanner or paired phone camera)' },
          { label: 'Line ID', text: 'resolves to the connected printer\'s Line ID config at print time — required to be set on the printer record' },
          { label: 'User Define', text: 'operator types the value at message-select time; baked into the message via atomic ^DM+^NM+^SV save' },
          { label: 'AutoCode', text: 'opens the AutoCode chooser (Time / Date / Counter / Shift)' },
          { label: 'Barcode', text: 'opens the Barcode wizard — 10+ types including ECC200 Data Matrix rendered client-side via bwip-js' },
          { label: 'Graphic', text: 'inserts a bitmap from the printer\'s onboard graphic library (TRUPOINT.BMP, LOGO1.BMP, etc.)' },
        ],
      },
      {
        id: 'autocode',
        title: 'AutoCode fields',
        body: `AutoCode fields automatically resolve at print time. Choose:\n\n- **Time Codes** — HH:MM:SS, AM/PM, shift letter\n- **Date Codes** — manufacturing or expiration date with full token control\n- **Counter** — Counter 1-4 (configured under Setup)\n- **Shift Codes** — alphabetic shift indicator`,
        screenshot: '/manual-screenshots/09d-autocode-field.png',
        callouts: [
          { label: 'Time Codes', text: 'HH:MM:SS, AM/PM indicators, shift letter — synced via ^SD with a 500 ms tick' },
          { label: 'Date Codes', text: 'opens the Date Code Builder for full Manufacturing / Expiration token control' },
          { label: 'Counter', text: 'binds to one of the four hardware counters (1-4); configured under Setup → Counters' },
          { label: 'Shift Codes', text: 'alphabetic shift indicator (A/B/C…) using the printer\'s programmable shift mapping' },
        ],
      },
      {
        id: 'date-codes',
        title: 'Date and time codes',
        body: `**Date/Time Code Builder** lets you compose expressions with day/month/year/Julian-day/week tokens for both Manufacturing and Expiration dates.\n\nQuick presets cover common formats (MAY 07,2026 · MM/DD/YY · DD-MM-YYYY · YYYY/MM/DD · HH:MM:SS · Date+Time). Switch to **Build Custom** to compose your own from individual tokens.\n\nExpiration date offsets (e.g. +180 days) are configured per message and per printer. Programmable date/time codes (custom alphabetic mappings) are configured under **Setup → Programmable Date Codes / Time Codes**.`,
        screenshot: '/manual-screenshots/09e-date-code-builder.png',
        callouts: [
          { label: 'Mfg / Exp toggle', text: 'switches between Manufacturing date (today) and Expiration date (today + offset days)' },
          { label: 'Quick presets', text: 'one-click common formats — MAY 07,2026 · MM/DD/YY · DD-MM-YYYY · YYYY/MM/DD · HH:MM:SS · Date+Time' },
          { label: 'Build Custom', text: 'compose any expression from individual tokens — D/R uppercase params for Day, M for month, Y/YY/YYYY for year, W/J for week/Julian' },
          { label: 'Live preview', text: 'shows exactly what the printer will print right now using the configured offset and programmable mappings' },
          { label: 'Offset days input', text: 'add/subtract days from the reference date; printer-level expiry offset is added on top for Exp fields only' },
        ],
      },
      {
        id: 'counters',
        title: 'Counter fields',
        body: `The printer maintains four hardware counters (Counter 1-4). Each can be inserted into a message as an AutoCode field. Configure starting value, increment, min/max, and reset behavior under **Setup → Counters**.`,
        screenshot: '/manual-screenshots/09f-counter-field.png',
      },
      {
        id: 'fonts',
        title: 'Fonts',
        body: `Nine authentic printer fonts are available:\n\n- **Standard 5 / 7 / 9 / 12 / 16 / 24 / 32 High** — proportional sans\n- **Narrow 7 High** — condensed\n- **Standard 7 High Plain Zero** — for serial numbers (no slashed zero)\n\nFont height cannot exceed the template height. Model 82 is limited to 25 dots, Model 86 to 19 dots, Model 88 to 32 dots.`,
      },
      {
        id: 'barcodes',
        title: 'Barcodes',
        body: `Over 10 barcode types are supported including Code 128, Code 39, EAN-13, UPC-A, QR Code, and Data Matrix (ECC200).\n\n**Encoding options:** Human-readable on/off, checksum auto/manual, start code (A/B/C for Code 128), magnification multiplier (1×-8×).\n\n**Data sources:** Keyboard (static), AutoCode (date/time/counter), or User Define (operator prompt).\n\n**QR / Data Matrix size limits:** A 25-dot print head can only fit a 25x25 matrix (~47 characters). Use the URL Shortener for long compliance URLs.\n\nData Matrix is rendered client-side using bwip-js for cross-firmware compatibility.`,
        screenshot: '/manual-screenshots/09g-barcode-field.png',
        callouts: [
          { label: 'Symbology', text: 'Code 128 / Code 39 / EAN-13 / UPC-A / QR / Data Matrix (ECC200) and more — each has its own size and character-set rules' },
          { label: 'Data source', text: 'Keyboard (static), AutoCode (date/counter), User Define (prompted), or {TOKEN} reference' },
          { label: 'Magnification', text: '1×-8× — maps to bold + 1 multiplier per the v2.6 protocol; affects both bar width and total width' },
          { label: 'Human-readable', text: 'toggles the printed text caption beneath the bars' },
          { label: 'Matrix size', text: 'fixed 16×16 / 18×18 / 20×20 / 22×22 / 24×24 — picked based on data length and head height' },
          { label: 'Live preview', text: 'rendered client-side via bwip-js so what you see is exactly what the printer will print' },
        ],
      },
      {
        id: 'graphics',
        title: 'Graphic fields',
        body: `Insert any bitmap from the printer's onboard graphic library (logos, warning symbols, regulatory marks). The Graphics dialog lists each graphic by number and name (TRUPOINT.BMP, LOGO1.BMP, etc.) — click to insert.`,
        screenshot: '/manual-screenshots/09h-graphic-field.png',
        callouts: [
          { label: 'Graphic library list', text: 'every bitmap stored in the printer\'s onboard memory, listed by number + filename' },
          { label: 'Preview pane', text: 'shows the selected graphic at its native resolution' },
          { label: 'Insert', text: 'places the graphic on the canvas at the cursor position; resize is not supported (bitmaps print at native size)' },
        ],
      },
      {
        id: 'user-define',
        title: 'User Define (operator-prompted) fields',
        body: `User Define fields prompt the operator for input each time the message is selected for printing. Configure the **Prompt Label** (e.g. "LOT CODE") and **Max Characters**. Perfect for batch numbers, lot codes, and operator initials that change between runs.`,
        screenshot: '/manual-screenshots/09i-user-define.png',
        callouts: [
          { label: 'Prompt Label', text: 'shown to the operator at select time and used as the {TOKEN} name for cross-field references' },
          { label: 'Max Characters', text: 'enforced at prompt time; also used to size the placeholder block on the canvas' },
          { label: 'Default value', text: 'pre-fills the operator prompt — useful for setup pieces or "no change" defaults' },
          { label: 'Save', text: 'value is baked into the message via atomic ^DM + ^NM + ^SV at select time, then ^SM selects the new copy' },
        ],
      },
      {
        id: 'scanned-field',
        title: 'Scanned fields (barcode capture)',
        body: `**Scanned Field** is a specialized prompted field whose value comes from a barcode scan instead of typed input. Use it for serialized cartons, METRC tags, lot stickers, and any workflow where the operator already has a printed code in front of them.\n\n**Creating one:**\n1. In the editor, click **+ New** and pick **Scanned Field**\n2. Set the **Prompt Label** (e.g. "SCAN UID") and **Max Length**\n3. Place the field on the canvas like any other text field\n\n**At print-select time** the operator sees a scan dialog instead of a keyboard. They can:\n\n- Scan with a **USB / wedge scanner** plugged into the PC (most reliable)\n- Scan with a **paired mobile phone's camera** — the request appears automatically on the phone, the result is pushed back to the PC and applied to the message (see Chapter 13)\n- Type the value manually as a fallback\n\nThe scanned value is baked into the message via the same atomic ^DM + ^NM + ^SV save flow used by User Define, so the printer always prints exactly what was scanned — no race conditions.\n\n**Token linking:** Scanned (and User Define) fields can be referenced from other fields using {LABEL} placeholders, so one scan can populate a barcode, a date code, and a human-readable text field at the same time. Edit any text field and type the prompt label inside curly braces, e.g. \`Lot {LOT CODE}\`.`,
      },
      {
        id: 'data-link',
        title: 'Data Link (Variable Data Printing)',
        body: `Data Link maps columns from a CSV, REST API, or database to fields in your message — perfect for serialization, batch coding, and METRC compliance.\n\n1. Open **Data Source** from the sidebar (or top nav)\n2. Import a CSV, configure a hotfolder, or connect via REST/ODBC\n3. In the message editor, click **Data** and pick the source — every column appears in the mapping table\n4. Assign each column to a field number (F1, F2, F3…) shown on the canvas. METRC sources auto-highlight Tag and Retail ID columns in green for one-click setup.\n5. Start a Print Job — each Print Go advances to the next row`,
        screenshot: '/manual-screenshots/42-data-link.png',
        callouts: [
          { label: 'Data Source picker', text: 'every imported source from the Data Source screen — CSV, hotfolder, REST, ODBC' },
          { label: 'Column → Field mapping', text: 'drag or pick the F-number; one column can be mapped to multiple fields simultaneously' },
          { label: 'METRC auto-highlight', text: 'METRC exports auto-highlight Tag and Retail ID columns in green for one-click setup' },
          { label: 'Preview row', text: 'shows what the next print will look like with the upcoming row\'s data' },
          { label: 'Save & Start Job', text: 'creates a Print Job; each Print Go from the printer advances to the next row' },
        ],
      },
      {
        id: 'advanced-settings',
        title: 'Advanced field settings',
        body: `Click **Advanced** in the editor toolbar to open per-field advanced options organized into four tabs:\n\n- **General** — Default Settings, Auto-Numerals (auto-incrementing serial), Inverse Print, Auto Align Fields\n- **Date / Time** — Per-field offsets and reference date overrides\n- **Counters** — Bind the field to one of the four hardware counters (1-4)\n- **Print Mode** — Per-field Print Mode override, Delay, Pitch, Select Code, and Repeat — used for high-speed VDP and Print-Go workflows`,
        screenshot: '/manual-screenshots/40-advanced-settings.png',
        callouts: [
          { label: 'Tab bar', text: 'General / Date-Time / Counters / Print Mode — four logical groupings of per-field overrides' },
          { label: 'Auto-Numerals', text: 'turn the field into an auto-incrementing serial; pick start, increment, min, max, and reset behaviour' },
          { label: 'Inverse Print', text: 'prints the field as white-on-black (within its bounding box) — useful for emphasising lot codes' },
          { label: 'Per-field Date/Time offset', text: 'override the message-level offset on a single field (e.g. a "Best Before" field +90 days while the Mfg field uses today)' },
          { label: 'Counter binding', text: 'bind to Counter 1-4; advances on every Print Go from the printer' },
          { label: 'Print Mode override', text: 'overrides the message-level Print Mode (Reverse / Mirror) for one field — used for compound symbol layouts' },
        ],
      },
    ],
  },
  {
    id: 'reports',
    title: '7. Production Reports',
    intro: 'Track production runs, downtime, OEE, and custom metrics.',
    sections: [
      {
        id: 'report-types',
        title: 'Report types',
        body: `Four report types are available, selectable from the cards at the top of the Reports screen:\n\n- **OEE Report** — Availability × Performance × Quality with run drill-down and downtime tracking\n- **Production Summary** — How many units, how long, what rate (no targets needed)\n- **Shift Report** — Production grouped by configurable shifts (Day / Swing / Night by default)\n- **Custom** — Build your own report with selectable metrics, groupings, and visualizations; save as templates`,
        screenshot: '/manual-screenshots/24-reports-type-scope.png',
        callouts: [
          { label: 'Report type cards', text: 'OEE / Production Summary / Shift / Custom — clicking switches the entire panel below' },
          { label: 'Time scope bar', text: 'quick presets (Today, Yesterday, This Week, Last 7d, Last 30d, Last 90d, This Month, Last Month) plus Custom range' },
          { label: 'Group by', text: 'Day / Week / Month — drives trend chart bucketing' },
          { label: 'Printer filter', text: 'all printers or a subset — useful for comparing performance across lines' },
          { label: 'Selected range readout', text: 'absolute date range that the report is currently showing' },
        ],
      },
      {
        id: 'time-scope',
        title: 'Time scope & filters',
        body: `For Production Summary, Shift, and OEE reports, choose a quick preset (Today, Yesterday, This Week, Last 7d, Last 30d, Last 90d, This Month, Last Month) or click **Custom** to pick a date range.\n\n**Group by:** Day, Week, or Month for trend charts.\n\n**Printer filter:** All printers or a subset — useful for comparing performance across lines.\n\nThe selected range is shown on the right (e.g. "Mar 19 – Apr 18, 2026").`,
        screenshot: '/manual-screenshots/11-reports-production.png',
        callouts: [
          { label: 'KPI cards', text: 'Produced, Run Time, Units/Hour at a glance — recomputed from the same dataset that feeds the trend chart' },
          { label: 'Production trend chart', text: 'time-series of produced units bucketed by your Group By choice' },
          { label: 'Run history table', text: 'every production run within the time scope; click any row to drill into the OEE detail' },
          { label: 'Download', text: 'PDF report or CSV raw data — same Download menu as every other report type' },
        ],
      },
      {
        id: 'oee-report',
        title: 'OEE report',
        body: `The OEE Report shows the classic three-factor breakdown — **Availability × Performance × Quality** — with a per-run table and downtime event tracking.\n\nUse **+ New Run** to log a production run with a target count, then add downtime events (with reasons) as they happen. End the run to lock in the final OEE.`,
        screenshot: '/manual-screenshots/10-reports-oee.png',
        callouts: [
          { label: 'OEE % headline', text: 'Availability × Performance × Quality — colour-coded against the world-class 85% benchmark' },
          { label: 'Three factor breakdown', text: 'each factor shown as its own card with the underlying ratio (run time / planned, produced / target, good / produced)' },
          { label: 'Downtime Pareto', text: 'sorted bar chart of downtime by reason — instantly shows the biggest losses' },
          { label: 'Run table', text: 'every run with start/end, target, actual, downtime total — click to expand for the per-event log' },
          { label: '+ New Run', text: 'starts a new run with a target count; record downtime events as they happen' },
        ],
      },
      {
        id: 'shift-report',
        title: 'Shift report',
        body: `Production totals split into **Day / Swing / Night** shift cards (default times shown at the top of the report). Each card shows produced units, target, run time, OEE, and run count.\n\nThe **Shift Comparison** chart below visualizes the three shifts side-by-side across the selected date range.\n\nClick **⚙ Configure Shifts** to change the start/end times.`,
        screenshot: '/manual-screenshots/25-shift-report.png',
        callouts: [
          { label: 'Shift cards', text: 'Day / Swing / Night with produced units, target, run time, OEE, run count' },
          { label: 'Shift Comparison chart', text: 'side-by-side view of the three shifts across the selected date range' },
          { label: 'Configure Shifts', text: 'edit the start/end time of each shift; defaults are Day 06-14, Swing 14-22, Night 22-06' },
        ],
      },
      {
        id: 'custom-empty',
        title: 'Custom reports — getting started',
        body: `When you first open the **Custom** tab, no templates exist yet. Click **+ Create Template** (or **+ New Template** in the templates bar) to open the builder.\n\nSaved templates appear as chips at the top — click one to load it, or use the ⋮ menu to **Edit**, **Duplicate**, or **Delete**.`,
        screenshot: '/manual-screenshots/26-custom-empty.png',
      },
      {
        id: 'custom-builder',
        title: 'Custom report builder',
        body: `The builder dialog lets you assemble a report from any combination of metrics and visualizations:\n\n**Metrics (13):** Produced, Target, Attainment %, Run Time, Downtime, Downtime by Reason, Units/Hour, OEE, Availability, Performance, Run Count, Avg Run Duration, Top Messages.\n\n**Visualizations (7):** KPI Cards, Production Trend, Downtime Pareto, OEE Trend, Shift Comparison, Message Breakdown (pie), Hourly Heatmap.\n\n**Group by:** Printer, Shift, Day, Week, Month, or Message.\n\nGive the template a name and **Save** — it appears as a chip above the report and can be edited, duplicated, or deleted at any time.`,
        screenshot: '/manual-screenshots/27-custom-builder.png',
        callouts: [
          { label: 'Template name', text: 'shown as a chip in the templates bar after Save; rename any time via ⋮ → Edit' },
          { label: 'Metrics checklist', text: '13 metrics — pick any combination; each appears as a KPI card or a row in the chosen viz' },
          { label: 'Visualization picker', text: '7 chart types: KPI Cards, Production Trend, Downtime Pareto, OEE Trend, Shift Comparison, Message Breakdown (pie), Hourly Heatmap' },
          { label: 'Group by', text: 'Printer / Shift / Day / Week / Month / Message — drives the X-axis or row grouping' },
          { label: 'Save Template', text: 'persists locally; appears as a chip at the top of the Reports screen for one-click recall' },
        ],
      },
      {
        id: 'export',
        title: 'Exporting reports',
        body: `The **Download** button in the report header offers two formats:\n\n- **PDF Report** — Multi-page formatted report with KPIs, charts, and tables, suitable for sharing or archival\n- **CSV (raw data)** — Underlying production runs for spreadsheet analysis (Excel, Google Sheets)\n\nFilenames include the report type and date stamp (e.g. \`production-summary-2026-04-18.pdf\`).`,
        screenshot: '/manual-screenshots/28-download-menu.png',
        callouts: [
          { label: 'PDF Report', text: 'multi-page branded PDF with KPIs, charts, and tables — keeps page content together (no mid-table page breaks)' },
          { label: 'CSV (raw data)', text: 'every production run flat in a single CSV — best for further Excel / pivot-table analysis' },
          { label: 'Filename pattern', text: 'report-type + date stamp, e.g. production-summary-2026-04-18.pdf' },
        ],
      },
      {
        id: 'new-run',
        title: 'Logging production runs',
        body: `In the OEE Report tab, click **+ New Run** to start logging a production run with a target count and start time. Add downtime events (with reasons like Printer Error, Ink Empty, Mechanical, Material) as they happen. End the run to lock in the final OEE.`,
      },
    ],
  },
  {
    id: 'consumables',
    title: '8. Consumables',
    intro: 'Track ink, makeup, and filter inventory; get alerts before you run out.',
    sections: [
      {
        id: 'configuration',
        title: 'Per-printer configuration',
        body: `For each printer, set the part number used for **Makeup**, **Ink**, and **Filter**. The system tracks fluid level transitions (FULL → GOOD → LOW → EMPTY) and only deducts stock when a bottle reaches LOW or EMPTY — never on a refill.\n\nFilter life is computed from the printer's ^TM (Runtime) hours against the user-configured filter rating (2,000 / 5,000 / 10,000 hours).`,
        screenshot: '/manual-screenshots/14-consumables.png',
      },
      {
        id: 'add-consumable',
        title: 'Adding a consumable',
        body: `Click **+ Add Consumable** to register a part you keep on hand. **Stock Unit vs Reorder Unit:** Stock Unit is the individual countable item (e.g. Bottles); Reorder Unit is what you order from the supplier (e.g. Cases, with Per-Reorder-Unit indicating bottles per case). This distinction lets CodeSync correctly calculate when to reorder.`,
        screenshot: '/manual-screenshots/14b-add-consumable.png',
      },
      {
        id: 'stock',
        title: 'Stock inventory',
        body: `The right-hand panel lists every registered part with a segmented stock gauge and the current count vs the minimum threshold. A **LOW** badge appears as soon as quantity drops at or below the reorder point.\n\nUse **+ Add** to receive new stock, **− Use** to record a manual deduction, and **Order** to launch your supplier site (configurable in Reorder Settings).`,
        screenshot: '/manual-screenshots/34-consumables-stock.png',
        callouts: [
          { label: 'Stock gauge', text: 'segmented bar showing current quantity vs the configured minimum threshold' },
          { label: 'LOW badge', text: 'turns amber as soon as quantity drops at or below the reorder point' },
          { label: '+ Add / − Use', text: 'manually receive new stock or record a deduction outside the auto-tracking flow' },
          { label: 'Order', text: 'launches your configured reorder action (supplier site, email, or clipboard)' },
        ],
      },
      {
        id: 'reorder-settings',
        title: 'Reorder Settings',
        body: `The gear icon at the top opens **Reorder Settings**. Choose what happens when you click the **Order** button: open your supplier's website, send an email to a purchasing address, or copy a pre-formatted purchase request to the clipboard.`,
        screenshot: '/manual-screenshots/35-reorder-settings.png',
      },
      {
        id: 'filter-tracking',
        title: 'Filter tracking',
        body: `Click **Set Up Filter Tracking** on any printer to enable filter life monitoring. Pick the rated filter size (2,000 / 5,000 / 10,000 hours); CodeSync reads **Current Pump Hours** live from the printer via the ^TM command and computes Filter Life Remaining automatically.\n\nWhen the remaining life drops below 10 % the filter card turns amber on the dashboard.`,
        screenshot: '/manual-screenshots/36-filter-tracking.png',
        callouts: [
          { label: 'Filter rating selector', text: '2,000 / 5,000 / 10,000 hour filter — pick what you have installed' },
          { label: 'Current Pump Hours', text: 'live from the printer via ^TM — authoritative for life calculation' },
          { label: 'Filter Life Remaining', text: 'computed automatically; turns amber under 10% and red at 0' },
          { label: 'Reset filter', text: 'use after a physical filter change to zero the counter against the new rating' },
        ],
      },
      {
        id: 'predictions',
        title: 'Predictions & forecasts',
        body: `Based on average fluid-level transition rates, CodeSync forecasts how many days until each consumable runs out and surfaces a coloured prediction badge on the dashboard. The Smart Reorder banner highlights items that will deplete before your next typical reorder cycle so you can pre-order with confidence.`,
      },
    ],
  },
  {
    id: 'setup',
    title: '9. Setup',
    intro: 'Printer-level configuration: counters, programmable date/time codes, network, line ID.',
    sections: [
      {
        id: 'counters',
        title: 'Counters',
        body: `View and reset Print Count, Product Count, and Run Count. Counters are polled every 3 seconds via the ^CN command.`,
      },
      {
        id: 'date-codes',
        title: 'Programmable date codes',
        body: `Define custom alphabetic mappings for date components (e.g. month "01" → "A"). The single-item-at-a-time editor matches the printer's HMI behavior. Saved codes are sent via ^DC.\n\n**Categories:** Year, Month, Day of Year, Day of Month, Week, Day of Week, plus a Select Current Day shortcut.`,
        screenshot: '/manual-screenshots/11-program-date-codes.png',
      },
      {
        id: 'time-codes',
        title: 'Programmable time codes',
        body: `Same pattern as date codes but for time components — useful for shift coding. Each entry shows the YEAR / hour / minute alongside its custom CODE value.`,
        screenshot: '/manual-screenshots/12-program-year.png',
      },
      {
        id: 'network',
        title: 'Network configuration',
        body: `Configure the printer's IP address, subnet mask, gateway, and **Line ID** — a per-printer identifier used by Line ID fields in messages. If no Line ID is configured, messages with Line ID fields will be blocked from printing.`,
        screenshot: '/manual-screenshots/10-setup.png',
      },
    ],
  },
  {
    id: 'service',
    title: '10. Service & Diagnostics',
    intro: 'Monitor printer health, view runtime hours, and run diagnostic procedures.',
    sections: [
      {
        id: 'service-detail',
        title: 'Service screen',
        body: `Click the **Service** tab in the bottom navigation to open the full service dialog.\n\n**Primary Metrics** — Modulation (Volts), Pressure (PSI), Charge (%), RPS (rev/s), Phase Quality (%), Viscosity (cP).\n\n**Subsystems** — V300UP, VLT, GUT, MOD on/off states.\n\n**Consumables** — current ink and makeup levels, plus printhead and electronics temperature.\n\n**System Info** — Allow Errors, Error Active, runtime hours, and firmware/model identification.`,
        screenshot: '/manual-screenshots/29-service-detail.png',
      },
      {
        id: 'counters',
        title: 'Counters dialog',
        body: `Click the **Reset** button next to the print count on the dashboard to open the **Counters** dialog. CodeSync mirrors the printer's four user counters plus Product Count and Print Count.\n\nEach counter has:\n- A **pencil** icon to manually set its value\n- A **rotate** icon to reset just that counter\n\nThe red **Reset All Counters** button at the bottom resets every counter at once.\n\nCounter values are polled via ^CN every 3 seconds and are the authoritative source.`,
        screenshot: '/manual-screenshots/30-counters-dialog.png',
      },
      {
        id: 'runtime',
        title: 'Runtime metrics',
        body: `The Service screen shows runtime hours queried via ^TM independently from the regular status poll for fresh data:\n\n- **Power Hours** — total time powered on\n- **Stream Hours** — total time the jet has run\n- **Filter Hours** — hours since last filter change\n- **Pump Hours** — pump runtime`,
      },
      {
        id: 'fault-codes',
        title: 'Fault codes',
        body: `Active faults are shown with the official BestCode fault code, description, and a photo of the relevant component when available. The ^LE command is the authoritative source for active errors. A red **WARNING** badge appears on the printer card in the sidebar; click it to view active fault details.\n\nFault Alerts auto-popup as a modal when a new error is detected so operators don't miss critical issues.`,
      },
      {
        id: 'diagnostic-test',
        title: 'Diagnostic test procedure',
        body: `Open the standalone **Telnet Diagnostics** tool by navigating to \`#/diagnostics\` (or via the dev panel). It opens with a **Pre-Flight Checklist** that confirms the basics — printer powered on, ethernet connected, Remote Comms enabled, IP matches, no other Telnet sessions, same subnet — before any tests run.\n\nClick **Skip** on the checklist (or check all 6 items) to reveal the 7-phase test suite:\n\n1. **Can We Reach the Printer?** — basic TCP connectivity\n2. **Does the Printer Understand Us?** — all main protocol commands\n3. **Is the Connection Stable?** — long-duration reliability\n4. **How Long to Reconnect?** — drop/recover timing\n5. **Edge Cases & Limits** — concurrent sessions, malformed input\n6. **Network Quality (WiFi vs Wired)**\n7. **App Build & Deployment** — Electron, auto-updater, relay server\n\nClick **Run All Tests** or expand a phase to run individual tests. Use **Copy Report** to paste the full results into Lovable chat for analysis.`,
        screenshot: '/manual-screenshots/31-diagnostics-checklist.png',
      },
      {
        id: 'diagnostic-phases',
        title: 'Diagnostic test phases',
        body: `The full 7-phase test suite covers 26 individual tests. Each phase shows a Pass/Fail/Not Run status and can be expanded for per-test details. Use the **Download** button to save the report as a JSON file, or **Copy Report** to share results with support.`,
        screenshot: '/manual-screenshots/32-diagnostics-phases.png',
      },
      {
        id: 'raw-terminal',
        title: 'Raw Telnet terminal',
        body: `The **Raw Terminal** tab provides a manual command interface for advanced troubleshooting. Click **Connect** to open a Telnet session, then send any v2.6 protocol command (^SU, ^VV, ^LE, ^LM, ^SD, ^TP and more are pre-set as quick-command buttons).\n\n**Show hex dump** displays raw byte responses — useful for diagnosing character encoding or protocol framing issues.`,
        screenshot: '/manual-screenshots/33-diagnostics-terminal.png',
      },
      {
        id: 'clean',
        title: 'Clean & maintenance',
        body: `Note: Remote Clean and Flush operations are NOT supported by the BestCode v2.0/v2.6 protocol. Cleaning must be performed at the printer's front panel. The Clean tab in CodeSync provides reference instructions and a maintenance log only.`,
      },
    ],
  },
  {
    id: 'wire-cable',
    title: '11. Wire & Cable',
    intro: 'Specialized high-speed marking view for cable and wire applications.',
    sections: [
      {
        id: 'wire-overview',
        title: 'Overview',
        body: `The Wire & Cable screen is purpose-built for marking continuous wire and cable.\n\n**Features:**\n- Metric / Imperial unit toggle\n- Distance estimation based on encoder pulses\n- Pitch (mark spacing) configuration\n- Encoder calibration wizard\n- Flip-flop mode for alternating top/bottom marks\n- Live distance counter and animated cable visualization`,
        screenshot: '/manual-screenshots/13-wire-cable.png',
      },
      {
        id: 'encoder',
        title: 'Encoder calibration & Flip-Flop',
        body: `**Encoder Calibration:** Set Wheel Diameter and Pulses Per Revolution (PPR). CodeSync calculates the resulting Resolution (mm/pulse and in/pulse) automatically.\n\n**Flip-Flop Rotation:** Alternates print orientation on each print so the code is readable from either side of the cable. Configure Odd Prints (e.g. Normal) and Even Prints (e.g. Flip) independently.`,
        screenshot: '/manual-screenshots/14-encoder-flipflop.png',
      },
    ],
  },
  {
    id: 'data-source',
    title: '12. Data Source',
    intro: 'Import variable data for serialization, batch coding, and compliance printing.',
    sections: [
      {
        id: 'sources',
        title: 'Supported sources',
        body: `The Data Sources screen lists every imported dataset. Each row shows the source name, column count, and row count. Click a source to preview its data inline. Use the dashed drop zone to quickly import a CSV file.\n\n- **CSV upload** — Local file import with column auto-detection\n- **Hotfolder** — Watch a folder for new CSV drops (Desktop only)\n- **REST API / Webhook** — Push data from CANIX, METRC, or any ERP via HTTP POST\n- **ODBC / SQL** — Direct database connection (Desktop only, DATABASE tier)\n\nMETRC cannabis tracking exports are auto-detected by header keywords (Unit Quantity, Package, Tag).`,
        screenshot: '/manual-screenshots/17-data-sources.png',
      },
      {
        id: 'preview',
        title: 'Inline data preview',
        body: `Selecting a source opens a scrollable inline grid showing every column and row, including a green METRC badge when applicable. This is the same data your messages will pull from at print time — verify it before creating a print job.`,
        screenshot: '/manual-screenshots/18-inline-grid.png',
      },
      {
        id: 'wizard',
        title: 'Add Database Connection wizard',
        body: `Click **Wizard** to walk through a 4-step import:\n\n1. **Type** — choose CSV/Text File or METRC/Retail ID\n2. **File** — name the source and drop your CSV; METRC exports are auto-mapped\n3. **Columns** — confirm detected column types\n4. **Review** — confirm and save\n\nThe wizard handles encoding detection, header normalization, and METRC's Unit Code / Retail ID column auto-mapping.`,
        screenshot: '/manual-screenshots/19-wizard-step1.png',
      },
      {
        id: 'wizard-file',
        title: 'Selecting the data file',
        body: `Step 2 of the wizard: give the source a friendly name (e.g. "METRC Tags March 2026") and either drag-and-drop your CSV/TXT file or click to browse. METRC exports are auto-detected and the Unit Code + Retail ID columns are mapped automatically — no manual configuration needed.`,
        screenshot: '/manual-screenshots/20-wizard-step2.png',
      },
      {
        id: 'mapping',
        title: 'Field mapping',
        body: `After importing, map data columns to message fields. A single column can be mapped to multiple fields simultaneously. Barcode prefixes (e.g. ]Q3 for QR ECC200) are preserved.\n\nFor METRC Retail ID, a pre-built template places a QR code at x:0 y:7 and the readable text at x:38 y:17 — optimized for 25-dot heads at ~200 units/min.`,
      },
      {
        id: 'integrations',
        title: 'API & automated ingestion',
        body: `The **Integrations** tab provides three automated ingestion paths so you don't have to manually upload files:\n\n- **API / Webhook Endpoint** — A unique HTTPS URL + API key. CANIX, METRC, or any ERP can POST JSON or CSV. Use \`?mode=append\` to add rows to an existing source.\n- **Watched Folder (Hotfolder)** — Monitor a local/network folder for new CSVs (Desktop only)\n- **Database Connection** — ODBC/MySQL polling (Desktop only)\n\nCopy the endpoint and API key directly from this screen.`,
        screenshot: '/manual-screenshots/22-integrations.png',
      },
      {
        id: 'print-jobs',
        title: 'Creating and running a print job',
        body: `Click **Print Job** to bind a Data Source to a Target Message:\n\n- **Data Source** — pick any imported source\n- **Target Message** — pick any saved message that contains data-link fields\n- **Manual Print Go (^PT)** — when on, CodeSync sends a force-print after each row (no photocell needed). Turn off when using a real photocell trigger.\n\nCreated jobs appear in the **Print Jobs** tab with a status pill (ready / running / paused / done) and a Run button. Each Print Go from the printer advances to the next data row.`,
        screenshot: '/manual-screenshots/21-create-print-job.png',
      },
      {
        id: 'job-list',
        title: 'Managing active print jobs',
        body: `The **Print Jobs** tab lists every saved job with the source name, message name, current row / total rows, and status. Use **Run** to start a job and the trash icon to delete one. Job state persists across sessions — you can resume a partially-completed job after a restart.`,
        screenshot: '/manual-screenshots/23-print-jobs.png',
      },
    ],
  },
  {
    id: 'mobile',
    title: '13. Mobile Companion',
    intro: 'Use a phone or tablet to monitor and control printers paired with your PC. Multiple phones can be paired to a single license.',
    sections: [
      {
        id: 'pc-side-pairing',
        title: 'Generating a pairing code (PC)',
        body: `On the PC there are **two ways** to open the Pair Mobile dialog:\n\n- **Top bar shortcut** — click the **QR code icon** (primary blue) in the header. This is the fastest way and is always one click away.\n- **License Activation** — open the activation dialog from the printers sidebar footer, then click **Pair Mobile**.\n\nThe Pair Mobile dialog is split into two clearly numbered steps:\n\n**Step 1 — Install the PWA on the phone.** A QR code links the phone's browser to \`https://bestcode-codesync.lovable.app\`. The dialog also shows the platform-specific "Add to Home Screen" instructions for iOS Safari and Android Chrome — operators only need to do this once per phone.\n\n**Step 2 — Pair.** A second QR code (and a 6-character PIN) is valid for 5 minutes. The same dialog lists every currently paired phone (machine ID, paired-at, last-seen) with an **Unpair** button per row, refreshing every 5 seconds.\n\nGenerating a new pairing code only expires older *pending* codes — already-paired phones stay connected.`,
        screenshot: '/manual-screenshots/48-pair-mobile-qr.png',
      },
      {
        id: 'mobile-side-pairing',
        title: 'Joining from the phone',
        body: `Once the PWA is installed (Step 1 above):\n\n1. Open CodeSync from the phone's home screen\n2. On the License Activation screen, tap **Pair with PC**\n3. Either scan the **Step 2** QR code with the phone's camera or type the 6-character PIN\n4. Tap **Pair with PC** — the phone is now bound to the PC's license as a Companion session\n\nThe phone now shares the PC's license and can monitor printers, fulfil scan requests, and remotely control polling. To leave the pairing later, open License Activation on the phone and tap **Unpair Device**.`,
        screenshot: '/manual-screenshots/46-pair-with-pc-mobile.png',
      },
      {
        id: 'connect-via-pc',
        title: 'Connect via PC (relay mode)',
        body: `Mobile devices cannot reach factory printers directly — printer traffic is relayed through the host PC over an HTTP relay on port **8766**.\n\n1. From the mobile PWA, tap the **Smartphone** icon in the top bar (turns green when connected)\n2. Enter the **PC IP Address** (e.g. 192.168.1.50) and confirm port 8766\n3. Tap **Test Connection** — a green confirmation shows the CodeSync version detected on the PC\n4. Tap **Use This PC**\n\nBoth devices must be on the same WiFi network. To switch PCs later, tap **Disconnect from PC** at the bottom of the dialog. The Smartphone icon is hidden on desktop browsers — it only appears on actual phones/tablets.`,
        screenshot: '/manual-screenshots/49-relay-connect.png',
      },
      {
        id: 'mobile-scan',
        title: 'Mobile scan companion',
        body: `Once paired, the phone can act as a **wireless barcode scanner** for the PC. Whenever the operator selects a message that contains a Scanned Field (Chapter 6), CodeSync raises a scan request that automatically appears on every paired phone.\n\n**On the phone:**\n\n1. A floating **Scan** pill appears at the bottom-right and pulses when a request is pending\n2. Tap it (or open the **/scan** page directly) to launch the camera scanner\n3. Aim at the barcode — the value is decoded, sent to the PC, and the scan dialog on the PC closes automatically\n4. The PC bakes the scanned value into the message and selects it on the printer\n\nThe PC scan dialog also accepts USB / wedge scanners and manual typing as fallbacks, so the mobile companion is optional. Multiple paired phones can fulfil a scan — first one wins.`,
      },
      {
        id: 'broadcast-master-slave',
        title: 'Broadcast & Master/Slave',
        body: `When a printer is configured as **Master** (in Edit Printer → Sync Role), CodeSync can broadcast a single message to every Slave on its line:\n\n- **Message broadcast** — pick the message, optionally type a different **User Define** value per slave (different lot numbers, expiry offsets), then broadcast in one click\n- **Selection sync** — selecting a message on the Master automatically selects it on every online Slave (offline slaves are skipped)\n- **Per-printer offsets** — each slave keeps its own expiry offset; the broadcast does not overwrite it unless you explicitly enter a value\n\nMaster/Slave is configured per printer; only printers with role = Master see the **Broadcast** action in the Messages screen.`,
      },
      {
        id: 'remote-pause',
        title: 'Remote polling pause',
        body: `Mobile users can remotely pause the PC's TCP polling via a floating button — useful when a technician needs uninterrupted access from the printer's front panel. A 5-minute safety timer auto-resumes polling if the user forgets.`,
      },
    ],
  },
  {
    id: 'training-feedback',
    title: '14. Training Videos & Feedback',
    intro: 'Built-in tutorials and a way to send issues directly to BestCode.',
    sections: [
      {
        id: 'training',
        title: 'Training Videos',
        body: `Click the video icon (🎥) in the top bar to access a library of training videos covering setup, message creation, troubleshooting, and best practices. Videos stream from secure cloud storage.\n\nWhen no videos are available the screen shows an empty placeholder. As BestCode publishes new tutorials they appear here automatically — no application update required.`,
        screenshot: '/manual-screenshots/37-training-videos.png',
      },
      {
        id: 'feedback',
        title: 'Sending feedback',
        body: `Click the speech bubble icon (💬) to open the Feedback dialog.\n\n- Choose **Bug Report** or **Feature Request** (or General Feedback)\n- Describe the issue with as much detail as possible (up to 2,000 characters)\n- Attach up to 3 screenshots — drag-and-drop or click **Add**\n- Click **Submit Feedback**\n\nFeedback goes directly to BestCode engineering with the app version and your context attached. Screenshots are stored in a secure private bucket and are only visible to BestCode staff.`,
        screenshot: '/manual-screenshots/38-feedback-bug.png',
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: '15. Troubleshooting',
    intro: 'Common issues and how to resolve them.',
    sections: [
      {
        id: 'offline',
        title: 'Printer shows OFFLINE',
        body: `**Causes & fixes:**\n\n1. **IP address wrong** — verify on the printer's front panel (Network menu) matches CodeSync's printer record\n2. **Different subnet** — PC and printer must share the same subnet (e.g. both 192.168.1.x)\n3. **Telnet disabled** — enable Remote Comms / Telnet on the printer's front panel\n4. **Firewall** — Windows Defender may block port 23; allow CodeSync through\n5. **Cable / switch** — try a different ethernet cable or port\n\nIf five consecutive polls fail (15 seconds), the printer is marked offline.`,
      },
      {
        id: 'message-rejected',
        title: 'Printer rejects a message',
        body: `When the printer rejects a Save (^NM), CodeSync displays the raw rejection reason (e.g. "? 5: Invalid parameter").\n\n**Common causes:**\n- Font height exceeds template height\n- Field positioned outside template bounds\n- Reserved character in message name\n- QR code data exceeds matrix capacity for the print head height`,
      },
      {
        id: 'qr-too-big',
        title: 'QR code won\'t fit',
        body: `25-dot heads (Model 82) are physically limited to a 25×25 QR matrix — about 47 characters of alphanumeric data.\n\n**Solutions:**\n- Use the built-in URL Shortener for compliance URLs (130+ chars → 30 chars)\n- Switch to a Model 88 (32-dot) for larger matrices\n- Use Data Matrix instead — more efficient at small sizes`,
      },
      {
        id: 'jet-stuck',
        title: 'Jet startup countdown stuck',
        body: `If the 1:06 startup countdown completes but the printer doesn't show READY:\n\n1. Check fluid levels — empty ink or makeup blocks startup\n2. Check for active faults on the Service screen\n3. Verify HV is enabled (separate control from Jet)\n4. Power cycle the printer if all else fails`,
      },
    ],
  },
  {
    id: 'token-linking',
    title: '16. Token Linking',
    intro: 'Reference one prompted or scanned value from many fields using {LABEL} placeholders. Lets a single scan or operator entry populate a barcode, a date code, and a human-readable text field at the same time — no double entry.',
    sections: [
      {
        id: 'tokens-how-it-works',
        title: 'How tokens work',
        body: `Every **User Define** or **Scanned Field** has a **Prompt Label** (e.g. \`LOT CODE\`, \`SCAN UID\`). That label becomes a token that any other text or barcode field can embed using curly braces:\n\n- A text field with the literal value \`Lot {LOT CODE}\` resolves at print time to \`Lot ABC123\` after the operator types or scans \`ABC123\`.\n- A barcode field whose data is set to \`{SCAN UID}\` resolves to the scanned UID — so a single scan populates both the human-readable text and the barcode.\n- Tokens can be combined in one field: \`Batch {LOT CODE} / Run {RUN ID}\`.\n\n**Resolution order:** scanned values override typed values override defaults. Resolution happens in the same atomic save (^DM + ^NM + ^SV) that bakes prompted values into the message, so the printer always prints exactly the resolved value — no race conditions.`,
      },
      {
        id: 'tokens-creating',
        title: 'Creating linked fields',
        body: `1. Add a **User Define** or **Scanned Field** to your message and give it a unique Prompt Label (uppercase by convention, e.g. \`LOT CODE\`).\n2. Add a regular **Text** or **Barcode** field.\n3. In the field's content, type the label inside curly braces: \`{LOT CODE}\`.\n4. Repeat — the same token can appear in any number of fields.\n\nThe Field Settings panel highlights tokens in blue and warns if a referenced label doesn't exist in the message. Save the message — at print-select time the operator only sees one prompt per unique label, no matter how many fields reference it.`,
      },
      {
        id: 'tokens-counters',
        title: 'Counter tokens',
        body: `Hardware counters (Counter 1-4) are also exposed as tokens (\`{COUNTER 1}\` etc.) so you can mix counter values into text fields without using the AutoCode chooser. Useful for compound serials like \`{LOT CODE}-{COUNTER 1}\`.\n\nCounter tokens always pull the current value at print time, so they stay in sync with the printer's hardware counter (which advances on each Print Go).`,
      },
    ],
  },
  {
    id: 'twin-code',
    title: '17. Twin Code (Bonded Pair)',
    intro: 'Twin Code bonds two BestCode printers as a single logical unit and applies the same 13-digit serial twice per bottle: a native ECC200 DataMatrix on the lid (printer A) and a human-readable text rendition on the side (printer B). Catalog serials feed the dispatcher; cycle target ≈300 ms (200 units / minute). Requires the TWINCODE license tier.',
    platforms: ['desktop'],
    sections: [
      {
        id: 'twin-overview',
        title: 'When to use Twin Code',
        body: `Twin Code is purpose-built for high-speed bottle-coding lines that need two synchronized marks per unit:\n\n- **Lid (A)** — native ECC200 Data Matrix 16×16 for machine reading\n- **Side (B)** — human-readable 13-character text rendition of the same serial\n\nIt replaces the ad-hoc "two printers running similar messages" setup with a single dispatcher that consumes one serial from a catalog and fans it out to both printers in parallel. If either side fails (jet stop, disconnect, miss-streak), the conveyor pauses and the operator gets a recovery banner.\n\nIt is **not** a generic multi-printer mode — use Master/Slave (Chapter 4) for that. Twin Code is a single bonded pair per license.`,
      },
      {
        id: 'twin-binding',
        title: 'Binding the pair',
        body: `Open the **Twin Code** screen (visible only on TWINCODE-tier licenses) and click **Bind Pair**:\n\n1. Enter the **A (Lid)** printer IP — port 23\n2. Enter the **B (Side)** printer IP — port 23\n3. Pick the **message name** to use on each side (default: \`TWIN-LID\` / \`TWIN-SIDE\`)\n4. Pick the **field number** that will receive the serial (default: F1 on both)\n5. Choose the per-side update subcommand: \`^BD\` for the DM barcode (A), \`^TD\` for the text field (B)\n6. Leave **Auto-create messages** on — if the configured message doesn't exist on the printer, CodeSync seeds the canonical 16×16 DM template (A) or 7-dot text template (B) and saves it before selecting it\n\nThe dispatcher validates each side with a ^LF field-shape check after ^SM — if F1 isn't a barcode field on A or a text field on B, the bind aborts with a clear error.`,
      },
      {
        id: 'twin-catalog',
        title: 'Loading the serial catalog',
        body: `The catalog is the single source of truth — every serial is consumed exactly once. Open **Catalog** from the Twin Code top bar:\n\n1. Click **Import CSV** and pick a file (one 13-digit serial per line, header optional)\n2. CodeSync computes an **FNV fingerprint** of the imported set; future imports of the same file are detected as duplicates\n3. The catalog strip bar shows total / consumed / remaining\n\nA local-storage **ledger** records every consumed serial with timestamp and bottle index. On reload, CodeSync resumes from the last consumed bottle. The ledger also pushes to Lovable Cloud (\`twin_code_ledger\` table) so the same run can be audited from another device or after a crash.`,
      },
      {
        id: 'twin-preflight',
        title: 'Pre-flight dry run',
        body: `Before going LIVE, click **Pre-Flight** to dispatch 5 real bonded prints with the placeholder serial \`DRYRUN0000000\` (no catalog effects). The dialog shows per-cycle wire RTT, A/B skew, and full cycle time, plus a pass/fail verdict.\n\nA passing pre-flight means: both printers acked the ^MD subcommand, both reached the \`C\` (committed) state, and the bonded cycle completed under the 300 ms target. Re-run pre-flight any time you change a message, swap a printer, or move to a new line.`,
      },
      {
        id: 'twin-live-run',
        title: 'Going LIVE — the operator HUD',
        body: `Click **Go LIVE** to open the Operator HUD. The HUD is designed for floor visibility from 2-3 meters:\n\n- **Big BPM** (bottles per minute) — current and 30-second rolling average\n- **Last serial** in monospace, with A/B status lights (green = both committed, amber = one acked, red = miss)\n- **Audible miss alarm** — sounds when a serial fails to commit on either side, configurable in HUD settings\n- **Stage histogram** at the bottom shows the last 200 cycles broken down by phase (queue → wire → R → T → C)\n- **Bottleneck callout** highlights the slowest phase so operators know whether the printer, the network, or the conveyor is the limit\n\nThe HUD doubles as a screensaver — switch to **Screen** mode for fullscreen line-side display.`,
      },
      {
        id: 'twin-production-run',
        title: 'Production runs and lot locking',
        body: `A production run binds catalog consumption to a specific **Lot Number** and **Operator**. From the Production Run bar:\n\n1. Click **Start Run** — enter Lot, Operator, and an optional note\n2. The run is locked to the catalog fingerprint at start; a new catalog import during a run is rejected\n3. Every committed serial is appended to the cloud ledger with the run ID\n4. Click **End Run** to close it out — CodeSync offers signed CSV / JSON export with a SHA-256 of the manifest for compliance audit\n\nIf the application crashes or the PC reboots mid-run, the **Ledger Resume Banner** offers to resume from the last committed bottle.`,
      },
      {
        id: 'twin-fault-recovery',
        title: 'Fault recovery',
        body: `Twin Code is loud about hardware errors — silence is never the right answer. The fault guard watches for:\n\n- **Jet stop** on either printer (^MB rejects with JNR)\n- **TCP disconnect** on either printer\n- **Miss-streak** — N consecutive cycles where a side fails to commit (configurable, default 3)\n\nWhen any condition trips, the conveyor pauses and the **Fault Recovery Banner** appears at the top of the screen with three actions: **Acknowledge** (clear the alarm and resume), **Resume from bottle N** (rewind the catalog cursor to the last known-good bottle), or **End Run** (close the lot). The audible alarm continues until acknowledged.`,
      },
      {
        id: 'twin-training',
        title: 'Training mode',
        body: `New operators can practice on a simulated conveyor without touching real printers or consuming real catalog serials. Open **Training** from the Twin Code top bar — the training overlay walks through 6 stages: bind, catalog, pre-flight, going live, handling a miss, and ending a run. The simulator drives the same dispatcher and HUD code as production, so muscle memory transfers 1:1.`,
      },
    ],
  },
  {
    id: 'appendix',
    title: '18. Appendix',
    intro: 'Reference material.',
    sections: [
      {
        id: 'shortcuts',
        title: 'Keyboard shortcuts',
        body: `- **Ctrl+S** — Save current message\n- **Ctrl+Z / Ctrl+Y** — Undo / Redo in editor\n- **Delete** — Delete selected field(s)\n- **Esc** — Close current dialog\n- **F11** — Toggle fullscreen`,
      },
      {
        id: 'admin-password',
        title: 'Admin password',
        body: `Certain destructive operations (delete printer, reset counters, modify network) require the admin password: **TEXAS**\n\nThe admin password is hard-coded by BestCode and cannot be changed by end users.`,
      },
      {
        id: 'protocol',
        title: 'Protocol commands (advanced)',
        body: `CodeSync uses BestCode protocol v2.6 over TCP port 23. Key commands:\n\n- **^SU** — Status update (polled every 5s)\n- **^LE** — List errors (authoritative for faults)\n- **^CN** — Counter values\n- **^TM** — Runtime metrics\n- **^NM / ^SV** — New message / save\n- **^SM** — Select message\n- **^DM** — Delete message\n- **^PR 1 / 0** — Print run / stop\n- **^VV** — Version / model identification\n\nAdvanced users can send raw commands via the Service Tools panel.`,
      },
      {
        id: 'support',
        title: 'Support',
        body: `For technical support, contact BestCode:\n\n- **Web:** bestcodeusa.com\n- **In-app:** Click the 💬 Feedback icon to send a bug report or feature request directly to engineering\n\nWhen reporting an issue, include the app version (shown next to the CodeSync logo at top left) and the printer model/firmware version (shown on the printer card).`,
      },
    ],
  },
];

export const TOTAL_SECTIONS = MANUAL.reduce((sum, c) => sum + c.sections.length, 0);
