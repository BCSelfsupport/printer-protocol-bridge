---
name: Twin Code — zero hardware counters on bind
description: Bind preSelect zeros HMI Print Count (^CC 0;0) and Product Count (^CC 6;0) on both A and B so the service display matches the HUD and audit CSV from bottle 1.
type: feature
---

# Why

Operators were seeing the LID showing "10 prints" while the SIDE showed "84" on
the HMI service screen because the printers' lifetime/run counters drifted
between sessions. Combined with the auto-code counter slot that's already
reset at bind, zeroing the **Print Count** (counter id 0) and **Product Count**
(counter id 6) gives every new bind a clean slate that matches the HUD bottle
number and the audit CSV `bottleIndex`.

# How

`twinDispatcher.bind()` preSelect (`src/twin-code/twinDispatcher.ts`) now sends
to BOTH A and B before ^SM-activating the production message:

```
^CC 0;0    # zero HMI Print Count
^CC 6;0    # zero HMI Product Count
^CC <slot>;I1 ... S<start> ... E999999 ... L1 ... T0 ... <start-1>
```

Counter ids per BestCode protocol v2.6 ^CC table:
- `0` → Print Count
- `1..4` → Custom counters (auto-code uses one of these)
- `6` → Product Count

# Companion memory

- `mem://integration/cc-named-parameters` — ^CC parameter syntax
- `mem://features/counter-management-protocol` — ^CN polling
