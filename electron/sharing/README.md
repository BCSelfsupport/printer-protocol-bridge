# Master PC sharing

Use the same updated Windows installer on the Master and viewing PCs.

1. Activate the Master with its own network-capable licence; configure and connect printers normally.
2. Open **Master PC Sharing**, enable sharing and allow Windows firewall access on the **Private** factory network only (TCP 8767).
3. On a viewing PC choose **Connect to Master PC**, even before activating a licence. Enter the factory address, fingerprint copied directly from the Master, pairing code and PC name.
4. Approve the named PC on the Master. Generate a new code for each additional viewer.
5. Remove a viewer from the Master's list to revoke its access immediately.

Viewing PCs have no printer-control access and require no separate licence key. They display the Master's current collected data and existing production records. An idle printer with no service collection may have unavailable service fields; viewers do not open connections or change selection to obtain them. No historical maintenance ledger is introduced.

The Master app must remain running. Minimising is supported; closing/quitting ends sharing. Enabled sharing resumes on restart after licence verification. Sleep is inhibited during sharing. Normal licence checks still need internet; a protected 30-minute verified entitlement permits short network interruptions, not unlimited offline sharing. No internet printer-data relay or router port forwarding is used.

Legacy mobile operators now need the **Mobile operator token** displayed by the Master. It changes when the app restarts. This token authorises existing mobile commands and must not be given to read-only viewers. The legacy HTTP route remains local-network operator transport; the new desktop viewing route is TLS encrypted and certificate-pinned. Re-pair rather than accepting a changed fingerprint without verifying it on the Master.

Validation: `bunx vitest run src/master-pc/sharing.test.ts src/test/printerAvailability.test.ts` and `node --test electron/sharing/tests/master.test.cjs`. The TLS integration test uses a temporary licence-service stub and private LAN interface, not a production activation. Browser UI checks use an injected desktop bridge; they do not establish Windows installer operation. Real-printer and Windows firewall/credential checks are required before customer rollout.