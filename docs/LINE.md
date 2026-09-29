# LINE connection — final step (guided setup)

> **Status: DEFERRED.** For now there is no LINE integration. The client
> **copies the invite message/link** from the transaction page and **pastes it
> manually** into the LINE chat with the vendor. The transaction page has
> “คัดลอกข้อความ” (message + link) and “คัดลอกลิงก์”. Everything below is the
> later upgrade path.

Target end state: vendor verifies through **LINE Login (LIFF)**; the server
stores the LINE user id + timestamp; `verification_method` becomes
`'line-liff'` instead of `'stub-deferred'`. Nothing else changes.

## 1. You do this in the LINE Developers console (~15 min)
1. https://developers.line.biz → log in → **Create provider** (e.g. `Taxwork`).
2. Provider → **Create a LINE Login channel** → fill name/description →
   note the **Channel ID** and **Channel secret**.
3. Channel → **LIFF tab → Add**: size **Full**, endpoint URL =
   `https://<your-frontend-host>/v/` (e.g. your deployed origin + `/v/`),
   scope: `openid` (+ `profile` if you want the display name) →
   note the **LIFF ID** (`xxxxxxx-xxxxxxxx`).
4. Paste into `.env.local` (frontend build + API server both read it):
   `VITE_LIFF_ID=<liff id>`, `LIFF_ID=<same>`, `LINE_CHANNEL_ID=<channel id>`.

Vendor links then become `https://liff.line.me/<LIFF_ID>?token=<token>` —
LIFF forwards `?token=` to the endpoint URL, so the existing `/v/:token`
page keeps working unchanged (it reads the query param as fallback).

## 2. Code insertion points (I wire these once IDs exist)
- `src/pages/VendorSign.tsx` — on mount: `liff.init({ liffId })` →
  if not logged in, `liff.login()` → `liff.getIDToken()` → include
  `idToken` in the sign POST. Replaces the amber "test mode" box.
- `server/src/api.ts` — `POST /api/vendor/:token/sign`: verify the
  `idToken` via `POST https://api.line.me/oauth2/v2.1/verify`
  (`id_token` + `client_id=LINE_CHANNEL_ID`), take `sub` as
  `line_user_id`, set `verification_method='line-liff'`.
- Test inside the **LINE in-app browser** on a small phone; keep the
  expired/revoked/signed states covered by the existing friendly cards.

## 3. Rollback
Unset `VITE_LIFF_ID` → vendor page falls back to `stub-deferred` with the
amber notice. No schema change either way (`verification_method` is text).
