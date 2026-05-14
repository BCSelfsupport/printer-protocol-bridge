---
name: Twin Code — zero hardware counters on bind
description: Bind pre/post/final zeros HMI Print Count and Product Count on both A and B using compact, named, full named, and ^CN fallback forms, then verifies.
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

`twinDispatcher.bind()` sends counter-zero commands to BOTH A and B before and
after ^SM-activating the production message, then performs a final forced reset
and verifies with ^CN. It must try all accepted forms because firmware variants
apply different spellings to HMI service counters:

```
^CC 0;0    # compact legacy form used by the manual Counters screen
^CC 6;0
^CC 0;V0   # named current-value form
^CC 6;V0
^CC 0;V0;S0;L0;T0;I1;E999999999;R0  # full named fallback
^CC 6;V0;S0;L0;T0;I1;E999999999;R0
^CN 0;0    # harmless fallback if firmware supports ^CN n;value writes
^CN 6;0
^CC <slot>;I1 ... S<start> ... E999999 ... L1 ... T0 ... <start-1>
^CN        # verify Product Count and Print Count are zero
```

Counter ids per BestCode protocol v2.6 ^CC table:
- `0` → Print Count
- `1..4` → Custom counters (auto-code uses one of these)
- `6` → Product Count

# Companion memory

- `mem://integration/cc-named-parameters` — ^CC parameter syntax
- `mem://features/counter-management-protocol` — ^CN polling
