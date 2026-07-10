/**
 * TnT (Track-n-Trace) TCP endpoint — Phase 1
 *
 * Implements the network edge described in TnT_Protocol_Compatibility_and_SOW.pdf
 * §4 Phase 1: TCP server bound to port 8101 (configurable), single connection
 * per line, DJDACP2D-03 frame codec, per-line rolling audit log.
 *
 * Phase 2+ (Config → bind, Print → dispatch, Status reporter, fault mapping)
 * will consume `onFrame` events emitted here — this file intentionally does
 * NOT couple to twinDispatcher yet.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { encodeFrame, FrameDecoder, OPCODES, OPCODE_NAMES, parseJsonPayload } = require('./tntCodec.cjs');

const DEFAULT_PORT = 8101;
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB rolling per line

function stamp() { return new Date().toISOString(); }

class TntServer extends EventEmitter {
  constructor({ port = DEFAULT_PORT, logDir } = {}) {
    super();
    this.port = port;
    this.logDir = logDir;
    this.server = null;
    /** @type {net.Socket|null} */
    this.activeSocket = null;
    this.decoder = new FrameDecoder();
    this.state = {
      listening: false,
      port,
      connected: false,
      peer: null,
      framesIn: 0,
      framesOut: 0,
      lastFrameAt: null,
      lastError: null,
    };
    this.recent = []; // [{dir, opcode, name, at, size, json}]
    if (logDir) {
      try { fs.mkdirSync(logDir, { recursive: true }); } catch (_) {}
    }
  }

  _logPath() {
    if (!this.logDir) return null;
    return path.join(this.logDir, 'tnt-uplink.log');
  }

  _writeLog(line) {
    const p = this._logPath();
    if (!p) return;
    try {
      const st = fs.existsSync(p) ? fs.statSync(p) : null;
      if (st && st.size > MAX_LOG_BYTES) {
        try { fs.renameSync(p, p + '.1'); } catch (_) {}
      }
      fs.appendFileSync(p, line + '\n');
    } catch (_) {}
  }

  _record(dir, opcode, payload, extra) {
    const name = OPCODE_NAMES[opcode] || `0x${opcode.toString(16).padStart(2,'0')}`;
    const json = parseJsonPayload(payload);
    const entry = {
      dir, opcode, name, at: stamp(),
      size: payload ? payload.length : 0,
      json,
      ...(extra || {}),
    };
    this.recent.push(entry);
    if (this.recent.length > 100) this.recent.splice(0, this.recent.length - 100);
    this.state.lastFrameAt = entry.at;
    if (dir === 'in') this.state.framesIn++; else this.state.framesOut++;
    this._writeLog(`${entry.at} ${dir.toUpperCase()} ${name} len=${entry.size} ${json ? JSON.stringify(json) : ''}`);
    this.emit('frame', entry);
    this.emit('state', this.getState());
  }

  getState() {
    return { ...this.state, recent: this.recent.slice(-25) };
  }

  start() {
    if (this.server) return;
    this.server = net.createServer((socket) => this._onConnection(socket));
    this.server.on('error', (err) => {
      this.state.lastError = err.message;
      this._writeLog(`${stamp()} SERVER-ERROR ${err.message}`);
      this.emit('state', this.getState());
    });
    this.server.listen(this.port, () => {
      this.state.listening = true;
      this.state.port = this.port;
      this._writeLog(`${stamp()} LISTEN port=${this.port}`);
      this.emit('state', this.getState());
    });
  }

  stop() {
    if (this.activeSocket) { try { this.activeSocket.destroy(); } catch (_) {} this.activeSocket = null; }
    if (this.server) { try { this.server.close(); } catch (_) {} this.server = null; }
    this.state.listening = false;
    this.state.connected = false;
    this.state.peer = null;
    this._writeLog(`${stamp()} STOP`);
    this.emit('state', this.getState());
  }

  _onConnection(socket) {
    // TnT is one logical line = one connection. Reject a second concurrent client.
    if (this.activeSocket && !this.activeSocket.destroyed) {
      this._writeLog(`${stamp()} REJECT-2ND from=${socket.remoteAddress}:${socket.remotePort}`);
      try { socket.destroy(); } catch (_) {}
      return;
    }
    this.activeSocket = socket;
    this.decoder = new FrameDecoder();
    this.state.connected = true;
    this.state.peer = `${socket.remoteAddress}:${socket.remotePort}`;
    this._writeLog(`${stamp()} CONNECT peer=${this.state.peer}`);
    this.emit('state', this.getState());

    socket.setKeepAlive(true, 15000);
    socket.setNoDelay(true);

    socket.on('data', (chunk) => {
      const frames = this.decoder.push(chunk);
      for (const f of frames) {
        if (f.error) {
          this._writeLog(`${stamp()} BAD-FRAME ${f.error}`);
          this._sendNack(f.error);
          continue;
        }
        this._record('in', f.opcode, f.payload);
      }
    });

    socket.on('close', () => {
      this._writeLog(`${stamp()} CLOSE peer=${this.state.peer}`);
      if (this.activeSocket === socket) this.activeSocket = null;
      this.state.connected = false;
      this.state.peer = null;
      this.emit('state', this.getState());
    });

    socket.on('error', (err) => {
      this.state.lastError = err.message;
      this._writeLog(`${stamp()} SOCKET-ERROR ${err.message}`);
      this.emit('state', this.getState());
    });
  }

  /** Send a frame to the connected TnT client. */
  send(opcode, payload) {
    if (!this.activeSocket || this.activeSocket.destroyed) return false;
    const frame = encodeFrame(opcode, payload);
    this.activeSocket.write(frame);
    this._record('out', opcode, Buffer.isBuffer(payload) ? payload : Buffer.from(
      payload == null ? '' : (typeof payload === 'string' ? payload : JSON.stringify(payload)),
      'utf8'
    ));
    return true;
  }

  ack(refOpcode, extra) { return this.send(OPCODES.ACK, { ref: OPCODE_NAMES[refOpcode] || refOpcode, ...(extra || {}) }); }
  _sendNack(reason) { return this.send(OPCODES.NACK, { reason }); }
}

module.exports = { TntServer, DEFAULT_PORT, OPCODES };
