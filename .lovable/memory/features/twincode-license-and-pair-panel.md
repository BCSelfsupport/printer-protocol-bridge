---
name: TwinCode license tier and pair-aware Network panel
description: TwinCode is gated behind a dedicated 'twincode' license tier (or 'dev'). When canTwinCode is active, the PrintersScreen Network panel renders a Bound Pair card derived from twinPairStore; selecting it swaps the right pane to the embedded TwinCodeView (the standalone /twin-code page extracted into src/twin-code/components/TwinCodeView.tsx with an `embedded` prop). Selecting an individual printer deselects the pair and restores the dashboard.
type: feature
---

The license_tier enum has a 'twincode' value (added via migration). LicenseContext exposes `canTwinCode = tier === 'twincode' || tier === 'dev'`. Bound pair members are matched by IP from `useTwinPair()` against the printer list. The standalone /twin-code route still exists for binding workflow and training.
