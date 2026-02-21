import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Play, CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronDown, ChevronRight, Download, SkipForward, Square
} from 'lucide-react';

// --- Types ---
type TestStatus = 'pending' | 'running' | 'pass' | 'fail' | 'warn' | 'skipped';

interface TestResult {
  status: TestStatus;
  message: string;
  timing?: number;
  details?: string[];
  recommendation?: string;
}

interface TestDef {
  id: string;
  name: string;
  description: string;
  passCriteria: string;
  run: () => Promise<TestResult>;
}

interface TestPhase {
  id: string;
  name: string;
  description: string;
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
  const [expandedPhase, setExpandedPhase] = useState<string | null>('phase1');
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [runningTest, setRunningTest] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [findings, setFindings] = useState<string[]>([]);
  const abortRef = useRef(false);

  const updateResult = (testId: string, result: TestResult) => {
    setResults(prev => ({ ...prev, [testId]: result }));
    if (result.recommendation) {
      setFindings(prev => prev.includes(result.recommendation!) ? prev : [...prev, result.recommendation!]);
    }
  };

  // ═══════════════════════════════════════════════════════
  // PHASE 1: NETWORK LAYER
  // ═══════════════════════════════════════════════════════
  const phase1: TestPhase = {
    id: 'phase1',
    name: 'Phase 1: Network Layer',
    description: 'Verify basic IP connectivity before attempting Telnet',
    tests: [
      {
        id: '1.1',
        name: '1.1 — ICMP Ping',
        description: 'Send an ICMP ping to verify the printer is reachable on the network.',
        passCriteria: 'Ping response received within 2500ms',
        run: async () => {
          const result = await window.electronAPI!.printer.checkStatus([{ id: printerId, ipAddress: ip, port }]);
          const r = result?.[0];
          if (r?.isAvailable) {
            return { status: 'pass', message: `Printer is reachable`, timing: r.responseTime, details: [`Response time: ${r.responseTime}ms`] };
          }
          return { status: 'fail', message: `Printer not reachable via ICMP`, details: [r?.error || 'No response'], recommendation: 'NETWORK: Printer is not responding to ping. Check cables, IP address, and that the printer is powered on.' };
        },
      },
      {
        id: '1.2',
        name: '1.2 — TCP Connect (Port 23)',
        description: 'Open a raw TCP connection to the Telnet port. Measures time to TCP handshake completion.',
        passCriteria: 'TCP connection established within 5000ms',
        run: async () => {
          const r = await connectPrinter(printerId, ip, port);
          if (r.success) {
            await disconnectPrinter(printerId);
            await sleep(2000); // let firmware release
            const verdict = r.elapsed < 2000 ? 'pass' as const : 'warn' as const;
            return {
              status: verdict,
              message: `TCP connected in ${r.elapsed}ms ${r.reused ? '(reused)' : '(new)'}`,
              timing: r.elapsed,
              details: [
                `Connect time: ${r.elapsed}ms`,
                r.elapsed > 2000 ? '⚠ Slow — firmware may be overloaded or network has high latency' : '✓ Normal connect time',
              ],
              recommendation: r.elapsed > 3000 ? 'NETWORK: TCP connect is unusually slow. Check for IP conflicts, firewall rules, or switch port issues.' : undefined,
            };
          }
          return { status: 'fail', message: `TCP connect failed: ${r.error}`, timing: r.elapsed, details: [`Error: ${r.error}`, `Elapsed: ${r.elapsed}ms`], recommendation: `NETWORK: Cannot open TCP port ${port}. Ensure Telnet/Remote Comms is enabled on the printer and no firewall is blocking port ${port}.` };
        },
      },
      {
        id: '1.3',
        name: '1.3 — Connect + Disconnect + Reconnect',
        description: 'Test a full connect → disconnect → wait → reconnect cycle. Reveals if the firmware properly releases the TCP session.',
        passCriteria: 'Both connections succeed. Second connect < 5000ms.',
        run: async () => {
          const details: string[] = [];

          // First connect
          const r1 = await connectPrinter(printerId, ip, port);
          details.push(`Connect 1: ${r1.success ? '✓' : '✗'} (${r1.elapsed}ms) ${r1.error || ''}`);
          if (!r1.success) return { status: 'fail', message: `First connect failed: ${r1.error}`, details, recommendation: 'FIRMWARE: Printer rejected the first connection. Is another session active? Try power-cycling the printer.' };

          // Disconnect
          const d = await disconnectPrinter(printerId);
          details.push(`Disconnect: ✓ (${d.elapsed}ms)`);

          // Wait for firmware session release
          details.push('Waiting 15s for firmware session release...');
          await sleep(15000);

          // Reconnect
          const r2 = await connectPrinter(printerId, ip, port);
          details.push(`Connect 2: ${r2.success ? '✓' : '✗'} (${r2.elapsed}ms) ${r2.error || ''}`);

          if (r2.success) {
            await disconnectPrinter(printerId);
            return { status: 'pass', message: `Reconnect OK in ${r2.elapsed}ms (15s wait was sufficient)`, timing: r2.elapsed, details };
          }
          return {
            status: 'fail',
            message: `Reconnect FAILED after 15s wait: ${r2.error}`,
            timing: r2.elapsed,
            details,
            recommendation: 'FIRMWARE: Printer did not release TCP session after 15 seconds. May need longer cooldown, or firmware has a session leak bug. Try power-cycling.'
          };
        },
      },
    ],
  };

