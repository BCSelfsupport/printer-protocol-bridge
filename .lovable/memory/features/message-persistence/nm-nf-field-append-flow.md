---
name: Protocol v2.6 ^NM/^NF append flow
type: feature
---
For messages over 7 fields, do not inline every field in one ^NM. Protocol v2.6 provides ^NF to add fields to an existing message; create with ^NM header plus first field, then append remaining fields with one ^NF per field. Do not send ^SV — it does not exist. This avoids firmware ECONNRESET/lockup seen at F8 on DOZEN12. Slaves must always be deselected before ^DM/^NM rewrite because currentMessage metadata can be stale.
