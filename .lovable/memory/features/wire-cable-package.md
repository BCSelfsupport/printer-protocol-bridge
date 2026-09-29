---
name: Wire & Cable package
description: 'wirecable' licence tier; scan production-sheet barcode (job ID) -> DB lookup -> ^NM/^SV/^SM to printer; job log
type: feature
---
- Requested by Italian sister company (cable marking). Tier `wirecable` = Database features + Wire & Cable tabs; `dev` also unlocks.
- Sheet barcode is ONLY a job ID linking to the DB row that holds the message + data (user confirmed). Not full data.
- Scanners: USB keyboard-wedge at PC + phone companion. Scanning "P<n>" selects target printer.
- Options: confirm before send, reset print counter (^CC 0;0) per job, seed Custom Counter 1 as length start.
- Required cable features: metre/foot numbering, counter reset per job, job log/CSV, tower printing, flip-flop (alternate direction each print). More to come.
- Open: sample production sheet, their DB system, whether printer must show running metres.
