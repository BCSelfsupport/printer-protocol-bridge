---
name: Developer Access System
description: License-key + TOTP 2FA gate for the Dev Panel; owner-issued one-time invite codes promote new dev keys.
type: feature
---

# Developer Access System

The Dev Panel is no longer reachable from arbitrary licensed installs. Three layers gate it:

1. **`isDeveloper` check** — only license keys present in `developer_licenses` see the 5-tap gesture on the Activate badge. For everyone else that button is just an Activate/tier label.
2. **TOTP 2FA** — even developer keys must enroll an authenticator (Google Authenticator/1Password/Authy) on first sign-in and supply a 6-digit code on every sign-in.
3. **Owner-issued invites** — only the owner key (`is_owner=true`) can promote new keys, and only by re-confirming with their own current TOTP code.

The shared `DEV_PORTAL_PASSWORD` secret is no longer used.

## Owner key
`53F2G-K94HE-VK8DB-8RB4U` is seeded as the master with `is_owner=true`.

## First-time enrollment (you, the owner)
1. Activate `53F2G-K94HE-VK8DB-8RB4U` on your machine as normal.
2. 5-tap the Activate badge → Dev Sign In dialog opens.
3. It will say "you haven't enrolled". Click **Generate authenticator QR**.
4. Scan the QR with Google Authenticator (or any TOTP app). Save the secret in a password manager too — you only see it once.
5. Type the current 6-digit code → you're in.

## Adding another developer
1. You: open Dev Panel → **Devs** tab.
2. Confirm with your TOTP code → click **Create invite** → copy the code (`XXXX-XXXX-XXXX`).
3. Send it to the developer. Code is valid 24 h, single use.
4. They activate their license, 5-tap Activate (which won't work yet because they're not a developer). They'll see the dialog with **"I have a developer invite code"** — paste, redeem, then enroll their own TOTP.

## Recovery (lost authenticator)
There's intentionally no self-serve "reset 2FA" — that would defeat the purpose. To recover:
1. Run a SQL update in Supabase: `UPDATE developer_licenses SET totp_secret_encrypted = NULL, totp_enrolled_at = NULL WHERE license_id = '<your-license-uuid>';`
2. Sign in again — it'll re-prompt you to enroll.

## Revoking a developer
SQL: `DELETE FROM developer_licenses WHERE license_id = '<their-license-uuid>';`

## Tables
- `developer_licenses` — `license_id` UNIQUE, `totp_secret_encrypted` (AES-GCM), `is_owner`, `created_by_license_id`, `last_signin_at`.
- `developer_invites` — `code` UNIQUE, `expires_at` (24 h), `consumed_at`, `consumed_by_license_id`.
- Both tables: RLS denies all client access; only edge functions (service role) read/write.

## Edge functions
- `verify-dev-access` — status / enroll / verify (TOTP).
- `developer-invite` — owner creates an invite (TOTP-confirmed), recipient redeems it.

## Secrets
- `DEV_TOTP_ENCRYPTION_KEY` — passphrase used to AES-GCM encrypt TOTP secrets at rest. **Never rotate without first decrypting and re-encrypting all rows, or every developer will need to re-enroll.**
- `DEV_PORTAL_PASSWORD` — unused, can be deleted.

## Local dev (vite)
`import.meta.env.DEV` short-circuits to `tier='dev'` and `isDeveloper=true` — local development is unaffected.
