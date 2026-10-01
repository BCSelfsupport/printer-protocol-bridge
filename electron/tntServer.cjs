/**
 * Track-n-Trace TCP endpoint — built to Authentix TrackNTrace_Printer_Interface_Spec (Oct 2026).
 *
 * TnT is the TCP client, CodeSync is the server (default port 8101), one connection per line.
 * Flow per spec:
 *   Order start: TnT sends Config (0x03) → we reply Config-complete ack → TnT sends Print (0x02).
 *   Every 30 s: TnT sends Request "01" → we reply 0x01 "01" + last serial (6 digits).
 *   Serial 000000 in Print = continue counting; any other value = restart at that value.
 *   Rollover: after 999900 the next serial is 1.
 *
 * Still pending Authentix (see mem://integration/tnt-interface-spec-oct-2026):
 *   §7 fault return layout, Clear-All-Buffers command code, Qty=3 block→printer mapping.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const codec = require('./tntCodec.cjs');

const DEFAULT_PORT = 8101;
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const POLL_INTERVAL_MS = 30000;

function stamp() { return new Date().toISOString(); }

class TntServer extends EventEmitter {
  constructor({ port = DEFAULT_PORT, logDir } = {}) {
    super();
    this.port = port;
    this.logDir = logDir;
    this.server = null;
    this.activeSocket = null;
    this.decoder = new codec.FrameDecoder();
    this.session = { config: null, print: null, configAcked: false, lastSerial: 0 };
    this.state = {
      listening: false, port, connected: false, peer: null,
      framesIn: 0, framesOut: 0, lastFrameAt: null, lastError: null,
      lastPollAt: null, pollIntervalMs: POLL_INTERVAL_MS,
      lastSerial: 0, printMessage: null, configured: false,
    };
    this.recent = [];
    if (logDir) { try { fs.mkdirSync(logDir, { recursive: true }); } catch (_) {} }
  }

  _writeLog(line) {
    if (!this.logDir) return;
    const p = path.join(this.logDir, 'tnt-uplink.log');
    try {
      const st = fs.existsSync(p) ? fs.statSync(p) : null;
      if (st && st.size > MAX_LOG_BYTES) { try { fs.renameSync(p, p + '.1'); } catch (_) {} }
      fs.appendFileSync(p, line + '\n');
    } catch (_) {}
  }

  _record(dir, type, raw, json) {
    const name = codec.MSG_NAMES[type] || `0x${(type || 0).toString(16).padStart(2, '0')}`;
    const entry = { dir, opcode: type, name, at: stamp(), size: raw ? raw.length : 0, json: json || null,
      hex: raw ? raw.toString('hex') : '' };
    this.recent.push(entry);
    if (this.recent.length > 100) this.recent.splice(0, this.recent.length - 100);
    this.state.lastFrameAt = entry.at;
    if (dir === 'in') this.state.framesIn++; else this.state.framesOut++;
    this._writeLog(`${entry.at} ${dir.toUpperCase()} ${name} hex=${entry.hex} ${json ? JSON.stringify(json) : ''}`);
    this.emit('frame', entry);
    this._emitState();
  }

  _emitState() {
    this.state.lastSerial = this.session.lastSerial;
    this.state.printMessage = this.session.print ? this.session.print.message : null;
    this.state.configured = !!this.session.config;
    this.emit('state', this.getState());
  }

  getState() { return { ...this.state, recent: this.recent.slice(-25) }; }

  start() {
    if (this.server) return;
    this.server = net.createServer((s) => this._onConnection(s));
    this.server.on('error', (err) => { this.state.lastError = err.message; this._writeLog(`${stamp()} SERVER-ERROR ${err.message}`); this._emitState(); });
    this.server.listen(this.port, () => { this.state.listening = true; this._writeLog(`${stamp()} LISTEN port=${this.port}`); this._emitState(); });
  }

  stop() {
    if (this.activeSocket) { try { this.activeSocket.destroy(); } catch (_) {} this.activeSocket = null; }
    if (this.server) { try { this.server.close(); } catch (_) {} this.server = null; }
    Object.assign(this.state, { listening: false, connected: false, peer: null });
    this._writeLog(`${stamp()} STOP`);
    this._emitState();
  }

  _onConnection(socket) {
    if (this.activeSocket && !this.activeSocket.destroyed) {
      this._writeLog(`${stamp()} REJECT-2ND from=${socket.remoteAddress}:${socket.remotePort}`);
      try { socket.destroy(); } catch (_) {}
      return;
    }
    this.activeSocket = socket;
    this.decoder = new codec.FrameDecoder();
    this.state.connected = true;
    this.state.peer = `${socket.remoteAddress}:${socket.remotePort}`;
    this._writeLog(`${stamp()} CONNECT peer=${this.state.peer}`);
    this._emitState();
    socket.setKeepAlive(true, 15000);
    socket.setNoDelay(true);

    socket.on('data', (chunk) => {
      for (const f of this.decoder.push(chunk)) {
        if (f.error) { this._writeLog(`${stamp()} BAD-FRAME ${f.error}`); this.emit('protocol-error', { reason: f.error, at: stamp() }); continue; }
        this._handle(f);
      }
    });
    socket.on('close', () => {
      this._writeLog(`${stamp()} CLOSE peer=${this.state.peer}`);
      if (this.activeSocket === socket) this.activeSocket = null;
      Object.assign(this.state, { connected: false, peer: null });
      this._emitState();
    });
    socket.on('error', (err) => { this.state.lastError = err.message; this._writeLog(`${stamp()} SOCKET-ERROR ${err.message}`); this._emitState(); });
  }

  _handle(f) {
    if (f.type === codec.MSG.CONFIG) {
      const cfg = codec.parseConfig(f.body);
      this._record('in', f.type, f.raw, cfg);
      if (cfg.error) { this.emit('config-invalid', { reason: cfg.error, at: stamp() }); return; }
      this.session.config = cfg;
      this.session.configAcked = true;
      this.emit('config', cfg);
      this._sendRaw(codec.MSG.CONFIG, codec.encodeConfigAck(), { ack: 'config-complete' });
      return;
    }
    if (f.type === codec.MSG.PRINT) {
      const p = codec.parsePrint(f.body);
      this._record('in', f.type, f.raw, p);
      if (p.error) { this.emit('print-invalid', { reason: p.error, at: stamp() }); return; }
      if (!this.session.config) this._writeLog(`${stamp()} WARN print-before-config`);
      if (!p.continueCount) this.session.lastSerial = p.serialValue === 1 ? 0 : p.serialValue - 1;
      this.session.print = p;
      this.emit('print', { ...p, startSerial: p.continueCount ? codec.nextSerial(this.session.lastSerial) : p.serialValue });
      this._emitState();
      return;
    }
    if (f.type === codec.MSG.REQUEST) {
      this._record('in', f.type, f.raw, { command: f.body });
      if (f.body === '01') {
        this.state.lastPollAt = stamp();
        this._sendRaw(codec.MSG.REQUEST, codec.encodeLastSerial(this.session.lastSerial), { lastSerial: this.session.lastSerial });
      } else {
        this.emit('request-unknown', { command: f.body, at: stamp() });
      }
    }
  }

  /** Renderer reports each confirmed print so the 30 s poll returns the true last serial. */
  setLastSerial(n) {
    const v = Number(n);
    if (Number.isInteger(v) && v >= 0 && v <= codec.SERIAL_MAX) { this.session.lastSerial = v; this._emitState(); return true; }
    return false;
  }

  _sendRaw(type, frame, json) {
    if (!this.activeSocket || this.activeSocket.destroyed) return false;
    this.activeSocket.write(frame);
    this._record('out', type, frame, json);
    return true;
  }

  /** Generic send: type byte + ASCII body + EOM. */
  send(type, body) { return this._sendRaw(type, codec.encodeFrame(type, body), { body: body == null ? '' : String(body) }); }
}

module.exports = { TntServer, DEFAULT_PORT, OPCODES: codec.MSG };
