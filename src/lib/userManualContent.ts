/**
 * CodeSync User Manual content.
 * Single source of truth for the in-app User Manual viewer
 * and (later) PDF export.
 */

export interface ManualSection {
  id: string;
  title: string;
  body: string; // markdown-lite (paragraphs, **bold**, - bullets, ## subheadings)
  screenshot?: string; // path under /manual-screenshots/
  callouts?: { label: string; text: string }[];
}

export interface ManualChapter {
  id: string;
  title: string;
  intro: string;
  sections: ManualSection[];
}

export const MANUAL_VERSION = 'v1.0';
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
        body: `When CodeSync starts, you'll see the splash screen with the current version number. The application then connects to your local network and loads the printer list.\n\n**System tray:** When installed on Windows, CodeSync runs in the system tray and starts automatically with Windows.\n\n**First launch:** The first time you open CodeSync you will be prompted to activate your license. See Chapter 2.`,
        screenshot: '/manual-screenshots/00-splash.png',
      },
      {
        id: 'main-layout',
        title: 'Main layout',
        body: `The main screen has three areas:\n\n- **Network Printers** sidebar (left) — your fleet of printers with their connection status\n- **Detail panel** (right) — shows the currently selected printer's dashboard, messages, setup, etc.\n- **Top bar** — quick access to Mobile Pairing, Theme, Fullscreen, Feedback, Training Videos, Help, and Service tools\n\nClick a printer in the sidebar to connect and view its dashboard.`,
        screenshot: '/manual-screenshots/01-printers.png',
      },
    ],
  },
  {
    id: 'activation',
    title: '2. Activation & Licensing',
    intro: 'CodeSync requires a license to connect to printers. Four tiers are available.',
    sections: [
      {
        id: 'tiers',
        title: 'License tiers',
        body: `- **DEMO** — 30-day free trial of the full application\n- **LITE** — Standalone operation (USB / Serial), single printer\n- **FULL** — Network printer access, unlimited printers\n- **DATABASE** — Full + Variable Data Printing (VDP) with database integration\n\nYour current tier is shown at the bottom of the printers sidebar.`,
      },
      {
        id: 'activate',
        title: 'Activating a license',
        body: `1. Click the **Activate** button at the bottom of the printers sidebar\n2. Enter the 20-character product key supplied by BestCode\n3. Click **Activate**\n\nLicenses are tied to your machine. Moving CodeSync to a new PC requires re-activation; contact BestCode support if you need to transfer.\n\n**Pair with PC:** Mobile devices can pair with a licensed PC instead of needing their own license — see Chapter 13.`,
        screenshot: '/manual-screenshots/02-license-activation.png',
      },
    ],
  },
  {
    id: 'connecting',
    title: '3. Connecting Printers',
    intro: 'Add printers to your network and connect to them.',
    sections: [
      {
        id: 'add-printer',
        title: 'Adding a printer',
        body: `1. Click **+ Add** at the top of the printers sidebar\n2. Enter a friendly **Name** (e.g. "Line 3 Coder")\n3. Enter the printer's **IP address** (e.g. 192.168.1.55) and **Port** (default 23)\n4. Click **Save**\n\nThe printer will appear in the list and CodeSync will start polling its status every 5 seconds.\n\n**Network requirements:** The PC and printer must be on the same subnet. Telnet / Remote Comms must be enabled on the printer's front panel. See the Connection Setup Guide (❓ icon → Connection Guide) for step-by-step photos.`,
        screenshot: '/manual-screenshots/03-add-printer.png',
      },
      {
        id: 'edit-printer',
        title: 'Editing a printer (Serial, Line ID, Sync Role)',
        body: `Click the small pencil icon on a printer card to edit its settings:\n\n- **Name / IP / Port** — basic connection details\n- **Serial Number** — optional; used for Fleet Telemetry tracking\n- **Line ID** — optional; resolves dynamically as the value of any Line ID field in messages on this printer (e.g. "Line A", "Packaging 1")\n- **Sync Role** — None / Master / Slave for multi-printer synchronization (Master propagates message content and selection to its slaves)`,
        screenshot: '/manual-screenshots/04-edit-printer.png',
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
    title: '4. Dashboard',
    intro: 'The Dashboard is your live view of a connected printer.',
    sections: [
      {
        id: 'message-preview',
        title: 'Message preview',
        body: `The center of the dashboard shows a dot-for-dot preview of the message currently selected on the printer, rendered using the same fonts as the physical print head.\n\n**Bottom alignment:** Single-line messages are anchored to the bottom of the template — exactly matching what the printer hardware prints.`,
        screenshot: '/manual-screenshots/05-dashboard.png',
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
      },
      {
        id: 'adjust',
        title: 'Adjust settings',
        body: `**Adjust** opens the global print settings dialog: Width, Height, Delay, Bold, Gap, Pitch, Rotation, and Speed. These apply to all messages on the connected printer.`,
        screenshot: '/manual-screenshots/07-adjust.png',
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
    title: '5. Messages',
    intro: 'Create, edit, select, and manage print messages.',
    sections: [
      {
        id: 'message-list',
        title: 'Message list',
        body: `The Messages screen shows all messages stored on the printer plus any read-only test messages (BESTCODE, QUANTUM).\n\n- **Select** — Make this message the active print job\n- **Edit** — Open the message editor\n- **New** — Create a blank message from a template\n- **Delete** — Remove the message (a 20-second guard prevents accidental re-add)`,
        screenshot: '/manual-screenshots/08-messages-list.png',
      },
      {
        id: 'editor',
        title: 'Message editor',
        body: `The editor is a dot-matrix canvas matching the print head's physical resolution.\n\n**Adding fields:** Click **+ New** and choose Text, Line ID, User Define, AutoCode, Barcode, or Graphic.\n\n**Moving fields:** Click and drag. Use marquee selection (drag in empty space) to select multiple fields.\n\n**Field settings:** With a field selected, the bottom panel shows font size, template, bold, gap (character spacing), rotation, and auto-numerals.\n\n**Saving:** Click **Save**. CodeSync sends ^NM and ^SV to the printer and waits for confirmation. If the printer rejects the message, the exact reason is displayed.`,
        screenshot: '/manual-screenshots/09-message-editor.png',
      },
      {
        id: 'message-settings',
        title: 'Message settings',
        body: `Click **Settings** in the editor toolbar to configure per-message **Speed**, **Orientation** (Normal / Inverted), and **Print Mode** (Normal, Reverse, Mirror, etc). These settings travel with the message via the ^CM command.`,
        screenshot: '/manual-screenshots/09b-message-settings.png',
      },
      {
        id: 'new-field',
        title: 'Adding a new field',
        body: `Click **+ New** to open the field type chooser:\n\n- **Text Field** — static or mixed-case text\n- **Line ID** — resolves to the printer's configured Line ID at print time\n- **User Define** — operator is prompted at message-select time\n- **AutoCode Field** — Time, Date, Counter, or Shift codes\n- **Barcode Field** — 1D & 2D barcodes\n- **Graphic Field** — bitmap from the printer's graphic library`,
        screenshot: '/manual-screenshots/09c-new-field.png',
      },
      {
        id: 'autocode',
        title: 'AutoCode fields',
        body: `AutoCode fields automatically resolve at print time. Choose:\n\n- **Time Codes** — HH:MM:SS, AM/PM, shift letter\n- **Date Codes** — manufacturing or expiration date with full token control\n- **Counter** — Counter 1-4 (configured under Setup)\n- **Shift Codes** — alphabetic shift indicator`,
        screenshot: '/manual-screenshots/09d-autocode-field.png',
      },
      {
        id: 'date-codes',
        title: 'Date and time codes',
        body: `**Date/Time Code Builder** lets you compose expressions with day/month/year/Julian-day/week tokens for both Manufacturing and Expiration dates.\n\nQuick presets cover common formats (MAY 07,2026 · MM/DD/YY · DD-MM-YYYY · YYYY/MM/DD · HH:MM:SS · Date+Time). Switch to **Build Custom** to compose your own from individual tokens.\n\nExpiration date offsets (e.g. +180 days) are configured per message and per printer. Programmable date/time codes (custom alphabetic mappings) are configured under **Setup → Programmable Date Codes / Time Codes**.`,
        screenshot: '/manual-screenshots/09e-date-code-builder.png',
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
      },
      {
        id: 'graphics',
        title: 'Graphic fields',
        body: `Insert any bitmap from the printer's onboard graphic library (logos, warning symbols, regulatory marks). The Graphics dialog lists each graphic by number and name (TRUPOINT.BMP, LOGO1.BMP, etc.) — click to insert.`,
        screenshot: '/manual-screenshots/09h-graphic-field.png',
      },
      {
        id: 'user-define',
        title: 'User Define (operator-prompted) fields',
        body: `User Define fields prompt the operator for input each time the message is selected for printing. Configure the **Prompt Label** (e.g. "LOT CODE") and **Max Characters**. Perfect for batch numbers, lot codes, and operator initials that change between runs.`,
        screenshot: '/manual-screenshots/09i-user-define.png',
      },
      {
        id: 'data-link',
        title: 'Data Link (Variable Data Printing)',
        body: `Data Link maps columns from a CSV, REST API, or database to fields in your message — perfect for serialization, batch coding, and METRC compliance.\n\n1. Open **Data Source** from the sidebar (or top nav)\n2. Import a CSV, configure a hotfolder, or connect via REST/ODBC\n3. In the message editor, add a **Data Link** field and map it to a column\n4. Start a Print Job — each Print Go advances to the next row`,
      },
    ],
  },
  {
    id: 'reports',
    title: '6. Production Reports',
    intro: 'Track production runs, downtime, OEE, and custom metrics.',
    sections: [
      {
        id: 'report-types',
        title: 'Report types',
        body: `Four report types are available:\n\n- **OEE Report** — Availability × Performance × Quality with run drill-down and downtime tracking\n- **Production Summary** — How many units, how long, what rate (no targets needed)\n- **Shift Report** — Production grouped by configurable shifts (Day / Swing / Night by default)\n- **Custom** — Build your own report with selectable metrics, groupings, and visualizations; save as templates`,
        screenshot: '/manual-screenshots/10-reports-oee.png',
      },
      {
        id: 'time-scope',
        title: 'Time scope',
        body: `For Production Summary and Shift reports, choose a quick preset (Today, Yesterday, This Week, Last 7d, Last 30d, Last 90d, This Month, Last Month) or click **Custom** to pick a date range.\n\n**Group by:** Day, Week, or Month for trend charts.\n\n**Printer filter:** All printers or a subset.`,
        screenshot: '/manual-screenshots/11-reports-production.png',
      },
      {
        id: 'custom-builder',
        title: 'Custom report builder',
        body: `Click **Custom** then **+ New Template** to open the builder.\n\n**Metrics:** Produced, Target, Attainment %, Run Time, Downtime, Downtime by Reason, Units/Hour, OEE, Availability, Performance, Run Count, Avg Run Duration, Top Messages.\n\n**Visualizations:** KPI Cards, Production Trend, Downtime Pareto, OEE Trend, Shift Comparison, Message Breakdown (pie), Hourly Heatmap.\n\n**Group by:** Printer, Shift, Day, Week, Month, or Message.\n\nSave as a named template — it appears as a chip above the report and can be edited, duplicated, or deleted at any time.`,
        screenshot: '/manual-screenshots/13-reports-custom-builder.png',
      },
      {
        id: 'export',
        title: 'Exporting',
        body: `The **Download** button in the report header offers:\n\n- **PDF Report** — Multi-page formatted report with KPIs, charts, and tables\n- **CSV (raw data)** — Underlying production runs for spreadsheet analysis`,
        screenshot: '/manual-screenshots/12-reports-custom.png',
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
    title: '7. Consumables',
    intro: 'Track ink, makeup, and filter inventory; get alerts before you run out.',
    sections: [
      {
        id: 'configuration',
        title: 'Per-printer configuration',
        body: `For each printer, set the part number used for **Makeup**, **Ink**, and **Filter**. The system tracks fluid level transitions (FULL → GOOD → LOW → EMPTY) and only deducts stock when a bottle reaches LOW or EMPTY — never on a refill.\n\nFilter life is computed from the printer's ^TM (Runtime) hours against the user-configured filter rating (2,000 / 5,000 / 10,000 hours).`,
        screenshot: '/manual-screenshots/14-consumables.png',
      },
      {
        id: 'stock',
        title: 'Stock inventory',
        body: `Click **+ Add Consumable** to register a part you keep on hand. Set the reorder threshold and supplier info. CodeSync raises a low-stock alert when remaining quantity drops below the threshold.\n\n**Stock Unit vs Reorder Unit:** Stock Unit is the individual countable item (e.g. Bottles); Reorder Unit is what you order from the supplier (e.g. Cases, with Per-Reorder-Unit indicating bottles per case). This distinction lets CodeSync correctly calculate when to reorder.`,
        screenshot: '/manual-screenshots/14b-add-consumable.png',
      },
      {
        id: 'predictions',
        title: 'Predictions',
        body: `Based on average consumption rate, CodeSync estimates how many days until each consumable runs out and shows it on the dashboard.`,
      },
    ],
  },
  {
    id: 'setup',
    title: '8. Setup',
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
    title: '9. Service & Diagnostics',
    intro: 'Monitor printer health, view runtime hours, and run diagnostic procedures.',
    sections: [
      {
        id: 'runtime',
        title: 'Runtime metrics',
        body: `The Service screen shows:\n\n- **Power Hours** — total time powered on\n- **Stream Hours** — total time the jet has run\n- **Filter Hours** — hours since last filter change\n- **Pump Hours** — pump runtime\n\nMetrics are queried via ^TM independently from the regular status poll for fresh data.`,
      },
      {
        id: 'fault-codes',
        title: 'Fault codes',
        body: `Active faults are shown with the official BestCode fault code, description, and a photo of the relevant component when available. The ^LE command is the authoritative source for active errors. Click a fault for clearing instructions.`,
      },
      {
        id: 'diagnostic-test',
        title: 'Diagnostic test procedure',
        body: `Run a guided diagnostic to verify viscosity, pressure, modulation, charge, phase, and RPS. Pass/fail results help isolate jet quality problems.`,
      },
      {
        id: 'clean',
        title: 'Clean screen',
        body: `Note: Remote Clean and Flush operations are NOT supported by the BestCode v2.0/v2.6 protocol. Cleaning must be performed at the printer's front panel. The Clean screen in CodeSync provides reference instructions and a maintenance log.`,
      },
    ],
  },
  {
    id: 'wire-cable',
    title: '10. Wire & Cable',
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
    title: '11. Data Source',
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
    title: '12. Mobile Companion',
    intro: 'Use a phone or tablet to monitor and control printers paired with your PC.',
    sections: [
      {
        id: 'pairing',
        title: 'Pairing a mobile device',
        body: `1. On your PC, click the mobile icon in the top bar → **Pair Mobile**\n2. A QR code and 6-digit PIN are displayed (valid for 5 minutes)\n3. On your phone, open the CodeSync PWA and either scan the QR or enter the PIN\n4. The mobile device is now paired with your PC's license\n\n**Connect via PC:** From the mobile PWA, choose Connect via PC and enter the host PC's IP address (default port 8766). The mobile companion routes printer commands through the PC's HTTP relay.`,
        screenshot: '/manual-screenshots/16-relay-connect.png',
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
    title: '13. Training Videos & Feedback',
    intro: 'Built-in tutorials and a way to send issues directly to BestCode.',
    sections: [
      {
        id: 'training',
        title: 'Training Videos',
        body: `Click the video icon (🎥) in the top bar to access a library of training videos covering setup, message creation, troubleshooting, and best practices. Videos stream from secure cloud storage.`,
      },
      {
        id: 'feedback',
        title: 'Sending feedback',
        body: `Click the speech bubble icon (💬) to open the Feedback dialog.\n\n- Choose **Bug Report** or **Feature Request**\n- Describe the issue\n- Attach up to 3 screenshots\n- Submit\n\nFeedback goes directly to BestCode engineering with the app version and your context attached.`,
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: '14. Troubleshooting',
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
    id: 'appendix',
    title: '15. Appendix',
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
