import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Play, CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronDown, ChevronRight, Download, Square, Copy,
  CheckCheck, Plug, Wifi, Cable, Server, Cpu, RefreshCw,
  ClipboardCheck, Info, Zap
} from 'lucide-react';
import { toast } from 'sonner';

// --- Types ---
type TestStatus = 'pending' | 'running' | 'pass' | 'fail' | 'warn' | 'skipped';

interface TestResult {
  status: TestStatus;
  message: string;
  timing?: number;
  details?: string[];
  recommendation?: string;
  rawData?: Record<string, any>;
}

interface TestDef {
  id: string;
  name: string;
  plainEnglish: string;
  whatItDoes: string;
  ifItFails: string;
  passCriteria: string;
  estimatedTime: string;
  run: () => Promise<TestResult>;
}

interface TestPhase {
  id: string;
  name: string;
  icon: React.ReactNode;
  plainEnglish: string;
  beforeYouStart: string[];
  tests: TestDef[];
}

interface Props {
  ip: string;
  port: number;
  printerId: number;
  isElectron: boolean;
}

// --- Helpers ---
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function connectPrinter(id: number, ip: string, port: number) {
  const t0 = performance.now();
  const result = await window.electronAPI!.printer.connect({ id, ipAddress: ip, port });
  return { ...result, elapsed: Math.round(performance.now() - t0) };
}

async function disconnectPrinter(id: number) {
  const t0 = performance.now();
  await window.electronAPI!.printer.disconnect(id);
  return { elapsed: Math.round(performance.now() - t0) };
}

async function sendCmd(id: number, cmd: string) {
  const t0 = performance.now();
  const result = await window.electronAPI!.printer.sendCommand(id, cmd);
  return { ...result, elapsed: Math.round((performance.now() - t0) * 100) / 100 };
}

