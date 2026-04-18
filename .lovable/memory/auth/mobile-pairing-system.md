---
name: Mobile Pairing System
description: 5-min QR code/PIN for mobile companion. Multiple phones can be paired per license; manage list in PairMobileDialog.
type: feature
---

Mobile devices access the application as companion sessions via a QR Code Pairing system.

- **Multi-device**: Multiple phones can be paired to a single license simultaneously. There is no DB or backend cap.
- **Pairing flow**: PC requests a 6-char code (5 min TTL). Mobile enters code or scans QR. Pairing creates an `active` companion_session row.
- **Generate-pair-code**: Only expires older `pending` codes — does NOT touch `active` sessions, so existing paired phones remain.
- **Management UI**: PairMobileDialog shows the live list of paired devices (machine ID, paired-at, last-seen) with an Unpair button. List polls every 5s while dialog is open.
- **Edge function actions**: `list-companions` returns all active sessions for a license; `revoke-companion` marks a single session as `revoked`.
