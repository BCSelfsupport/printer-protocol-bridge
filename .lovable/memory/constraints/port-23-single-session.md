---
name: Port 23 single-session safety
description: BestCode printers lock up from background/ephemeral Telnet probes; only explicit persistent connections may use port 23.
type: constraint
---

BestCode printers must be treated as **one fragile port-23 session per printer**.

Forbidden:
- Background `connect → ^SU/^LE/^SM → disconnect` probes for idle printers
- Quick-status loops that open Telnet for printer cards
- Any availability/background check that touches port 23 before the operator explicitly connects/selects that printer
- Parallel ephemeral sessions based on an assumption that firmware supports concurrent Telnet

Allowed:
- ICMP ping for idle reachability only
- One explicit persistent socket per connected printer
- Serialized commands over that socket, with save/polling guards already in place

Why: idle printers were locking up simply from network background probes every ~15s, even without active saves.