  // ═══════════════════════════════════════════════════════
  // PHASE 2: TELNET HANDSHAKE
  // ═══════════════════════════════════════════════════════
  const phase2: TestPhase = {
    id: 'phase2',
    name: 'Phase 2: Telnet Handshake & Protocol',
    description: 'Verify Telnet negotiation completes and the printer accepts commands',
    tests: [
      {
        id: '2.1',
        name: '2.1 — Connect + First Command',
        description: 'Connect and immediately send ^VV (version). Tests that Telnet negotiation completes and the printer is ready for commands.',
        passCriteria: 'Version response received containing version number',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}`, recommendation: 'See Phase 1 tests for network diagnosis' };

          // Give handshake time to settle
          await sleep(500);

          const r = await sendCmd(printerId, '^VV');
          const details = [`Connect: ${rc.elapsed}ms`, `^VV response time: ${r.elapsed}ms`, `Response: ${r.response || '(empty)'}`];

          if (r.success && r.response && r.response.length > 2) {
            return { status: 'pass', message: `Version received in ${r.elapsed}ms`, timing: r.elapsed, details };
          }
          // Don't disconnect — leave for next test
          return { status: 'fail', message: `No valid response to ^VV: ${r.error || '(empty)'}`, timing: r.elapsed, details, recommendation: 'PROTOCOL: Printer connected but is not responding to commands. Check that Remote Comms protocol version is v2.0+ and the printer is not in a fault state.' };
        },
      },
      {
        id: '2.2',
        name: '2.2 — Command Inventory',
        description: 'Send each core command and verify the printer responds. Tests protocol coverage.',
        passCriteria: 'All 6 core commands return valid responses',
        run: async () => {
          // Ensure connected
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const cmds = [
            { cmd: '^SU', desc: 'Status' },
            { cmd: '^VV', desc: 'Version' },
            { cmd: '^LE', desc: 'Errors' },
            { cmd: '^LM', desc: 'List Messages' },
            { cmd: '^SD', desc: 'System Date' },
            { cmd: '^TP', desc: 'Temperatures' },
          ];

          const details: string[] = [];
          let passed = 0;
          let failed = 0;

          for (const { cmd, desc } of cmds) {
            const r = await sendCmd(printerId, cmd);
            if (r.success && r.response && r.response.trim().length > 0) {
              passed++;
              details.push(`✓ ${cmd} (${desc}): ${r.elapsed}ms — ${r.response.substring(0, 80).replace(/\n/g, ' ')}`);
            } else {
              failed++;
              details.push(`✗ ${cmd} (${desc}): ${r.elapsed}ms — ${r.error || '(empty response)'}`);
            }
            await sleep(300);
          }

          if (failed === 0) return { status: 'pass', message: `All ${passed} commands responded`, details };
          if (passed > 0) return { status: 'warn', message: `${passed}/${cmds.length} commands OK, ${failed} failed`, details, recommendation: `PROTOCOL: Some commands are not supported. This may indicate an older firmware version or a different protocol revision.` };
          return { status: 'fail', message: 'No commands received valid responses', details, recommendation: 'PROTOCOL: Printer is not responding to any commands despite being connected. The printer may require a specific login sequence or is in a locked state.' };
        },
      },
    ],
  };

  // ═══════════════════════════════════════════════════════
  // PHASE 3: SESSION STABILITY
  // ═══════════════════════════════════════════════════════
  const phase3: TestPhase = {
    id: 'phase3',
    name: 'Phase 3: Session Stability',
    description: 'Test if the connection remains reliable over time and under load',
    tests: [
      {
        id: '3.1',
        name: '3.1 — 20 Sequential Commands',
        description: 'Send 20 ^SU commands back-to-back with 300ms delay. Simulates normal polling. Measures consistency.',
        passCriteria: '100% success rate. All response times < 3000ms.',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const times: number[] = [];
          const details: string[] = [];
          let failures = 0;

          for (let i = 0; i < 20; i++) {
            const r = await sendCmd(printerId, '^SU');
            if (r.success) {
              times.push(r.elapsed);
              if (i % 5 === 0) details.push(`#${i + 1}: ${r.elapsed}ms ✓`);
            } else {
              failures++;
              details.push(`#${i + 1}: FAIL — ${r.error}`);
            }
            await sleep(300);
          }

          const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
          const max = times.length > 0 ? Math.max(...times) : 0;
          const min = times.length > 0 ? Math.min(...times) : 0;
          details.push(`---`);
          details.push(`Avg: ${avg}ms | Min: ${min}ms | Max: ${max}ms`);
          details.push(`Success: ${20 - failures}/20 | Failures: ${failures}/20`);