export function DiagnosticTestProcedure({ ip, port, printerId, isElectron }: Props) {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [runningTest, setRunningTest] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [showPreFlight, setShowPreFlight] = useState(true);
  const [preFlightChecks, setPreFlightChecks] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(false);

  const updateResult = (testId: string, result: TestResult) => {
    setResults(prev => ({ ...prev, [testId]: result }));
  };

  // ═══════════════════════════════════════════════════════
  // PRE-FLIGHT CHECKLIST
  // ═══════════════════════════════════════════════════════
  const preFlightItems = [
    { id: 'power', label: '✅ The printer is powered ON and fully started up (not showing errors on its screen)' },
    { id: 'cable', label: '✅ An Ethernet cable is plugged into the printer and connected to your network (router/switch/hub)' },
    { id: 'telnet', label: '✅ "Remote Comms" or "Telnet" is enabled on the printer\'s front panel (Setup → Communications)' },
    { id: 'ip', label: `✅ The IP address above (${ip}) matches the printer's actual IP address shown on its screen` },
    { id: 'nosession', label: '✅ No other computer or app is currently connected to this printer via Telnet (close any other sessions or restart the printer)' },
    { id: 'samesubnet', label: '✅ This computer and the printer are on the same network (e.g., both 192.168.0.x)' },
  ];

  const allPreFlightChecked = preFlightItems.every(item => preFlightChecks[item.id]);

  // ═══════════════════════════════════════════════════════
  // PHASE 1: CAN WE REACH THE PRINTER?
  // ═══════════════════════════════════════════════════════
  const phase1: TestPhase = {
    id: 'phase1',
    name: 'Phase 1: Can We Reach the Printer?',
    icon: <Plug className="w-4 h-4" />,
    plainEnglish: 'These tests check if your computer can even "see" the printer on the network. If these fail, nothing else will work.',
    beforeYouStart: [
      'Make sure the Ethernet cable is plugged in at both ends',
      'Check the printer screen shows an IP address',
    ],
    tests: [
      {
        id: '1.1',
        name: '1.1 — Ping the Printer',
        plainEnglish: 'We send a "hello, are you there?" message to the printer and see if it replies.',
        whatItDoes: 'Sends an ICMP ping packet to the printer\'s IP address and waits for a response.',
        ifItFails: 'The printer is not reachable. Check: Is it powered on? Is the IP address correct? Is the cable plugged in? Are they on the same network?',
        passCriteria: 'Response received within 2500ms',
        estimatedTime: '~3 seconds',
        run: async () => {
          const result = await window.electronAPI!.printer.checkStatus([{ id: printerId, ipAddress: ip, port }]);
          const r = result?.[0];
          if (r?.isAvailable) {
            return { status: 'pass', message: `Printer replied in ${r.responseTime}ms — it's on the network! ✓`, timing: r.responseTime, details: [`Response time: ${r.responseTime}ms`, 'The printer is reachable on your network.'], rawData: { responseTime: r.responseTime } };
          }
          return { status: 'fail', message: 'Printer did NOT reply — it cannot be reached on the network', details: [r?.error || 'No response received', '', '🔧 Things to try:', '  1. Check the Ethernet cable at both ends', '  2. Verify the IP address matches what\'s shown on the printer screen', '  3. Make sure this PC and the printer are on the same network (same subnet)', '  4. Try restarting the printer'], recommendation: 'NETWORK: Printer is not responding to ping. Cannot proceed until basic connectivity is established.' };
        },
      },
      {
        id: '1.2',
        name: '1.2 — Open a Connection (Port 23)',
        plainEnglish: 'We try to open the actual communication channel (Telnet port 23) that CodeSync uses to talk to the printer.',
        whatItDoes: 'Opens a TCP connection to port 23 on the printer. This is the same thing the main app does when it connects.',
        ifItFails: '"Remote Comms" might not be turned on in the printer settings, or a firewall is blocking port 23.',
        passCriteria: 'Connection opens within 5 seconds',
        estimatedTime: '~8 seconds',
        run: async () => {
          const r = await connectPrinter(printerId, ip, port);
          if (r.success) {
            await disconnectPrinter(printerId);
            await sleep(2000);
            const verdict = r.elapsed < 2000 ? 'pass' as const : 'warn' as const;
            return {
              status: verdict,
              message: r.elapsed < 2000 
                ? `Connected successfully in ${r.elapsed}ms ✓` 
                : `Connected but slowly (${r.elapsed}ms) — might have network issues`,
              timing: r.elapsed,
              details: [
                `Connection time: ${r.elapsed}ms`,
                r.elapsed < 500 ? '✓ Excellent — very fast connection' : r.elapsed < 2000 ? '✓ Normal connection speed' : '⚠ Slow — this might cause timeouts during normal use',
              ],
              rawData: { connectTime: r.elapsed, reused: r.reused },
            };
          }
          return { status: 'fail', message: `Could NOT open connection: ${r.error}`, timing: r.elapsed, details: [`Error: ${r.error}`, `Took: ${r.elapsed}ms`, '', '🔧 Things to try:', '  1. On the printer: Go to Setup → Communications → Enable "Remote Comms" or "Telnet"', '  2. Make sure port is set to 23 on the printer', '  3. Check Windows Firewall — add rule to allow port 23', '  4. If another app was connected, restart the printer to clear the session'], recommendation: `NETWORK: Cannot open TCP port ${port}. Telnet/Remote Comms may not be enabled on the printer.` };
        },
      },
      {
        id: '1.3',
        name: '1.3 — Disconnect and Reconnect',
        plainEnglish: 'We connect, disconnect, wait 15 seconds, then try connecting again. This tests whether the printer properly "lets go" of old connections.',
        whatItDoes: 'Tests the full connect → disconnect → wait → reconnect cycle. The 15-second wait is critical because the printer firmware needs time to release the session.',
        ifItFails: 'The printer\'s firmware has a bug where it doesn\'t release sessions properly. You might need to restart the printer between connections.',
        passCriteria: 'Second connection succeeds after 15s wait',
        estimatedTime: '~25 seconds',
        run: async () => {
          const details: string[] = [];

          const r1 = await connectPrinter(printerId, ip, port);
          details.push(`Step 1 — First connection: ${r1.success ? '✓ Success' : '✗ Failed'} (${r1.elapsed}ms)`);
          if (!r1.success) return { status: 'fail', message: `First connection failed: ${r1.error}`, details, recommendation: 'Cannot even make the first connection. See test 1.2.' };

          const d = await disconnectPrinter(printerId);
          details.push(`Step 2 — Disconnected: ✓ (${d.elapsed}ms)`);
          details.push(`Step 3 — Waiting 15 seconds for printer to release the session...`);
          await sleep(15000);
          details.push(`Step 3 — Wait complete`);

          const r2 = await connectPrinter(printerId, ip, port);
          details.push(`Step 4 — Second connection: ${r2.success ? '✓ Success' : '✗ Failed'} (${r2.elapsed}ms)`);

          if (r2.success) {
            await disconnectPrinter(printerId);
            return { status: 'pass', message: `Reconnection works! Printer released the session in under 15 seconds ✓`, timing: r2.elapsed, details, rawData: { firstConnect: r1.elapsed, secondConnect: r2.elapsed, waitTime: 15 } };
          }
          return { status: 'fail', message: `Printer did NOT release the session after 15 seconds`, timing: r2.elapsed, details: [...details, '', '🔧 Things to try:', '  1. Restart the printer and run this test again', '  2. Check if there\'s another device/app still holding the connection', '  3. This may be a firmware limitation — see Phase 4 for more testing'], recommendation: 'FIRMWARE: Printer does not release TCP session after 15 seconds. May need longer cooldown or power cycle.' };
        },
      },
    ],
  };

  // ═══════════════════════════════════════════════════════
  // PHASE 2: DOES THE PRINTER UNDERSTAND US?
  // ═══════════════════════════════════════════════════════
  const phase2: TestPhase = {
    id: 'phase2',
    name: 'Phase 2: Does the Printer Understand Us?',
    icon: <Cpu className="w-4 h-4" />,
    plainEnglish: 'Now that we can connect, let\'s see if the printer actually responds to commands. We\'ll try all the main commands CodeSync uses.',
    beforeYouStart: [
      'Phase 1 tests should have passed first',
      'If the printer was restarted, wait 30 seconds for it to fully boot',
    ],
    tests: [
      {
        id: '2.1',
        name: '2.1 — Ask for Version Number',
        plainEnglish: 'We connect and ask the printer "what version are you?" — this is the simplest command and tells us the protocol is working.',
        whatItDoes: 'Sends the ^VV command which asks the printer for its firmware version number.',
        ifItFails: 'The connection is open but the printer isn\'t processing commands. It might need a specific handshake or is in a fault state.',
        passCriteria: 'Version string received',
        estimatedTime: '~5 seconds',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Could not connect: ${rc.error}`, recommendation: 'Go back and fix Phase 1 first.' };
          await sleep(500);

          const r = await sendCmd(printerId, '^VV');
          const details = [`Connected in: ${rc.elapsed}ms`, `Command sent: ^VV (get version)`, `Response time: ${r.elapsed}ms`, `Response: ${r.response || '(nothing came back)'}`];

          if (r.success && r.response && r.response.length > 2) {
            return { status: 'pass', message: `Printer responded with version info in ${r.elapsed}ms ✓`, timing: r.elapsed, details, rawData: { version: r.response?.trim(), responseTime: r.elapsed } };
          }
          return { status: 'fail', message: `Printer connected but did NOT respond to the version command`, timing: r.elapsed, details: [...details, '', '🔧 Things to try:', '  1. Check that the printer protocol version is v2.0 or higher', '  2. Look at the printer screen — is it showing any errors?', '  3. Try restarting the printer'], recommendation: 'PROTOCOL: Printer connected but not responding to commands. May need protocol version check or is in fault state.' };
        },
      },
      {
        id: '2.2',
        name: '2.2 — Test All Core Commands',
        plainEnglish: 'We send all 6 main commands that CodeSync uses and check that each one gets a reply. This tells us exactly which features will work.',
        whatItDoes: 'Tests: Status (^SU), Version (^VV), Errors (^LE), Messages (^LM), Date (^SD), and Temperatures (^TP).',
        ifItFails: 'Some commands might not be supported by your printer\'s firmware version. We\'ll note exactly which ones work.',
        passCriteria: 'All 6 commands return responses',
        estimatedTime: '~10 seconds',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Could not connect: ${rc.error}` };
          await sleep(300);

          const cmds = [
            { cmd: '^SU', desc: 'Status — is the printer running?', feature: 'Dashboard status display' },
            { cmd: '^VV', desc: 'Version — what firmware?', feature: 'Version info display' },
            { cmd: '^LE', desc: 'Errors — any active faults?', feature: 'Error alerts' },
            { cmd: '^LM', desc: 'Messages — what print messages are stored?', feature: 'Message management' },
            { cmd: '^SD', desc: 'Date — what date does the printer think it is?', feature: 'Date code printing' },
            { cmd: '^TP', desc: 'Temperatures — how hot are the components?', feature: 'Temperature monitoring' },
          ];

          const details: string[] = [];
          let passed = 0;
          let failed = 0;
          const cmdResults: Record<string, any> = {};

          for (const { cmd, desc, feature } of cmds) {
            const r = await sendCmd(printerId, cmd);
            if (r.success && r.response && r.response.trim().length > 0) {
              passed++;
              details.push(`✅ ${cmd} — ${desc}`);
              details.push(`   Response (${r.elapsed}ms): ${r.response.substring(0, 100).replace(/\n/g, ' ')}`);
              details.push(`   This means "${feature}" WILL work in CodeSync`);
              cmdResults[cmd] = { ok: true, time: r.elapsed, response: r.response.substring(0, 200) };
            } else {
              failed++;
              details.push(`❌ ${cmd} — ${desc}`);
              details.push(`   Error: ${r.error || 'empty response'} (${r.elapsed}ms)`);
              details.push(`   This means "${feature}" will NOT work in CodeSync`);
              cmdResults[cmd] = { ok: false, time: r.elapsed, error: r.error };
            }
            details.push('');
            await sleep(300);
          }

          if (failed === 0) return { status: 'pass', message: `All ${passed} commands work! Every CodeSync feature is supported ✓`, details, rawData: { commands: cmdResults } };
          if (passed > 0) return { status: 'warn', message: `${passed} of ${cmds.length} commands work, ${failed} don't respond`, details, rawData: { commands: cmdResults }, recommendation: `PROTOCOL: Some commands unsupported. This may be an older firmware version.` };
          return { status: 'fail', message: 'NONE of the commands got a response', details, rawData: { commands: cmdResults }, recommendation: 'PROTOCOL: Printer is connected but not responding to ANY commands. It may be locked or in a fault state.' };
        },
      },
    ],
  };

  // ═══════════════════════════════════════════════════════
  // PHASE 3: IS THE CONNECTION STABLE?
  // ═══════════════════════════════════════════════════════
  const phase3: TestPhase = {
    id: 'phase3',
    name: 'Phase 3: Is the Connection Stable?',
    icon: <Zap className="w-4 h-4" />,
    plainEnglish: 'These tests check if the connection stays reliable over time. A connection that works once but drops after 30 seconds is the most common problem.',
    beforeYouStart: [
      'Phases 1 and 2 should pass first',
      'Don\'t touch the printer during these tests',
      'Test 3.3 takes about 1 minute and test 3.5 takes 2 minutes — be patient!',
    ],
    tests: [
      {
        id: '3.1',
        name: '3.1 — Send 20 Commands in a Row',
        plainEnglish: 'We send 20 status requests with a short gap between each one. This simulates normal use.',
        whatItDoes: 'Sends ^SU (status) 20 times with 300ms gaps and counts successes vs failures.',
        ifItFails: 'The printer drops commands under normal load. This is a firmware issue — the command buffer may be too small.',
        passCriteria: '100% success, all responses under 3 seconds',
        estimatedTime: '~15 seconds',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const times: number[] = [];
          const details: string[] = ['Sending 20 status commands with 300ms gaps...', ''];
          let failures = 0;

          for (let i = 0; i < 20; i++) {
            const r = await sendCmd(printerId, '^SU');
            if (r.success) {
              times.push(r.elapsed);
              if (i % 5 === 0 || i === 19) details.push(`  Command ${i + 1}/20: ✓ replied in ${r.elapsed}ms`);
            } else {
              failures++;
              details.push(`  Command ${i + 1}/20: ❌ FAILED — ${r.error}`);
            }
            await sleep(300);
          }

          const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
          const max = times.length > 0 ? Math.max(...times) : 0;
          const min = times.length > 0 ? Math.min(...times) : 0;
          details.push('', '📊 Results:', `  Average response: ${avg}ms`, `  Fastest: ${min}ms`, `  Slowest: ${max}ms`, `  Success rate: ${20 - failures}/20 (${Math.round(((20 - failures) / 20) * 100)}%)`);

          if (failures === 0 && max < 3000) return { status: 'pass', message: `All 20 commands successful — avg ${avg}ms, max ${max}ms ✓`, timing: avg, details, rawData: { avg, min, max, failures, count: 20 } };
          if (failures === 0) return { status: 'warn', message: `All succeeded but slowest was ${max}ms — may cause timeouts`, timing: avg, details, rawData: { avg, min, max, failures, count: 20 }, recommendation: `PERFORMANCE: Some responses are slow (max ${max}ms). May indicate firmware processing delays.` };
          return { status: 'fail', message: `${failures} of 20 commands FAILED`, timing: avg, details, rawData: { avg, min, max, failures, count: 20 }, recommendation: `STABILITY: ${failures}/20 commands failed. Firmware is dropping commands under normal polling.` };
        },
      },
      {
        id: '3.2',
        name: '3.2 — Wait 30 Seconds Then Send Again',
        plainEnglish: 'We send a command, do nothing for 30 seconds, then try again. This checks if the printer disconnects you for being idle.',
        whatItDoes: 'Tests the idle timeout — some printers kick you off if you don\'t talk to them for a while.',
        ifItFails: 'The printer has an idle timeout under 30 seconds. CodeSync needs to send "keepalive" commands to stay connected.',
        passCriteria: 'Command succeeds after 30s idle',
        estimatedTime: '~40 seconds',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const r1 = await sendCmd(printerId, '^SU');
          const details = [`Step 1 — Send command: ${r1.success ? '✓ Got reply' : '✗ Failed'} (${r1.elapsed}ms)`, 'Step 2 — Now waiting 30 seconds with no activity...'];
          if (!r1.success) return { status: 'fail', message: `First command failed: ${r1.error}`, details };

          await sleep(30000);
          details.push('Step 2 — 30 second wait complete');

          const r2 = await sendCmd(printerId, '^SU');
          details.push(`Step 3 — Send another command: ${r2.success ? '✓ Still connected!' : '✗ Connection DIED'} (${r2.elapsed}ms)`);

          if (r2.success) return { status: 'pass', message: `Connection survived 30 seconds of idle time ✓`, timing: r2.elapsed, details, rawData: { idleTime: 30, survived: true } };
          return { status: 'fail', message: `Connection DIED after 30 seconds of inactivity`, details: [...details, '', '⚠ This is a very common issue!', 'The printer disconnects idle sessions.', 'CodeSync will need to send periodic "keepalive" commands.'], rawData: { idleTime: 30, survived: false }, recommendation: 'FIRMWARE: Printer closes idle Telnet sessions within 30 seconds. Application must send keepalive commands.' };
        },
      },
      {
        id: '3.3',
        name: '3.3 — Wait 60 Seconds Then Send Again',
        plainEnglish: 'Same as above but we wait a full minute. This narrows down exactly when the timeout kicks in.',
        whatItDoes: 'If the 30-second test passed but this fails, we know the timeout is between 30-60 seconds.',
        ifItFails: 'The idle timeout is between 30-60 seconds. We know the exact window to keep the connection alive.',
        passCriteria: 'Command succeeds after 60s idle',
        estimatedTime: '~70 seconds',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const r1 = await sendCmd(printerId, '^SU');
          const details = [`Step 1 — Initial command: ${r1.success ? '✓' : '✗'} (${r1.elapsed}ms)`, 'Step 2 — Waiting 60 seconds...'];
          if (!r1.success) return { status: 'fail', message: `First command failed: ${r1.error}`, details };

          await sleep(60000);
          details.push('Step 2 — 60 second wait complete');

          const r2 = await sendCmd(printerId, '^SU');
          details.push(`Step 3 — After 60s idle: ${r2.success ? '✓ Still alive!' : '✗ Connection dropped'} (${r2.elapsed}ms)`);

          if (r2.success) return { status: 'pass', message: `Connection survived 60 seconds of idle time — excellent! ✓`, timing: r2.elapsed, details, rawData: { idleTime: 60, survived: true } };
          return { status: 'fail', message: `Connection died between 30-60 seconds of idle time`, details, rawData: { idleTime: 60, survived: false }, recommendation: 'FIRMWARE: Idle timeout is between 30-60 seconds. Polling interval must stay under this.' };
        },
      },
      {
        id: '3.4',
        name: '3.4 — Rapid Fire (No Gaps)',
        plainEnglish: 'We send 10 commands as fast as possible with NO gaps. This stress-tests the printer to see if it can keep up.',
        whatItDoes: 'Tests the command buffer — can the printer handle commands arriving back-to-back?',
        ifItFails: 'The printer can\'t handle rapid commands. CodeSync needs to add delays between every command it sends.',
        passCriteria: 'All 10 succeed',
        estimatedTime: '~8 seconds',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const details: string[] = ['Sending 10 commands with ZERO delay...', ''];
          let successes = 0;
          let failures = 0;
          const t0 = performance.now();

          for (let i = 0; i < 10; i++) {
            const r = await sendCmd(printerId, '^SU');
            if (r.success) { successes++; details.push(`  #${i + 1}: ✓ ${r.elapsed}ms`); }
            else { failures++; details.push(`  #${i + 1}: ❌ ${r.error}`); }
          }

          const total = Math.round(performance.now() - t0);
          details.push('', `📊 Results:`, `  Total time: ${total}ms`, `  Average: ${Math.round(total / 10)}ms per command`, `  Success: ${successes}/10`);

          if (failures === 0) return { status: 'pass', message: `All 10 rapid-fire commands succeeded in ${total}ms ✓`, timing: total, details, rawData: { total, successes, failures } };
          return { status: failures > 3 ? 'fail' : 'warn', message: `${failures} of 10 rapid commands failed — printer needs gaps between commands`, timing: total, details, rawData: { total, successes, failures }, recommendation: `FIRMWARE: Rapid-fire commands cause ${failures}/10 failures. Minimum 300ms delay needed between commands.` };
        },
      },
      {
        id: '3.5',
        name: '3.5 — Real-World Simulation (2 Minutes)',
        plainEnglish: 'This is the BIG test. We poll the printer every 3 seconds for 2 full minutes — exactly like CodeSync does in real life. If this passes, the connection is solid.',
        whatItDoes: 'Sends 40 status commands over 2 minutes, measuring every response. This is the closest test to actual day-to-day use.',
        ifItFails: 'The connection degrades over time. This is the most critical finding — it points to a fundamental stability issue.',
        passCriteria: '95%+ success rate over 2 minutes',
        estimatedTime: '~2 minutes 15 seconds',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const details: string[] = ['Simulating real CodeSync usage — polling every 3 seconds for 2 minutes...', ''];
          const times: number[] = [];
          let failures = 0;
          const polls = 40;

          for (let i = 0; i < polls; i++) {
            if (abortRef.current) { details.push('--- YOU STOPPED THE TEST ---'); break; }
            const r = await sendCmd(printerId, '^SU');
            if (r.success) {
              times.push(r.elapsed);
              if (i % 10 === 0) details.push(`  Minute ${Math.floor((i * 3) / 60)}: Poll ${i + 1}/${polls} — ✓ ${r.elapsed}ms`);
            } else {
              failures++;
              details.push(`  ❌ Poll ${i + 1}/${polls} FAILED at ${Math.round(i * 3)}s — ${r.error}`);
            }
            await sleep(3000);
          }

          const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
          const max = times.length > 0 ? Math.max(...times) : 0;
          const successRate = Math.round(((polls - failures) / polls) * 100);
          details.push('', '📊 Final Results:', `  Duration: 2 minutes`, `  Total polls: ${polls}`, `  Successful: ${polls - failures}`, `  Failed: ${failures}`, `  Success rate: ${successRate}%`, `  Average response: ${avg}ms`, `  Slowest response: ${max}ms`);

          if (successRate >= 95 && max < 5000) return { status: 'pass', message: `${successRate}% success over 2 minutes — STABLE CONNECTION ✓`, timing: avg, details, rawData: { successRate, avg, max, failures, polls } };
          if (successRate >= 80) return { status: 'warn', message: `${successRate}% — mostly works but has occasional drops`, timing: avg, details, rawData: { successRate, avg, max, failures, polls }, recommendation: `STABILITY: ${failures} drops in 2 minutes. May be acceptable but will cause occasional UI glitches.` };
          return { status: 'fail', message: `Only ${successRate}% success — connection is UNSTABLE`, timing: avg, details, rawData: { successRate, avg, max, failures, polls }, recommendation: 'CRITICAL: Connection is fundamentally unstable during sustained polling. This is likely a firmware bug.' };
        },
      },
    ],
  };

  // ═══════════════════════════════════════════════════════
  // PHASE 4: HOW LONG TO RECONNECT?
  // ═══════════════════════════════════════════════════════
  const phase4: TestPhase = {
    id: 'phase4',
    name: 'Phase 4: How Long to Reconnect?',
    icon: <RefreshCw className="w-4 h-4" />,
    plainEnglish: 'When the connection drops, how long do we need to wait before we can connect again? This tests different wait times to find the sweet spot.',
    beforeYouStart: [
      'This phase runs 6 tests with different wait times (0s, 5s, 10s, 15s, 20s, 30s)',
      'Total time: about 3-4 minutes',
      'The printer will be connected and disconnected multiple times — this is normal',
    ],
    tests: [0, 5, 10, 15, 20, 30].map((delaySec, idx) => ({
      id: `4.${idx + 1}`,
      name: `4.${idx + 1} — ${delaySec === 0 ? 'Immediate' : `${delaySec} Second Wait`}`,
      plainEnglish: delaySec === 0 
        ? 'Can we reconnect instantly? (Usually no — this test documents the firmware behavior)' 
        : `After disconnecting, wait ${delaySec} seconds, then try reconnecting. ${delaySec === 15 ? 'This is what CodeSync currently uses.' : ''}`,
      whatItDoes: `Connects, sends a test command, disconnects, waits ${delaySec}s, reconnects, and verifies the new connection works.`,
      ifItFails: `${delaySec} seconds is not enough for the printer to release the session. Need to try a longer wait.`,
      passCriteria: 'Reconnect succeeds and commands work',
      estimatedTime: `~${delaySec + 10} seconds`,
      run: async () => await reconnectWithDelay(delaySec),
    })),
  };

  const reconnectWithDelay = async (delaySec: number): Promise<TestResult> => {
    const details: string[] = [];
    const rc = await connectPrinter(printerId, ip, port);
    details.push(`Step 1 — Connect: ${rc.success ? '✓' : '✗'} (${rc.elapsed}ms)`);
    if (!rc.success) return { status: 'fail', message: `Initial connect failed: ${rc.error}`, details };

    await sendCmd(printerId, '^SU');
    details.push('Step 2 — Sent test command: ✓');

    await disconnectPrinter(printerId);
    details.push('Step 3 — Disconnected: ✓');

    if (delaySec > 0) {
      details.push(`Step 4 — Waiting ${delaySec} seconds...`);
      await sleep(delaySec * 1000);
      details.push(`Step 4 — Wait complete`);
    } else {
      details.push('Step 4 — No wait (immediate reconnect)');
    }

    const r2 = await connectPrinter(printerId, ip, port);
    details.push(`Step 5 — Reconnect: ${r2.success ? '✓' : '✗'} (${r2.elapsed}ms) ${r2.error || ''}`);

    if (r2.success) {
      const cmd = await sendCmd(printerId, '^VV');
      details.push(`Step 6 — Send command on new connection: ${cmd.success ? '✓ Working!' : '✗ Connected but commands fail'}`);
      await disconnectPrinter(printerId);

      if (cmd.success) return { status: 'pass', message: `${delaySec}s wait → reconnect works! Commands respond in ${cmd.elapsed}ms ✓`, timing: r2.elapsed, details, rawData: { delay: delaySec, reconnectTime: r2.elapsed, cmdTime: cmd.elapsed, works: true } };
      return { status: 'warn', message: `Connected at ${delaySec}s but commands don't work yet — need more time`, timing: r2.elapsed, details, rawData: { delay: delaySec, reconnectTime: r2.elapsed, works: false }, recommendation: `FIRMWARE: TCP reconnects at ${delaySec}s but session isn't fully ready.` };
    }

    return { status: delaySec === 0 ? 'warn' : 'fail', message: `${delaySec}s wait is NOT enough — printer still holding old session`, timing: r2.elapsed, details, rawData: { delay: delaySec, works: false }, recommendation: delaySec === 0 ? 'Expected behavior — printer needs time to release sessions.' : `FIRMWARE: ${delaySec}s insufficient for session release. Need longer cooldown.` };
  };

  // ═══════════════════════════════════════════════════════
  // PHASE 5: EDGE CASES & LIMITS
  // ═══════════════════════════════════════════════════════
  const phase5: TestPhase = {
    id: 'phase5',
    name: 'Phase 5: Edge Cases & Limits',
    icon: <AlertTriangle className="w-4 h-4" />,
    plainEnglish: 'These tests push the printer to its limits to find hidden bugs. They test things like: what happens if two computers try to connect at once?',
    beforeYouStart: [
      'Make sure no other apps or computers are trying to connect to this printer',
      'Don\'t skip these — they reveal the trickiest bugs',
    ],
    tests: [
      {
        id: '5.1',
        name: '5.1 — Two Connections at Once',
        plainEnglish: 'We try to open TWO connections to the printer at the same time. Most printers only allow one — this test documents what happens.',
        whatItDoes: 'Opens connection A, then tries to open connection B. Then checks if A still works.',
        ifItFails: 'This is EXPECTED to fail — it confirms the single-session limit. What matters is HOW it fails.',
        passCriteria: 'Documents firmware behavior',
        estimatedTime: '~10 seconds',
        run: async () => {
          const ID_A = printerId;
          const ID_B = printerId - 1;

          const r1 = await connectPrinter(ID_A, ip, port);
          const details = [`Step 1 — Connection A: ${r1.success ? '✓ Open' : '✗ Failed'} (${r1.elapsed}ms)`];
          if (!r1.success) return { status: 'fail', message: `First connection failed: ${r1.error}`, details };

          const r2 = await connectPrinter(ID_B, ip, port);
          details.push(`Step 2 — Connection B (while A is open): ${r2.success ? '✓ Also opened!' : '✗ Blocked'} (${r2.elapsed}ms)`);

          const check = await sendCmd(ID_A, '^VV');
          details.push(`Step 3 — Is Connection A still alive? ${check.success ? '✓ Yes' : '✗ NO — it got killed!'}`);

          await window.electronAPI!.printer.disconnect(ID_B).catch(() => {});
          await window.electronAPI!.printer.disconnect(ID_A).catch(() => {});

          if (!r2.success) {
            details.push('', '✅ This is GOOD — the printer correctly blocks multiple connections.', 'CodeSync must never try to open a second connection.');
            return { status: 'pass', message: `Single-session confirmed — printer blocks second connection ✓`, details, rawData: { singleSession: true, secondBlocked: true } };
          }
          if (!check.success) {
            details.push('', '⚠ DANGER — opening a second connection KILLED the first one!', 'This means if any other app connects, CodeSync will lose its connection.');
            return { status: 'warn', message: 'Second connection DESTROYED the first one!', details, rawData: { singleSession: true, secondKillsFirst: true }, recommendation: 'FIRMWARE: Second connection kills the first. No other apps must connect to this printer while CodeSync is running.' };
          }
          details.push('', '🎉 Rare! This printer supports multiple sessions.');
          return { status: 'pass', message: 'Printer supports multiple simultaneous connections — rare but great!', details, rawData: { singleSession: false } };
        },
      },
      {
        id: '5.2',
        name: '5.2 — Send a Nonsense Command',
        plainEnglish: 'We send a made-up command the printer doesn\'t know. This checks if bad commands crash the connection.',
        whatItDoes: 'Sends ^ZZ_INVALID and sees if the printer handles it gracefully or crashes.',
        ifItFails: 'Invalid commands crash the session. CodeSync must be very careful to only send valid commands.',
        passCriteria: 'Printer handles it without crashing',
        estimatedTime: '~5 seconds',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const r = await sendCmd(printerId, '^ZZ_INVALID');
          const details = [`Sent: ^ZZ_INVALID (a command that doesn't exist)`, `Response: ${r.response || '(nothing)'}`, `Time: ${r.elapsed}ms`];

          // Check if connection still works
          const check = await sendCmd(printerId, '^VV');
          details.push('', `Connection still alive after bad command? ${check.success ? '✓ Yes' : '✗ NO — it crashed!'}`);

          if (check.success) return { status: 'pass', message: `Printer handled the bad command gracefully — connection still works ✓`, timing: r.elapsed, details, rawData: { graceful: true } };
          return { status: 'fail', message: 'Bad command CRASHED the connection!', details, rawData: { graceful: false }, recommendation: 'FIRMWARE: Invalid commands kill the session. CodeSync must validate all commands before sending.' };
        },
      },
    ],
  };

  // ═══════════════════════════════════════════════════════
  // PHASE 6: NETWORK QUALITY
  // ═══════════════════════════════════════════════════════
  const phase6: TestPhase = {
    id: 'phase6',
    name: 'Phase 6: Network Quality (WiFi vs Wired)',
    icon: <Wifi className="w-4 h-4" />,
    plainEnglish: 'These tests check if your network is good enough for reliable Telnet. WiFi is usually bad for this — wired Ethernet is much better.',
    beforeYouStart: [
      'Run this phase to find out if your network is the problem',
      'If you\'re on WiFi, consider running these tests again after switching to Ethernet',
    ],
    tests: [
      {
        id: '6.1',
        name: '6.1 — Network Jitter Test (20 Pings)',
        plainEnglish: 'We ping the printer 20 times and measure how consistent the timing is. Consistent = wired. Inconsistent = probably WiFi.',
        whatItDoes: 'Measures "jitter" — the variation in ping times. Low jitter means a stable, wired connection. High jitter means WiFi or a bad cable.',
        ifItFails: 'High jitter will cause random Telnet failures. Switch to a wired Ethernet connection.',
        passCriteria: 'Jitter under 10ms, 0% packet loss',
        estimatedTime: '~15 seconds',
        run: async () => {
          const details: string[] = ['Pinging printer 20 times to measure consistency...', ''];
          const times: number[] = [];
          let lost = 0;

          for (let i = 0; i < 20; i++) {
            const t0 = performance.now();
            const result = await window.electronAPI!.printer.checkStatus([{ id: printerId, ipAddress: ip, port }]);
            const dt = Math.round(performance.now() - t0);
            const r = result?.[0];
            if (r?.isAvailable) {
              times.push(dt);
              if (i % 5 === 0) details.push(`  Ping ${i + 1}: ${dt}ms ✓`);
            } else {
              lost++;
              details.push(`  Ping ${i + 1}: ❌ LOST`);
            }
            await sleep(500);
          }

          const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
          const min = times.length > 0 ? Math.min(...times) : 0;
          const max = times.length > 0 ? Math.max(...times) : 0;
          const jitter = max - min;
          const lossRate = Math.round((lost / 20) * 100);

          details.push('', '📊 Results:', `  Average: ${avg}ms`, `  Fastest: ${min}ms`, `  Slowest: ${max}ms`, `  Jitter (variation): ${jitter}ms`, `  Packets lost: ${lost}/20 (${lossRate}%)`);
          details.push('', '🔍 What does this mean?');

          if (jitter < 5) details.push('  ✅ EXCELLENT — Very stable, almost certainly a wired connection');
          else if (jitter < 10) details.push('  ✅ GOOD — Stable enough for Telnet');
          else if (jitter < 50) details.push('  ⚠ MODERATE — Could be WiFi or a shared switch. May cause occasional issues');
          else details.push('  ❌ HIGH JITTER — Almost certainly WiFi. Will cause frequent Telnet failures!');

          if (lost > 0) {
            return { status: 'fail', message: `${lossRate}% packet loss! Network is unreliable`, details, rawData: { avg, min, max, jitter, lost, lossRate }, recommendation: `NETWORK: ${lost}/20 pings lost. Check cables, WiFi signal, or switch port.` };
          }
          if (jitter > 50) return { status: 'warn', message: `High jitter (${jitter}ms) — likely WiFi, should use Ethernet`, timing: avg, details, rawData: { avg, min, max, jitter, lost: 0, lossRate: 0 }, recommendation: 'NETWORK: High jitter indicates WiFi. Switch to wired Ethernet for reliable Telnet.' };
          if (jitter > 10) return { status: 'warn', message: `Moderate jitter (${jitter}ms) — borderline`, timing: avg, details, rawData: { avg, min, max, jitter, lost: 0, lossRate: 0 }, recommendation: 'NETWORK: Moderate jitter. If you see intermittent failures, switch to Ethernet.' };
          return { status: 'pass', message: `Stable network — jitter ${jitter}ms, 0% loss ✓`, timing: avg, details, rawData: { avg, min, max, jitter, lost: 0, lossRate: 0 } };
        },
      },
      {
        id: '6.2',
        name: '6.2 — WiFi or Wired? (Auto-Detect)',
        plainEnglish: 'Based on ping patterns, we\'ll make our best guess whether you\'re connected via WiFi or Ethernet cable.',
        whatItDoes: 'Analyzes ping response time patterns. Wired connections are fast and consistent. WiFi is slower and varies a lot.',
        ifItFails: 'If WiFi is detected, switching to Ethernet will likely fix many of your connection problems.',
        passCriteria: 'Connection type identified',
        estimatedTime: '~8 seconds',
        run: async () => {
          const times: number[] = [];
          for (let i = 0; i < 10; i++) {
            const t0 = performance.now();
            const result = await window.electronAPI!.printer.checkStatus([{ id: printerId, ipAddress: ip, port }]);
            const dt = Math.round(performance.now() - t0);
            if (result?.[0]?.isAvailable) times.push(dt);
            await sleep(300);
          }

          if (times.length < 5) {
            return { status: 'fail', message: 'Too many pings lost — can\'t determine connection type', recommendation: 'NETWORK: Cannot sustain basic pings. Fix physical connectivity first.' };
          }

          const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
          const variance = Math.round(Math.sqrt(times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length));
          const details = [
            '📊 Analysis:', `  Average ping: ${avg}ms`, `  Variation (std dev): ${variance}ms`, `  Samples: ${times.map(t => `${t}ms`).join(', ')}`, '',
          ];

          let verdict: string;
          if (avg < 5 && variance < 3) {
            verdict = '🔌 WIRED (Direct Ethernet) — Perfect for Telnet!';
            details.push('✅ Low latency + low variation = direct Ethernet cable');
            return { status: 'pass', message: verdict, timing: avg, details, rawData: { type: 'wired-direct', avg, variance } };
          } else if (avg < 15 && variance < 10) {
            verdict = '🔌 WIRED (Through Switch/Hub) — Good for Telnet';
            details.push('✅ Slightly higher latency, but still consistent — going through network equipment');
            return { status: 'pass', message: verdict, timing: avg, details, rawData: { type: 'wired-switch', avg, variance } };
          } else if (variance > 20) {
            verdict = '📶 WIRELESS (WiFi) — NOT recommended for Telnet!';
            details.push('⚠ High variation in response times is a hallmark of WiFi');
            details.push('WiFi causes random latency spikes that WILL break Telnet polling');
            details.push('', '🔧 Recommendation: Connect via Ethernet cable');
            return { status: 'warn', message: verdict, timing: avg, details, rawData: { type: 'wifi', avg, variance }, recommendation: 'NETWORK: WiFi detected. Industrial printers should use Ethernet for reliable Telnet.' };
          } else {
            verdict = `🤔 UNCERTAIN — avg ${avg}ms, variation ${variance}ms`;
            details.push('Can\'t definitively determine connection type from these patterns');
            return { status: 'warn', message: verdict, timing: avg, details, rawData: { type: 'uncertain', avg, variance } };
          }
        },
      },
      {
        id: '6.3',
        name: '6.3 — Sustained Network Test (30 Seconds)',
        plainEnglish: 'We hammer the network with 60 pings over 30 seconds. This catches intermittent dropouts that only show up under sustained load — common with cheap switches.',
        whatItDoes: 'Sends pings every 500ms for 30 seconds. Tracks consecutive losses which indicate hardware problems.',
        ifItFails: 'Your network hardware (switch, hub, or cable) has intermittent problems. Try a different port on the switch or replace the cable.',
        passCriteria: 'Under 2% packet loss, no consecutive drops',
        estimatedTime: '~35 seconds',
        run: async () => {
          const details: string[] = ['Pinging every 500ms for 30 seconds (60 pings)...', ''];
          const times: number[] = [];
          let lost = 0;
          let maxConsecutiveLost = 0;
          let currentConsecutiveLost = 0;

          for (let i = 0; i < 60; i++) {
            if (abortRef.current) { details.push('--- STOPPED ---'); break; }
            const t0 = performance.now();
            const result = await window.electronAPI!.printer.checkStatus([{ id: printerId, ipAddress: ip, port }]);
            const dt = Math.round(performance.now() - t0);
            const r = result?.[0];
            if (r?.isAvailable) {
              times.push(dt);
              currentConsecutiveLost = 0;
              if (i % 15 === 0) details.push(`  Second ${Math.round(i / 2)}: Ping ${i + 1} — ✓ ${dt}ms`);
            } else {
              lost++;
              currentConsecutiveLost++;
              maxConsecutiveLost = Math.max(maxConsecutiveLost, currentConsecutiveLost);
              details.push(`  Second ${Math.round(i / 2)}: Ping ${i + 1} — ❌ LOST`);
            }
            await sleep(500);
          }

          const lossRate = Math.round((lost / 60) * 100);
          const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
          details.push('', '📊 Results:', `  Packets sent: 60`, `  Lost: ${lost} (${lossRate}%)`, `  Max consecutive losses: ${maxConsecutiveLost}`, `  Average ping: ${avg}ms`);

          if (maxConsecutiveLost >= 3) details.push('', '⚠ Multiple consecutive losses suggest a cable or hardware issue, not just WiFi');

          if (lost === 0) return { status: 'pass', message: `30 seconds, zero drops — network is rock solid ✓`, timing: avg, details, rawData: { lossRate, maxConsecutiveLost, avg, lost } };
          if (lossRate <= 2 && maxConsecutiveLost < 3) return { status: 'warn', message: `${lossRate}% loss — minor issue, mostly stable`, details, rawData: { lossRate, maxConsecutiveLost, avg, lost } };
          return { status: 'fail', message: `${lossRate}% loss, ${maxConsecutiveLost} consecutive drops — network problem!`, details, rawData: { lossRate, maxConsecutiveLost, avg, lost }, recommendation: `NETWORK: ${lossRate}% packet loss with ${maxConsecutiveLost} consecutive drops. Check cable, switch port, or WiFi signal.` };
        },
      },
    ],
  };

  // ═══════════════════════════════════════════════════════
  // PHASE 7: APP BUILD & DEPLOYMENT
  // ═══════════════════════════════════════════════════════
  const phase7: TestPhase = {
    id: 'phase7',
    name: 'Phase 7: App Build & Deployment',
    icon: <Server className="w-4 h-4" />,
    plainEnglish: 'These tests check if CodeSync itself is installed and configured correctly — the Electron app, auto-updater, relay server, and build pipeline.',
    beforeYouStart: [
      'These tests check the app itself, not the printer',
      'Some tests work even without a printer connected',
    ],
    tests: [
      {
        id: '7.1',
        name: '7.1 — Is This the Desktop App?',
        plainEnglish: 'Check if you\'re running the full desktop app (Electron) or just the web browser version. The desktop app is required for printer communication.',
        whatItDoes: 'Checks for the Electron environment and reads the app version number.',
        ifItFails: 'You\'re running in a web browser. Download and install the desktop app from the GitHub releases page.',
        passCriteria: 'Electron detected with version number',
        estimatedTime: '~1 second',
        run: async () => {
          if (!window.electronAPI) {
            return { status: 'fail', message: 'NOT running in Electron — this is the web browser version', details: ['The web browser version cannot communicate with printers.', 'You need the desktop app (CodeSync.exe) installed.', '', '🔧 How to fix:', '  Download the latest installer from GitHub Releases', '  Install and run CodeSync from the desktop shortcut'], rawData: { isElectron: false } };
          }
          const details: string[] = ['✓ Running in Electron (desktop app)'];
          let version = 'unknown';
          try {
            version = await window.electronAPI.app.getVersion();
            details.push(`App version: ${version}`);
          } catch { details.push('Could not read version number'); }

          return { status: 'pass', message: `Desktop app confirmed — version ${version} ✓`, details, rawData: { isElectron: true, version } };
        },
      },
      {
        id: '7.2',
        name: '7.2 — Auto-Updater Status',
        plainEnglish: 'Check if the app can detect and download updates from GitHub. This keeps CodeSync up to date automatically.',
        whatItDoes: 'Reads the auto-updater state — is it idle, downloading, or has an update ready?',
        ifItFails: 'Updates might not work. You may need to download new versions manually.',
        passCriteria: 'Updater is active',
        estimatedTime: '~2 seconds',
        run: async () => {
          if (!window.electronAPI) return { status: 'fail', message: 'Not in Electron', rawData: { isElectron: false } };
          const details: string[] = [];
          try {
            const state = await window.electronAPI.app.getUpdateState();
            details.push(`Current state: ${state.stage}`);
            if (state.info) details.push(`Update info: ${JSON.stringify(state.info).substring(0, 200)}`);
            if (state.progress) details.push(`Download progress: ${Math.round(state.progress.percent)}%`);

            if (state.stage === 'idle') return { status: 'pass', message: 'Updater is idle — you\'re up to date ✓', details, rawData: { stage: state.stage } };
            if (state.stage === 'downloading') return { status: 'warn', message: 'An update is currently downloading...', details, rawData: { stage: state.stage, progress: state.progress } };
            if (state.stage === 'ready') return { status: 'pass', message: 'Update downloaded — will install when you restart ✓', details, rawData: { stage: state.stage, info: state.info } };
            return { status: 'pass', message: `Updater state: ${state.stage}`, details, rawData: { stage: state.stage } };
          } catch (err: any) {
            return { status: 'warn', message: `Updater check failed: ${err.message}`, details, rawData: { error: err.message } };
          }
        },
      },
      {
        id: '7.3',
        name: '7.3 — Updater Log Check',
        plainEnglish: 'We read the updater\'s log file to check for errors — like failed downloads or authentication issues with GitHub.',
        whatItDoes: 'Reads and analyzes the auto-updater log for errors, warnings, and recent update events.',
        ifItFails: 'There are errors in the updater. Check the details for specific error messages.',
        passCriteria: 'No errors in the log',
        estimatedTime: '~2 seconds',
        run: async () => {
          if (!window.electronAPI) return { status: 'fail', message: 'Not in Electron' };
          try {
            const log = await window.electronAPI.app.getUpdaterLog();
            const lines = log.split('\n').filter((l: string) => l.trim());
            const errors = lines.filter((l: string) => l.includes('[error]') || l.includes('Error:'));
            const updates = lines.filter((l: string) => l.includes('Update available') || l.includes('update-downloaded'));

            const details = [`Total log entries: ${lines.length}`, `Errors found: ${errors.length}`, `Update events: ${updates.length}`, ''];

            if (errors.length > 0) {
              details.push('❌ Recent Errors:');
              errors.slice(-5).forEach((e: string) => details.push(`  ${e.trim()}`));
            }
            if (updates.length > 0) {
              details.push('', '📦 Update Events:');
              updates.slice(-3).forEach((u: string) => details.push(`  ${u.trim()}`));
            }
            details.push('', 'Last 5 log lines:');
            lines.slice(-5).forEach((l: string) => details.push(`  ${l.trim()}`));

            if (errors.length > 0) return { status: 'warn', message: `${errors.length} errors in updater log`, details, rawData: { totalLines: lines.length, errorCount: errors.length, recentErrors: errors.slice(-5) }, recommendation: `BUILD: ${errors.length} updater errors. Common causes: no internet, dev mode, or missing GitHub release.` };
            return { status: 'pass', message: `Updater log clean — ${lines.length} entries ✓`, details, rawData: { totalLines: lines.length, errorCount: 0 } };
          } catch (err: any) {
            return { status: 'warn', message: `Could not read updater log: ${err.message}`, rawData: { error: err.message } };
          }
        },
      },
      {
        id: '7.4',
        name: '7.4 — Relay Server (For Mobile)',
        plainEnglish: 'Check if the relay server is running. This is what lets phones/tablets control the printer through this PC.',
        whatItDoes: 'Checks the HTTP relay server that bridges mobile PWA clients to the printer TCP connection.',
        ifItFails: 'Mobile/tablet access won\'t work. The relay starts automatically — try restarting the app.',
        passCriteria: 'Relay server is active',
        estimatedTime: '~2 seconds',
        run: async () => {
          if (!window.electronAPI) return { status: 'fail', message: 'Not in Electron' };
          try {
            const info = await window.electronAPI.relay.getInfo();
            const details = [`Relay port: ${info.port}`, `Network interfaces: ${info.ips?.join(', ') || 'none found'}`, ''];
            if (info.ips && info.ips.length > 0) {
              details.push('📱 Mobile devices can connect at:');
              info.ips.forEach((ipAddr: string) => details.push(`  http://${ipAddr}:${info.port}`));
            }
            return { status: 'pass', message: `Relay active on port ${info.port} — ${info.ips?.length || 0} interfaces ✓`, details, rawData: { port: info.port, ips: info.ips } };
          } catch (err: any) {
            return { status: 'warn', message: `Relay not responding: ${err.message}`, rawData: { error: err.message }, recommendation: 'BUILD: Relay server is not running. Mobile devices won\'t be able to connect.' };
          }
        },
      },
      {
        id: '7.5',
        name: '7.5 — Latest Build Status',
        plainEnglish: 'Check if the most recent GitHub build succeeded. If the build failed, the latest fixes won\'t be in the installer.',
        whatItDoes: 'Calls the backend to check the status of the most recent GitHub Actions build workflow.',
        ifItFails: 'The latest build failed. Check GitHub for error details.',
        passCriteria: 'Latest build completed successfully',
        estimatedTime: '~3 seconds',
        run: async () => {
          try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
            if (!supabaseUrl || !supabaseKey) return { status: 'warn', message: 'Backend not configured — can\'t check build status', rawData: { configured: false } };

            const res = await fetch(`${supabaseUrl}/functions/v1/github-build-status`, {
              headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            });
            if (!res.ok) return { status: 'warn', message: `Build status API returned ${res.status}`, rawData: { httpStatus: res.status } };

            const data = await res.json();
            const details = [`Status: ${data.status || 'unknown'}`, `Conclusion: ${data.conclusion || 'unknown'}`, `Branch: ${data.head_branch || 'unknown'}`, `Created: ${data.created_at || 'unknown'}`];

            if (data.conclusion === 'success') return { status: 'pass', message: 'Latest build succeeded ✓', details, rawData: data };
            if (data.conclusion === 'failure') return { status: 'fail', message: 'Latest build FAILED', details, rawData: data, recommendation: 'BUILD: Latest GitHub build failed. Check workflow logs for errors.' };
            if (data.status === 'in_progress') return { status: 'warn', message: 'Build is currently running...', details, rawData: data };
            return { status: 'pass', message: `Build: ${data.conclusion || data.status || 'unknown'}`, details, rawData: data };
          } catch (err: any) {
            return { status: 'warn', message: `Could not check: ${err.message}`, rawData: { error: err.message } };
          }
        },
      },
    ],
  };

  const phases = [phase1, phase2, phase3, phase4, phase5, phase6, phase7];

  // --- Run a single test ---
  const runTest = useCallback(async (test: TestDef) => {
    if (!isElectron && !['7.1', '7.5'].includes(test.id)) return;
    setRunningTest(test.id);
    updateResult(test.id, { status: 'running', message: 'Running... please wait' });
    try {
      const result = await test.run();
      updateResult(test.id, result);
    } catch (err: any) {
      updateResult(test.id, { status: 'fail', message: `Something went wrong: ${err.message}` });
    }
    setRunningTest(null);
  }, [isElectron]);

  // --- Run all tests in a phase ---
  const runPhase = useCallback(async (phase: TestPhase) => {
    if (!isElectron) return;
    setRunningAll(true);
    abortRef.current = false;
    setExpandedPhase(phase.id);

    for (const test of phase.tests) {
      if (abortRef.current) break;
      setRunningTest(test.id);
      updateResult(test.id, { status: 'running', message: 'Running... please wait' });
      try {
        const result = await test.run();
        updateResult(test.id, result);
        if (result.status === 'fail' && phase.id === 'phase1') break;
      } catch (err: any) {
        updateResult(test.id, { status: 'fail', message: `Error: ${err.message}` });
      }
      setRunningTest(null);
      await sleep(1000);
      await window.electronAPI!.printer.disconnect(printerId).catch(() => {});
      await sleep(2000);
    }

    setRunningAll(false);
    setRunningTest(null);
  }, [isElectron, printerId]);

  // --- Run all tests ---
  const runAllTests = useCallback(async () => {
    if (!isElectron) return;
    setRunningAll(true);
    abortRef.current = false;
    setCurrentPhaseIndex(0);

    for (let pi = 0; pi < phases.length; pi++) {
      const phase = phases[pi];
      setCurrentPhaseIndex(pi);
      setExpandedPhase(phase.id);

      for (const test of phase.tests) {
        if (abortRef.current) break;
        setRunningTest(test.id);
        updateResult(test.id, { status: 'running', message: 'Running... please wait' });
        try {
          const result = await test.run();
          updateResult(test.id, result);
          if (result.status === 'fail' && phase.id === 'phase1') {
            setRunningTest(null);
            break;
          }
        } catch (err: any) {
          updateResult(test.id, { status: 'fail', message: `Error: ${err.message}` });
        }
        setRunningTest(null);
        await sleep(1000);
        await window.electronAPI!.printer.disconnect(printerId).catch(() => {});
        await sleep(2000);
      }
      if (abortRef.current) break;
    }

    setRunningAll(false);
    setRunningTest(null);
  }, [isElectron, phases, printerId]);

  // --- Generate report for clipboard ---
  const generateReport = (): string => {
    const lines: string[] = [
      '═══════════════════════════════════════════',
      '  CODESYNC TELNET DIAGNOSTIC REPORT',
      '═══════════════════════════════════════════',
      '',
      `Date: ${new Date().toISOString()}`,
      `Target: ${ip}:${port}`,
      `Electron: ${isElectron ? 'Yes' : 'No'}`,
      '',
    ];

    let hasAnyResult = false;

    for (const phase of phases) {
      const phaseResults = phase.tests.map(t => results[t.id]).filter(Boolean);
      if (phaseResults.length === 0) continue;
      hasAnyResult = true;

      lines.push(`── ${phase.name} ──`);
      for (const test of phase.tests) {
        const r = results[test.id];
        if (!r) { lines.push(`  ${test.id}: NOT RUN`); continue; }
        lines.push(`  ${test.id} [${r.status.toUpperCase()}]: ${r.message}`);
        if (r.timing != null) lines.push(`    Timing: ${r.timing}ms`);
        if (r.rawData) lines.push(`    Data: ${JSON.stringify(r.rawData)}`);
        if (r.details) r.details.forEach(d => lines.push(`    ${d}`));
        if (r.recommendation) lines.push(`    ⚡ ${r.recommendation}`);
      }
      lines.push('');
    }

    if (!hasAnyResult) {
      lines.push('No tests have been run yet.');
    }

    // Summary
    const allResults = Object.values(results);
    const passCount = allResults.filter(r => r.status === 'pass').length;
    const failCount = allResults.filter(r => r.status === 'fail').length;
    const warnCount = allResults.filter(r => r.status === 'warn').length;
    lines.push('── SUMMARY ──', `  Pass: ${passCount}  |  Warn: ${warnCount}  |  Fail: ${failCount}  |  Total: ${allResults.length}`);

    const findings = allResults.filter(r => r.recommendation).map(r => r.recommendation!);
    if (findings.length > 0) {
      lines.push('', '── KEY FINDINGS ──');
      findings.forEach((f, i) => lines.push(`  ${i + 1}. ${f}`));
    }

    lines.push('', '═══════════════════════════════════════════');
    return lines.join('\n');
  };

  const copyReport = async () => {
    const report = generateReport();
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      toast.success('Report copied! Paste it in the Lovable chat for analysis.');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      toast.success('Report copied!');
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const exportReport = () => {
    const report = generateReport();
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codesync-diag-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Status icon ---
  const StatusIcon = ({ status }: { status: TestStatus }) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'fail': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warn': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'running': return <Clock className="w-5 h-5 text-blue-400 animate-pulse" />;
      case 'skipped': return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />;
      default: return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/20" />;
    }
  };

  const totalTests = phases.reduce((sum, p) => sum + p.tests.length, 0);
  const ranTests = Object.keys(results).length;
  const passCount = Object.values(results).filter(r => r.status === 'pass').length;
  const failCount = Object.values(results).filter(r => r.status === 'fail').length;
  const warnCount = Object.values(results).filter(r => r.status === 'warn').length;
  const progress = totalTests > 0 ? Math.round((ranTests / totalTests) * 100) : 0;

  // ═══════════════════════════════════════════
  // PRE-FLIGHT SCREEN
  // ═══════════════════════════════════════════
  if (showPreFlight) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ClipboardCheck className="w-6 h-6 text-primary" />
              Before We Start — Pre-Flight Checklist
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Please confirm each item below. This makes sure we don't waste time on tests that will obviously fail.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {preFlightItems.map(item => (
              <label key={item.id} className="flex items-start gap-3 cursor-pointer hover:bg-muted/30 p-2 rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={!!preFlightChecks[item.id]}
                  onChange={e => setPreFlightChecks(prev => ({ ...prev, [item.id]: e.target.checked }))}
                  className="mt-0.5 w-5 h-5 rounded accent-primary"
                />
                <span className="text-sm">{item.label}</span>
              </label>
            ))}

            <Separator />

            <div className="flex gap-3">
              <Button
                onClick={() => setShowPreFlight(false)}
                disabled={!allPreFlightChecked}
                className="flex-1"
                size="lg"
              >
                <Play className="w-5 h-5 mr-2" />
                {allPreFlightChecked ? 'Ready — Let\'s Go!' : `Check all items first (${Object.values(preFlightChecks).filter(Boolean).length}/${preFlightItems.length})`}
              </Button>
              <Button variant="ghost" onClick={() => setShowPreFlight(false)}>
                Skip
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              💡 After running the tests, click "Copy Report" and paste it into the Lovable chat — I'll analyze everything and tell you exactly what to fix.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // MAIN TEST UI
  // ═══════════════════════════════════════════
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top Bar — Actions + Progress */}
      <div className="p-3 border-b border-border shrink-0 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" onClick={runAllTests} disabled={runningAll || !isElectron}>
            <Play className="w-4 h-4 mr-1" /> Run All Tests
          </Button>
          {runningAll && (
            <Button size="sm" variant="destructive" onClick={() => { abortRef.current = true; }}>
              <Square className="w-4 h-4 mr-1" /> Stop
            </Button>
          )}

          <div className="flex-1" />

          {/* Scores */}
          <div className="flex items-center gap-2">
            {passCount > 0 && <Badge className="bg-green-500/20 text-green-500 border-green-500/30">{passCount} ✓</Badge>}
            {warnCount > 0 && <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">{warnCount} ⚠</Badge>}
            {failCount > 0 && <Badge className="bg-red-500/20 text-red-500 border-red-500/30">{failCount} ✗</Badge>}
            <span className="text-xs text-muted-foreground">{ranTests}/{totalTests} tests run</span>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Report buttons */}
          <Button size="sm" variant="outline" onClick={copyReport} className="gap-1">
            {copied ? <CheckCheck className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Report'}
          </Button>
          <Button size="sm" variant="ghost" onClick={exportReport}>
            <Download className="w-4 h-4" />
          </Button>
        </div>

        {runningAll && (
          <div className="space-y-1">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Running Phase {currentPhaseIndex + 1}/{phases.length}... {runningTest && `Test ${runningTest}`}
            </p>
          </div>
        )}

        {ranTests > 0 && !runningAll && (
          <div className="bg-muted/50 rounded-lg p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <strong>Done?</strong> Click <strong>"Copy Report"</strong> above, then go back to the Lovable chat and paste it. 
              I'll read all the results and tell you exactly what's wrong and how to fix it.
            </p>
          </div>
        )}
      </div>

      {/* Phase List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {phases.map((phase, phaseIdx) => {
            const isExpanded = expandedPhase === phase.id;
            const phaseResults = phase.tests.map(t => results[t.id]?.status).filter(Boolean);
            const phaseFailed = phaseResults.includes('fail');
            const phaseAllPassed = phaseResults.length === phase.tests.length && phaseResults.every(s => s === 'pass');
            const phaseHasResults = phaseResults.length > 0;

            return (
              <Card key={phase.id} className={phaseFailed ? 'border-red-500/50' : phaseAllPassed ? 'border-green-500/50' : ''}>
                {/* Phase Header */}
                <button
                  className="w-full text-left p-4 flex items-center gap-3"
                  onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                >
                  {isExpanded ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
                  <span className="shrink-0">{phase.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{phase.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{phase.plainEnglish}</div>
                  </div>
                  {phaseAllPassed && <Badge className="bg-green-500/20 text-green-500 border-green-500/30 shrink-0">All Pass ✓</Badge>}
                  {phaseFailed && <Badge className="bg-red-500/20 text-red-500 border-red-500/30 shrink-0">Has Failures</Badge>}
                  {!phaseHasResults && <Badge variant="outline" className="shrink-0 text-muted-foreground">Not Run</Badge>}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Before You Start */}
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">📋 Before you start this phase:</p>
                      {phase.beforeYouStart.map((item, i) => (
                        <p key={i} className="text-xs text-muted-foreground">• {item}</p>
                      ))}
                      <div className="pt-2">
                        <Button size="sm" variant="secondary" onClick={() => runPhase(phase)} disabled={runningAll || !isElectron}>
                          <Play className="w-3 h-3 mr-1" /> Run This Phase
                        </Button>
                      </div>
                    </div>

                    {/* Individual Tests */}
                    {phase.tests.map(test => {
                      const result = results[test.id];
                      const isTestExpanded = expandedTest === test.id;
                      const isRunning = runningTest === test.id;

                      return (
                        <div key={test.id} className="border border-border rounded-lg overflow-hidden">
                          {/* Test Header */}
                          <div className="flex items-center gap-3 p-3 bg-muted/20">
                            <StatusIcon status={result?.status || 'pending'} />
                            <button
                              className="flex-1 text-left min-w-0"
                              onClick={() => setExpandedTest(isTestExpanded ? null : test.id)}
                            >
                              <div className="text-sm font-medium">{test.name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{test.plainEnglish}</div>
                            </button>
                            <span className="text-[10px] text-muted-foreground shrink-0">{test.estimatedTime}</span>
                            {result?.timing != null && (
                              <span className="text-xs font-mono text-muted-foreground shrink-0">{result.timing}ms</span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isRunning || runningAll}
                              onClick={(e) => { e.stopPropagation(); runTest(test); }}
                              className="h-8 px-2 shrink-0"
                            >
                              {isRunning ? <Clock className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            </Button>
                          </div>

                          {/* Expanded Details */}
                          {isTestExpanded && (
                            <div className="p-4 text-sm space-y-3 border-t border-border bg-background">
                              <div className="grid grid-cols-1 gap-2">
                                <div className="bg-muted/30 rounded p-2">
                                  <span className="text-xs font-semibold text-muted-foreground">🔍 What it does:</span>
                                  <p className="text-xs text-foreground/80 mt-1">{test.whatItDoes}</p>
                                </div>
                                <div className="bg-muted/30 rounded p-2">
                                  <span className="text-xs font-semibold text-muted-foreground">❌ If it fails:</span>
                                  <p className="text-xs text-foreground/80 mt-1">{test.ifItFails}</p>
                                </div>
                                <div className="bg-muted/30 rounded p-2">
                                  <span className="text-xs font-semibold text-muted-foreground">✅ Pass criteria:</span>
                                  <p className="text-xs text-foreground/80 mt-1">{test.passCriteria}</p>
                                </div>
                              </div>

                              {result && result.status !== 'pending' && result.status !== 'running' && (
                                <>
                                  <Separator />
                                  <div className={`rounded-lg p-3 ${result.status === 'pass' ? 'bg-green-500/10 border border-green-500/30' : result.status === 'fail' ? 'bg-red-500/10 border border-red-500/30' : 'bg-yellow-500/10 border border-yellow-500/30'}`}>
                                    <p className={`font-semibold ${result.status === 'pass' ? 'text-green-500' : result.status === 'fail' ? 'text-red-500' : 'text-yellow-500'}`}>
                                      {result.status === 'pass' ? '✅ PASSED' : result.status === 'fail' ? '❌ FAILED' : '⚠ WARNING'}: {result.message}
                                    </p>
                                  </div>

                                  {result.details && (
                                    <div className="font-mono text-xs bg-muted/50 rounded-lg p-3 space-y-0.5 max-h-64 overflow-y-auto">
                                      {result.details.map((d, i) => (
                                        <div key={i} className="text-foreground/80 whitespace-pre-wrap">{d}</div>
                                      ))}
                                    </div>
                                  )}

                                  {result.recommendation && (
                                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                                      <p className="text-xs font-semibold text-yellow-500">💡 Finding:</p>
                                      <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">{result.recommendation}</p>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