          if (failures === 0 && max < 3000) return { status: 'pass', message: `20/20 OK — avg ${avg}ms, max ${max}ms`, timing: avg, details };
          if (failures === 0) return { status: 'warn', message: `20/20 OK but max response ${max}ms is high`, timing: avg, details, recommendation: `PERFORMANCE: Some responses are slow (${max}ms). This could indicate firmware processing delays or network congestion.` };
          return { status: 'fail', message: `${failures}/20 commands failed`, timing: avg, details, recommendation: `STABILITY: ${failures} of 20 sequential commands failed. The firmware may be dropping commands under sustained polling. Consider increasing inter-command delay.` };
        },
      },
      {
        id: '3.2',
        name: '3.2 — Idle Timeout (30s)',
        description: 'Send a command, wait 30 seconds idle, then send another. Tests if the firmware closes idle connections.',
        passCriteria: 'Second command succeeds after 30s idle',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const r1 = await sendCmd(printerId, '^SU');
          const details = [`First ^SU: ${r1.success ? '✓' : '✗'} (${r1.elapsed}ms)`];
          if (!r1.success) return { status: 'fail', message: `First command failed: ${r1.error}`, details };

          details.push('Waiting 30 seconds idle...');
          await sleep(30000);

          const r2 = await sendCmd(printerId, '^SU');
          details.push(`Second ^SU after 30s idle: ${r2.success ? '✓' : '✗'} (${r2.elapsed}ms)`);

          if (r2.success) return { status: 'pass', message: `Connection survived 30s idle — response in ${r2.elapsed}ms`, timing: r2.elapsed, details };
          return { status: 'fail', message: `Connection DIED after 30s idle: ${r2.error}`, details, recommendation: 'FIRMWARE: Printer closes idle Telnet sessions after ~30s. The application must send keepalive commands or reconnect before each polling burst.' };
        },
      },
      {
        id: '3.3',
        name: '3.3 — Idle Timeout (60s)',
        description: 'Same as 3.2 but waits 60 seconds. Determines the idle timeout window.',
        passCriteria: 'Second command succeeds after 60s idle',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const r1 = await sendCmd(printerId, '^SU');
          const details = [`First ^SU: ${r1.success ? '✓' : '✗'} (${r1.elapsed}ms)`];
          if (!r1.success) return { status: 'fail', message: `First command failed: ${r1.error}`, details };

          details.push('Waiting 60 seconds idle...');
          await sleep(60000);

          const r2 = await sendCmd(printerId, '^SU');
          details.push(`Second ^SU after 60s idle: ${r2.success ? '✓' : '✗'} (${r2.elapsed}ms)`);

          if (r2.success) return { status: 'pass', message: `Connection survived 60s idle`, timing: r2.elapsed, details };
          return { status: 'fail', message: `Connection DIED after 60s idle: ${r2.error}`, details, recommendation: 'FIRMWARE: Idle timeout is between 30–60s. Application polling interval must stay under this threshold to maintain the session.' };
        },
      },
      {
        id: '3.4',
        name: '3.4 — Rapid Fire (No Delay)',
        description: 'Send 10 ^SU commands as fast as possible with zero delay. Tests the command queue and firmware buffer.',
        passCriteria: 'All 10 commands succeed',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const details: string[] = [];
          let successes = 0;
          let failures = 0;
          const t0 = performance.now();

          for (let i = 0; i < 10; i++) {
            const r = await sendCmd(printerId, '^SU');
            if (r.success) { successes++; details.push(`#${i + 1}: ✓ ${r.elapsed}ms`); }
            else { failures++; details.push(`#${i + 1}: ✗ ${r.error}`); }
          }

          const total = Math.round(performance.now() - t0);
          details.push(`Total: ${total}ms | Avg: ${Math.round(total / 10)}ms/cmd`);

          if (failures === 0) return { status: 'pass', message: `10/10 OK in ${total}ms (avg ${Math.round(total / 10)}ms)`, timing: total, details };
          return { status: failures > 3 ? 'fail' : 'warn', message: `${successes}/10 OK, ${failures} failed`, timing: total, details, recommendation: `FIRMWARE: Commands are being lost under rapid fire. The firmware command buffer is limited. Ensure a minimum 300ms delay between commands.` };
        },
      },
    ],
  };

  // ═══════════════════════════════════════════════════════
  // PHASE 4: RECONNECTION BEHAVIOR
  // ═══════════════════════════════════════════════════════
  const phase4: TestPhase = {
    id: 'phase4',
    name: 'Phase 4: Reconnection Behavior',
    description: 'Determine how long the firmware takes to release a session and accept a new one',
    tests: [
      {
        id: '4.1',
        name: '4.1 — Immediate Reconnect (0s wait)',
        description: 'Disconnect and immediately try to reconnect. Expected to FAIL — this reveals the firmware cooldown.',
        passCriteria: 'Documents whether immediate reconnect works or fails',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Initial connect failed: ${rc.error}` };

          await disconnectPrinter(printerId);
          // No wait

          const r2 = await connectPrinter(printerId, ip, port);
          const details = [`Disconnect → immediate reconnect: ${r2.success ? '✓' : '✗'} (${r2.elapsed}ms)`];

          if (r2.success) {
            await disconnectPrinter(printerId);
            return { status: 'pass', message: `Immediate reconnect WORKS (${r2.elapsed}ms) — no firmware cooldown needed`, timing: r2.elapsed, details };
          }
          return { status: 'warn', message: `Immediate reconnect BLOCKED (${r2.elapsed}ms): ${r2.error}`, timing: r2.elapsed, details, recommendation: 'FIRMWARE: Immediate reconnect fails — the firmware needs time to release the session. This is expected for Model 88.' };
        },
      },
      {
        id: '4.2',
        name: '4.2 — 5s Wait Reconnect',
        description: 'Disconnect, wait 5 seconds, reconnect.',
        passCriteria: 'Reconnect succeeds within 5000ms',
        run: async () => await reconnectWithDelay(5),
      },
      {
        id: '4.3',
        name: '4.3 — 10s Wait Reconnect',
        description: 'Disconnect, wait 10 seconds, reconnect.',
        passCriteria: 'Reconnect succeeds within 5000ms',
        run: async () => await reconnectWithDelay(10),
      },
      {
        id: '4.4',
        name: '4.4 — 15s Wait Reconnect',
        description: 'Disconnect, wait 15 seconds, reconnect. This is the current application default.',
        passCriteria: 'Reconnect succeeds within 5000ms',
        run: async () => await reconnectWithDelay(15),
      },
      {
        id: '4.5',
        name: '4.5 — 20s Wait Reconnect',
        description: 'Disconnect, wait 20 seconds, reconnect.',
        passCriteria: 'Reconnect succeeds within 5000ms',
        run: async () => await reconnectWithDelay(20),
      },
      {
        id: '4.6',
        name: '4.6 — 30s Wait Reconnect',
        description: 'Disconnect, wait 30 seconds, reconnect.',
        passCriteria: 'Reconnect succeeds within 5000ms',
        run: async () => await reconnectWithDelay(30),
      },
    ],
  };

  const reconnectWithDelay = async (delaySec: number): Promise<TestResult> => {
    const rc = await connectPrinter(printerId, ip, port);
    if (!rc.success) return { status: 'fail', message: `Initial connect failed: ${rc.error}` };

    // Send a test command to ensure session is active
    await sendCmd(printerId, '^SU');
    await disconnectPrinter(printerId);

    await sleep(delaySec * 1000);

    const r2 = await connectPrinter(printerId, ip, port);
    const details = [`Wait: ${delaySec}s`, `Reconnect: ${r2.success ? '✓' : '✗'} (${r2.elapsed}ms) ${r2.error || ''}`];

    if (r2.success) {
      // Verify the connection actually works
      const cmd = await sendCmd(printerId, '^VV');
      details.push(`Post-reconnect ^VV: ${cmd.success ? '✓' : '✗'} (${cmd.elapsed}ms)`);
      await disconnectPrinter(printerId);

      if (cmd.success) return { status: 'pass', message: `${delaySec}s wait → reconnect OK (${r2.elapsed}ms), command OK (${cmd.elapsed}ms)`, timing: r2.elapsed, details };
      return { status: 'warn', message: `Connected but command failed after ${delaySec}s wait`, timing: r2.elapsed, details, recommendation: `FIRMWARE: TCP reconnects at ${delaySec}s but commands fail. Session may not be fully released yet.` };
    }

    return { status: 'fail', message: `${delaySec}s wait was NOT enough: ${r2.error}`, timing: r2.elapsed, details, recommendation: `FIRMWARE: ${delaySec} seconds is insufficient for session release. Need a longer cooldown.` };
  };

  // ═══════════════════════════════════════════════════════
  // PHASE 5: MULTI-SESSION & EDGE CASES
  // ═══════════════════════════════════════════════════════
  const phase5: TestPhase = {
    id: 'phase5',
    name: 'Phase 5: Multi-Session & Edge Cases',
    description: 'Test firmware limits and unusual scenarios',
    tests: [
      {
        id: '5.1',
        name: '5.1 — Dual TCP Connection',
        description: 'Attempt two simultaneous TCP connections to the same printer. Tests the single-session limit.',
        passCriteria: 'Documents firmware behavior — expected to fail on second connection',
        run: async () => {
          const ID_A = printerId;
          const ID_B = printerId - 1;

          const r1 = await connectPrinter(ID_A, ip, port);
          const details = [`Session A: ${r1.success ? '✓' : '✗'} (${r1.elapsed}ms)`];
          if (!r1.success) return { status: 'fail', message: `First connection failed: ${r1.error}`, details };

          const r2 = await connectPrinter(ID_B, ip, port);
          details.push(`Session B: ${r2.success ? '✓' : '✗'} (${r2.elapsed}ms) ${r2.error || ''}`);

          // Check if Session A still works
          const check = await sendCmd(ID_A, '^VV');
          details.push(`Session A after dual-connect: ${check.success ? '✓ alive' : '✗ DEAD'}`);

          // Cleanup
          await window.electronAPI!.printer.disconnect(ID_B).catch(() => {});
          await window.electronAPI!.printer.disconnect(ID_A).catch(() => {});

          if (!r2.success) {
            return { status: 'pass', message: `Single-session confirmed — second connection blocked: ${r2.error}`, details, recommendation: 'FIRMWARE: Printer correctly enforces single-session limit. Application must NEVER open a second socket — this kills the first one.' };
          }
          if (!check.success) {
            return { status: 'warn', message: 'Second connection succeeded but KILLED the first!', details, recommendation: 'FIRMWARE: Opening a second connection destroys the first session. Any background status checks that open TCP must be avoided.' };
          }
          return { status: 'pass', message: 'Firmware accepts multiple sessions — rare but good', details };
        },
      },
      {
        id: '5.2',
        name: '5.2 — Invalid Command',
        description: 'Send a non-existent command. Tests error handling.',
        passCriteria: 'Printer returns an error or ignores gracefully',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const r = await sendCmd(printerId, '^ZZ_INVALID');
          const details = [`Command: ^ZZ_INVALID`, `Response: ${r.response || '(none)'}`, `Elapsed: ${r.elapsed}ms`];

          if (r.success) return { status: 'pass', message: `Printer handled invalid command gracefully (${r.elapsed}ms)`, timing: r.elapsed, details };
          return { status: 'warn', message: `Error on invalid command: ${r.error}`, details };
        },
      },
      {
        id: '5.3',
        name: '5.3 — Long Polling Simulation (2 min)',
        description: 'Simulate real-world polling: send ^SU every 3 seconds for 2 minutes. This is the closest test to actual application behavior.',
        passCriteria: '95%+ success rate over 40 polls',
        run: async () => {
          const rc = await connectPrinter(printerId, ip, port);
          if (!rc.success) return { status: 'fail', message: `Connect failed: ${rc.error}` };
          await sleep(300);

          const details: string[] = [];
          const times: number[] = [];
          let failures = 0;
          const polls = 40; // 40 * 3s = 120s

          for (let i = 0; i < polls; i++) {
            if (abortRef.current) { details.push('--- ABORTED ---'); break; }
            const r = await sendCmd(printerId, '^SU');
            if (r.success) {
              times.push(r.elapsed);
              if (i % 10 === 0) details.push(`Poll #${i + 1}: ✓ ${r.elapsed}ms`);
            } else {
              failures++;
              details.push(`Poll #${i + 1}: ✗ ${r.error}`);
            }
            await sleep(3000);
          }

          const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
          const max = times.length > 0 ? Math.max(...times) : 0;
          const successRate = Math.round(((polls - failures) / polls) * 100);
          details.push(`---`);
          details.push(`Success rate: ${successRate}% (${polls - failures}/${polls})`);
          details.push(`Avg: ${avg}ms | Max: ${max}ms`);

          if (successRate >= 95 && max < 5000) return { status: 'pass', message: `${successRate}% success over 2 min — avg ${avg}ms`, timing: avg, details };
          if (successRate >= 80) return { status: 'warn', message: `${successRate}% success — some drops detected`, timing: avg, details, recommendation: `STABILITY: ${failures} polls failed during 2-minute test. ${failures > 5 ? 'This indicates a systemic issue — possibly firmware timeout or buffer overflow.' : 'Minor drops may be acceptable. Consider increasing poll interval.'}` };
          return { status: 'fail', message: `Only ${successRate}% success — connection is unstable`, timing: avg, details, recommendation: 'CRITICAL: Connection is fundamentally unstable during sustained polling. This points to a firmware bug where the Telnet service degrades over time. Consider implementing command-level reconnection or reducing poll frequency significantly.' };
        },
      },
    ],
  };

  // ═══════════════════════════════════════════════════════
  // PHASE 6: NETWORK INFRASTRUCTURE
  // ═══════════════════════════════════════════════════════
  const phase6: TestPhase = {
    id: 'phase6',
    name: 'Phase 6: Network Infrastructure',
    description: 'Diagnose wireless vs wired, jitter, packet loss, and routing issues',
    tests: [
      {
        id: '6.1',
        name: '6.1 — Ping Jitter (20 pings)',
        description: 'Send 20 consecutive pings and measure jitter (variation in response time). High jitter often indicates WiFi interference or a congested switch.',
        passCriteria: 'Jitter < 10ms and 0% packet loss',
        run: async () => {
          const details: string[] = [];
          const times: number[] = [];
          let lost = 0;

          for (let i = 0; i < 20; i++) {
            const t0 = performance.now();
            const result = await window.electronAPI!.printer.checkStatus([{ id: printerId, ipAddress: ip, port }]);
            const dt = Math.round(performance.now() - t0);
            const r = result?.[0];
            if (r?.isAvailable) {
              times.push(dt);
              if (i % 5 === 0) details.push(`Ping #${i + 1}: ${dt}ms ✓`);
            } else {
              lost++;
              details.push(`Ping #${i + 1}: LOST ✗`);
            }
            await sleep(500);
          }

          const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
          const min = times.length > 0 ? Math.min(...times) : 0;
          const max = times.length > 0 ? Math.max(...times) : 0;
          const jitter = max - min;
          const lossRate = Math.round((lost / 20) * 100);

          details.push('---');
          details.push(`Avg: ${avg}ms | Min: ${min}ms | Max: ${max}ms`);
          details.push(`Jitter: ${jitter}ms | Packet loss: ${lossRate}%`);

          if (jitter > 50) details.push('⚠ HIGH JITTER — typical of WiFi or congested network');
          if (jitter < 5) details.push('✓ LOW JITTER — consistent, likely wired connection');
          if (jitter >= 5 && jitter <= 50) details.push('⚡ MODERATE JITTER — could be WiFi or shared switch');

          if (lost > 0) {
            return { status: 'fail', message: `${lossRate}% packet loss, jitter ${jitter}ms`, details, recommendation: `NETWORK: ${lost} of 20 pings lost. This indicates an unreliable link — check cable connections, WiFi signal strength, or switch port status. Packet loss WILL cause Telnet command failures.` };
          }
          if (jitter > 50) {
            return { status: 'warn', message: `High jitter: ${jitter}ms — likely WiFi`, timing: avg, details, recommendation: `NETWORK: Jitter of ${jitter}ms suggests a WiFi connection. For reliable Telnet communication, use a WIRED Ethernet connection. WiFi latency spikes cause command timeouts.` };
          }
          if (jitter > 10) {
            return { status: 'warn', message: `Moderate jitter: ${jitter}ms`, timing: avg, details, recommendation: `NETWORK: Jitter of ${jitter}ms is borderline. If experiencing intermittent failures, switch to wired Ethernet.` };
          }
          return { status: 'pass', message: `Stable network — jitter ${jitter}ms, 0% loss, avg ${avg}ms`, timing: avg, details };
        },
      },
      {
        id: '6.2',
        name: '6.2 — Connection Type Detection',
        description: 'Analyze ping patterns to infer whether the connection is likely wired or wireless. WiFi typically shows >15ms average ping with high variance.',
        passCriteria: 'Connection type identified',
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
            return { status: 'fail', message: 'Too many pings lost to determine connection type', recommendation: 'NETWORK: Cannot even sustain pings. Check physical connectivity first.' };
          }

          const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
          const variance = Math.round(Math.sqrt(times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length));
          const details = [
            `Avg ping: ${avg}ms`,
            `Std deviation: ${variance}ms`,
            `Samples: ${times.map(t => `${t}ms`).join(', ')}`,
            '---',
          ];

          let connectionType: string;
          if (avg < 5 && variance < 3) {
            connectionType = 'WIRED (Ethernet) — ✓ Ideal for Telnet';
            details.push('✓ Low latency + low variance = direct Ethernet connection');
            return { status: 'pass', message: connectionType, timing: avg, details };
          } else if (avg < 15 && variance < 10) {
            connectionType = 'WIRED (through switch/hub) — ✓ Good';
            details.push('✓ Acceptable latency — wired through network infrastructure');
            return { status: 'pass', message: connectionType, timing: avg, details };
          } else if (variance > 20) {
            connectionType = 'WIRELESS (WiFi) — ⚠ Unreliable for Telnet';
            details.push('⚠ High variance strongly indicates WiFi');
            details.push('WiFi causes unpredictable latency spikes that break Telnet polling');
            return { status: 'warn', message: connectionType, timing: avg, details, recommendation: 'NETWORK: WiFi detected. Industrial printers should be connected via Ethernet cable. WiFi introduces latency spikes that cause command timeouts and dropped connections.' };
          } else {
            connectionType = `UNCERTAIN — avg ${avg}ms, variance ${variance}ms`;
            details.push('Cannot definitively determine connection type');
            return { status: 'warn', message: connectionType, timing: avg, details };
          }
        },
      },
      {
        id: '6.3',
        name: '6.3 — Sustained Network Load',
        description: 'Ping every 200ms for 30 seconds (150 pings). Detects intermittent network dropouts that only appear under sustained load — common with cheap switches/hubs.',
        passCriteria: '< 2% packet loss, no consecutive drops',
        run: async () => {
          const details: string[] = [];
          const times: number[] = [];
          let lost = 0;
          let maxConsecutiveLost = 0;
          let currentConsecutiveLost = 0;

          for (let i = 0; i < 150; i++) {
            if (abortRef.current) { details.push('--- ABORTED ---'); break; }
            const t0 = performance.now();
            const result = await window.electronAPI!.printer.checkStatus([{ id: printerId, ipAddress: ip, port }]);
            const dt = Math.round(performance.now() - t0);
            const r = result?.[0];
            if (r?.isAvailable) {
              times.push(dt);
              currentConsecutiveLost = 0;
              if (i % 30 === 0) details.push(`Ping #${i + 1}: ${dt}ms ✓`);
            } else {
              lost++;
              currentConsecutiveLost++;
              maxConsecutiveLost = Math.max(maxConsecutiveLost, currentConsecutiveLost);
              details.push(`Ping #${i + 1}: LOST ✗`);
            }
            await sleep(200);
          }

          const lossRate = Math.round((lost / 150) * 100);
          const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
          const max = times.length > 0 ? Math.max(...times) : 0;
          details.push('---');
          details.push(`Total: 150 pings | Lost: ${lost} (${lossRate}%) | Avg: ${avg}ms | Max: ${max}ms`);
          details.push(`Max consecutive drops: ${maxConsecutiveLost}`);

          if (maxConsecutiveLost >= 3) {
            return { status: 'fail', message: `${maxConsecutiveLost} consecutive drops detected`, details, recommendation: `NETWORK: ${maxConsecutiveLost} consecutive dropped pings indicates a network interruption (switch loop, cable fault, or WiFi dropout). Check physical infrastructure: cables, switch ports, and any managed switch logs for errors.` };
          }
          if (lossRate > 5) {
            return { status: 'fail', message: `${lossRate}% packet loss under load`, details, recommendation: `NETWORK: ${lossRate}% loss under sustained load. This WILL cause Telnet failures. Common causes: overloaded switch, half-duplex mismatch, or WiFi interference. Try a different switch port or replace the network cable.` };
          }
          if (lossRate > 0) {
            return { status: 'warn', message: `${lossRate}% loss (${lost}/150) — minor drops`, timing: avg, details, recommendation: `NETWORK: Minor packet loss detected. Individually these won't cause issues, but combined with firmware timing constraints they can trigger reconnection storms.` };
          }
          return { status: 'pass', message: `0% loss over 150 pings — network is solid`, timing: avg, details };
        },
      },
      {
        id: '6.4',
        name: '6.4 — PC Network Interface Check',
        description: 'Detect the local network interface being used to reach the printer. Checks if Ethernet has routing priority over WiFi.',
        passCriteria: 'Ethernet interface detected with lower metric than WiFi',
        run: async () => {
          // We can infer from navigator APIs and the ping pattern
          const details: string[] = [];
          const connection = (navigator as any).connection;
          if (connection) {
            details.push(`Browser reports: type=${connection.type || 'unknown'}, effectiveType=${connection.effectiveType || 'unknown'}, downlink=${connection.downlink || 'unknown'}Mbps, rtt=${connection.rtt || 'unknown'}ms`);
          } else {
            details.push('Network Information API not available');
          }

          // Check if this is Electron (has access to more info)
          if (window.electronAPI) {
            details.push('Running in Electron — TCP routes through OS network stack');
            details.push(`Target: ${ip}:${port}`);
            details.push('');
            details.push('⚙ Windows routing tips:');
            details.push('  1. Open cmd → "route print" to see routing table');
            details.push('  2. Ethernet should have lower metric (higher priority)');
            details.push('  3. If WiFi has priority: netsh interface ip set interface "Ethernet" metric=10');
            details.push('  4. Set WiFi metric higher: netsh interface ip set interface "Wi-Fi" metric=50');
            details.push('');
            details.push('⚙ Quick check:');
            details.push(`  tracert ${ip} — should show 1-2 hops for local network`);
            details.push(`  arp -a | findstr ${ip} — should show MAC address`);
          }

          // Do a quick connectivity check
          const t0 = performance.now();
          const result = await window.electronAPI!.printer.checkStatus([{ id: printerId, ipAddress: ip, port }]);
          const pingTime = Math.round(performance.now() - t0);
          const r = result?.[0];
          details.push('');
          details.push(`Quick ping: ${r?.isAvailable ? '✓' : '✗'} (${pingTime}ms)`);

          if (pingTime < 5) {
            details.push('✓ < 5ms response — almost certainly wired and direct');
            return { status: 'pass', message: 'Fast response suggests wired Ethernet', timing: pingTime, details };
          }
          if (pingTime < 20) {
            return { status: 'pass', message: 'Good response time — likely wired via switch', timing: pingTime, details };
          }
          return { status: 'warn', message: `${pingTime}ms response — may be WiFi or routing through additional hops`, timing: pingTime, details, recommendation: 'NETWORK: Response time suggests traffic may be routing through WiFi. Run "route print" in a Windows command prompt to verify Ethernet has routing priority (lower metric). Set Ethernet metric=10 and WiFi metric=50.' };
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
    description: 'Verify the Electron build, auto-updater, and GitHub integration',
    tests: [
      {
        id: '7.1',
        name: '7.1 — Electron Environment',
        description: 'Check if running in Electron, app version, and packaging state.',
        passCriteria: 'Running in packaged Electron with valid version',
        run: async () => {
          const details: string[] = [];

          if (!window.electronAPI) {
            details.push('✗ Not running in Electron');
            details.push('This diagnostic tool requires the Electron desktop app');
            return { status: 'fail', message: 'Not in Electron — TCP features unavailable', details, recommendation: 'BUILD: Running in browser mode. Printer communication requires the Electron desktop app. Build and install the app from a GitHub Release.' };
          }

          details.push('✓ Running in Electron');

          let version = 'unknown';
          try {
            version = await window.electronAPI.app.getVersion();
            details.push(`App version: ${version}`);
          } catch {
            details.push('✗ Could not get app version');
          }

          let isFullscreen = false;
          try {
            isFullscreen = await window.electronAPI.app.isFullscreen();
            details.push(`Fullscreen: ${isFullscreen}`);
          } catch {}

          return { status: 'pass', message: `Electron OK — v${version}`, details };
        },
      },
      {
        id: '7.2',
        name: '7.2 — Auto-Updater Status',
        description: 'Check the auto-updater state and whether updates are being detected.',
        passCriteria: 'Updater is active and checking for updates',
        run: async () => {
          if (!window.electronAPI) return { status: 'fail', message: 'Not in Electron' };

          const details: string[] = [];
          try {
            const state = await window.electronAPI.app.getUpdateState();
            details.push(`Stage: ${state.stage}`);
            if (state.info) details.push(`Info: ${JSON.stringify(state.info).substring(0, 200)}`);
            if (state.progress) details.push(`Progress: ${JSON.stringify(state.progress)}`);

            if (state.stage === 'idle') {
              details.push('');
              details.push('Updater is idle — no update available or not yet checked');
              details.push('Note: Updates only work when installed from a GitHub Release (.exe)');
              return { status: 'pass', message: 'Updater idle — no pending updates', details };
            }
            if (state.stage === 'downloading') {
              return { status: 'warn', message: 'Update is downloading...', details };
            }
            if (state.stage === 'ready') {
              return { status: 'pass', message: 'Update downloaded — will install on restart', details };
            }
            return { status: 'pass', message: `Updater state: ${state.stage}`, details };
          } catch (err: any) {
            return { status: 'warn', message: `Updater check failed: ${err.message}`, details };
          }
        },
      },
      {
        id: '7.3',
        name: '7.3 — Updater Log Analysis',
        description: 'Read the auto-updater log file and check for errors or warnings.',
        passCriteria: 'No errors in updater log',
        run: async () => {
          if (!window.electronAPI) return { status: 'fail', message: 'Not in Electron' };

          try {
            const log = await window.electronAPI.app.getUpdaterLog();
            const lines = log.split('\n').filter((l: string) => l.trim());
            const details: string[] = [];

            const errors = lines.filter((l: string) => l.includes('[error]') || l.includes('Error:'));
            const warnings = lines.filter((l: string) => l.includes('[warn]'));
            const updates = lines.filter((l: string) => l.includes('Update available') || l.includes('update-downloaded'));

            details.push(`Log entries: ${lines.length}`);
            details.push(`Errors: ${errors.length}`);
            details.push(`Warnings: ${warnings.length}`);
            details.push(`Updates detected: ${updates.length}`);
            details.push('');

            if (errors.length > 0) {
              details.push('--- Recent Errors ---');
              errors.slice(-5).forEach((e: string) => details.push(`  ${e.trim()}`));
            }
            if (updates.length > 0) {
              details.push('--- Update Events ---');
              updates.slice(-3).forEach((u: string) => details.push(`  ${u.trim()}`));
            }

            // Show last 5 lines for context
            details.push('');
            details.push('--- Last 5 log lines ---');
            lines.slice(-5).forEach((l: string) => details.push(`  ${l.trim()}`));

            if (errors.length > 0) {
              return { status: 'warn', message: `${errors.length} errors found in updater log`, details, recommendation: `BUILD: Auto-updater has ${errors.length} logged errors. Common causes: no internet during check, running in dev mode (not packaged), or GitHub release not found. Check the log details above.` };
            }
            return { status: 'pass', message: `Updater log clean — ${lines.length} entries`, details };
          } catch (err: any) {
            return { status: 'warn', message: `Could not read updater log: ${err.message}` };
          }
        },
      },
      {
        id: '7.4',
        name: '7.4 — Relay Server Status',
        description: 'Check if the HTTP relay server (port 8766) is running for mobile PWA clients.',
        passCriteria: 'Relay server is active and reports correct version',
        run: async () => {
          if (!window.electronAPI) return { status: 'fail', message: 'Not in Electron' };

          const details: string[] = [];
          try {
            const info = await window.electronAPI.relay.getInfo();
            details.push(`Relay port: ${info.port}`);
            details.push(`Local IPs: ${info.ips?.join(', ') || 'none detected'}`);

            if (info.ips && info.ips.length > 0) {
              details.push('');
              details.push('Mobile PWA clients can connect via:');
              info.ips.forEach((ipAddr: string) => details.push(`  http://${ipAddr}:${info.port}/relay/info`));
            }

            return { status: 'pass', message: `Relay active on port ${info.port} — ${info.ips?.length || 0} interfaces`, details };
          } catch (err: any) {
            return { status: 'warn', message: `Relay check failed: ${err.message}`, details, recommendation: 'BUILD: Relay server is not responding. Mobile PWA clients will not be able to communicate with printers through this PC.' };
          }
        },
      },
      {
        id: '7.5',
        name: '7.5 — GitHub Build Status',
        description: 'Check the latest GitHub Actions build status via the edge function.',
        passCriteria: 'Latest build completed successfully',
        run: async () => {
          const details: string[] = [];
          try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

            if (!supabaseUrl || !supabaseKey) {
              details.push('Supabase environment not configured');
              return { status: 'warn', message: 'Cannot check — no backend config', details };
            }

            const res = await fetch(`${supabaseUrl}/functions/v1/github-build-status`, {
              headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            });

            if (!res.ok) {
              details.push(`HTTP ${res.status}: ${res.statusText}`);
              return { status: 'warn', message: `Build status API returned ${res.status}`, details };
            }

            const data = await res.json();
            details.push(`Latest run: ${data.status || 'unknown'}`);
            details.push(`Conclusion: ${data.conclusion || 'unknown'}`);
            details.push(`Branch: ${data.head_branch || 'unknown'}`);
            details.push(`Created: ${data.created_at || 'unknown'}`);

            if (data.conclusion === 'success') {
              return { status: 'pass', message: 'Latest GitHub build succeeded', details };
            }
            if (data.conclusion === 'failure') {
              return { status: 'fail', message: 'Latest GitHub build FAILED', details, recommendation: 'BUILD: The latest GitHub Actions build failed. Check the workflow logs at github.com for error details. Common causes: missing secrets (GH_TOKEN, VITE_SUPABASE_URL), dependency issues, or TypeScript errors.' };
            }
            if (data.status === 'in_progress') {
              return { status: 'warn', message: 'Build currently in progress', details };
            }
            return { status: 'pass', message: `Build status: ${data.conclusion || data.status || 'unknown'}`, details };
          } catch (err: any) {
            return { status: 'warn', message: `Could not check build status: ${err.message}`, details: [...details, err.message] };
          }
        },
      },
    ],
  };

  const phases = [phase1, phase2, phase3, phase4, phase5, phase6, phase7];

  // --- Run a single test ---
  const runTest = useCallback(async (test: TestDef) => {
    if (!isElectron) return;
    setRunningTest(test.id);
    updateResult(test.id, { status: 'running', message: 'Running...' });
    try {
      const result = await test.run();
      updateResult(test.id, result);
    } catch (err: any) {
      updateResult(test.id, { status: 'fail', message: `Unexpected error: ${err.message}` });
    }
    setRunningTest(null);
  }, [isElectron]);

  // --- Run all tests ---
  const runAllTests = useCallback(async () => {
    if (!isElectron) return;
    setRunningAll(true);
    abortRef.current = false;

    for (const phase of phases) {
      for (const test of phase.tests) {
        if (abortRef.current) break;
        setExpandedPhase(phase.id);
        setRunningTest(test.id);
        updateResult(test.id, { status: 'running', message: 'Running...' });
        try {
          const result = await test.run();
          updateResult(test.id, result);
          // If a test fails in phase 1, skip remaining
          if (result.status === 'fail' && phase.id === 'phase1') {
            setRunningTest(null);
            break;
          }
        } catch (err: any) {
          updateResult(test.id, { status: 'fail', message: `Unexpected error: ${err.message}` });
        }
        setRunningTest(null);
        // Small gap between tests
        await sleep(1000);
        // Ensure clean state between tests
        await window.electronAPI!.printer.disconnect(printerId).catch(() => {});
        await sleep(2000);
      }
      if (abortRef.current) break;
    }

    setRunningAll(false);
    setRunningTest(null);
  }, [isElectron, phases]);

  // --- Export findings ---
  const exportFindings = () => {
    const lines: string[] = ['TELNET DIAGNOSTIC REPORT', `Date: ${new Date().toISOString()}`, `Target: ${ip}:${port}`, '', '═══ TEST RESULTS ═══', ''];
    for (const phase of phases) {
      lines.push(`${phase.name}`);
      for (const test of phase.tests) {
        const r = results[test.id];
        if (r) {
          lines.push(`  ${test.name}: ${r.status.toUpperCase()} — ${r.message}`);
          r.details?.forEach(d => lines.push(`    ${d}`));
        } else {
          lines.push(`  ${test.name}: NOT RUN`);
        }
      }
      lines.push('');
    }
    if (findings.length > 0) {
      lines.push('═══ FINDINGS & RECOMMENDATIONS ═══', '');
      findings.forEach((f, i) => lines.push(`${i + 1}. ${f}`));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telnet-diag-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Status icon ---
  const StatusIcon = ({ status }: { status: TestStatus }) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'fail': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warn': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'running': return <Clock className="w-4 h-4 text-blue-400 animate-pulse" />;
      case 'skipped': return <SkipForward className="w-4 h-4 text-muted-foreground" />;
      default: return <div className="w-4 h-4 rounded-full border border-muted-foreground/30" />;
    }
  };

  const totalTests = phases.reduce((sum, p) => sum + p.tests.length, 0);
  const passCount = Object.values(results).filter(r => r.status === 'pass').length;
  const failCount = Object.values(results).filter(r => r.status === 'fail').length;
  const warnCount = Object.values(results).filter(r => r.status === 'warn').length;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Test list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 p-3 border-b border-border shrink-0">
          <Button size="sm" onClick={runAllTests} disabled={runningAll || !isElectron}>
            <Play className="w-4 h-4 mr-1" /> Run All Tests
          </Button>
          {runningAll && (
            <Button size="sm" variant="destructive" onClick={() => { abortRef.current = true; }}>
              <Square className="w-4 h-4 mr-1" /> Abort
            </Button>
          )}
          <div className="flex-1" />
          <Badge variant="outline">{passCount} pass</Badge>
          {warnCount > 0 && <Badge variant="outline" className="border-yellow-500 text-yellow-500">{warnCount} warn</Badge>}
          {failCount > 0 && <Badge variant="destructive">{failCount} fail</Badge>}
          <span className="text-xs text-muted-foreground">{Object.keys(results).length}/{totalTests} run</span>
        </div>

        {/* Phases */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {phases.map(phase => {
              const isExpanded = expandedPhase === phase.id;
              const phaseResults = phase.tests.map(t => results[t.id]?.status).filter(Boolean);
              const phaseFailed = phaseResults.includes('fail');
              const phaseAllPassed = phaseResults.length === phase.tests.length && phaseResults.every(s => s === 'pass');

              return (
                <Card key={phase.id} className={phaseFailed ? 'border-red-500/50' : phaseAllPassed ? 'border-green-500/50' : ''}>
                  <button
                    className="w-full text-left p-3 flex items-center gap-2"
                    onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-semibold text-sm flex-1">{phase.name}</span>
                    <span className="text-xs text-muted-foreground">{phase.description}</span>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2">
                      {phase.tests.map(test => {
                        const result = results[test.id];
                        const isTestExpanded = expandedTest === test.id;
                        const isRunning = runningTest === test.id;

                        return (
                          <div key={test.id} className="border border-border rounded-md overflow-hidden">
                            <div className="flex items-center gap-2 p-2 bg-muted/30">
                              <StatusIcon status={result?.status || 'pending'} />
                              <button
                                className="flex-1 text-left text-sm font-medium"
                                onClick={() => setExpandedTest(isTestExpanded ? null : test.id)}
                              >
                                {test.name}
                              </button>
                              {result?.timing != null && (
                                <span className="text-xs text-muted-foreground font-mono">{result.timing}ms</span>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isRunning || runningAll}
                                onClick={(e) => { e.stopPropagation(); runTest(test); }}
                                className="h-7 px-2"
                              >
                                {isRunning ? <Clock className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                              </Button>
                            </div>

                            {isTestExpanded && (
                              <div className="p-3 text-xs space-y-2 border-t border-border">
                                <p className="text-muted-foreground">{test.description}</p>
                                <p className="text-muted-foreground"><strong>Pass criteria:</strong> {test.passCriteria}</p>

                                {result && result.status !== 'pending' && (
                                  <>
                                    <Separator />
                                    <p className={result.status === 'pass' ? 'text-green-500' : result.status === 'fail' ? 'text-red-500' : 'text-yellow-500'}>
                                      <strong>{result.status.toUpperCase()}:</strong> {result.message}
                                    </p>
                                    {result.details && (
                                      <div className="font-mono bg-muted/50 rounded p-2 space-y-0.5">
                                        {result.details.map((d, i) => (
                                          <div key={i} className="text-foreground/80">{d}</div>
                                        ))}
                                      </div>
                                    )}
                                    {result.recommendation && (
                                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2 text-yellow-600 dark:text-yellow-400">
                                        <strong>💡 Finding:</strong> {result.recommendation}
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

      {/* Findings Panel */}
      <div className="w-80 border-l border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-sm">Findings & Recommendations</h3>
          <Button size="sm" variant="ghost" onClick={exportFindings} title="Export report">
            <Download className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-3">
          {findings.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              Run tests to generate findings...
            </p>
          ) : (
            <div className="space-y-3">
              {findings.map((f, i) => {
                const category = f.split(':')[0];
                const badgeVariant = category === 'CRITICAL' ? 'destructive' : 'outline';
                return (
                  <div key={i} className="border border-border rounded-md p-3 space-y-1">
                    <Badge variant={badgeVariant} className="text-[10px]">{category}</Badge>
                    <p className="text-xs text-foreground/80">{f.substring(f.indexOf(':') + 2)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
