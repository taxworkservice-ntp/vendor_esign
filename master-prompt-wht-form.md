# MASTER PROMPT: WHT Withholding Certificate Form (ใบรับรองการหักภาษี ณ ที่จ่าย)

This is the detailed, implementation-ready spec for the WHT certificate form —
the preview, the print, and the PDF/ZIP download. Read it end to end before
touching `src/lib/wht-form.ts`, `src/lib/sheet-to-a4-pdf.ts`, or
`src/pages/WhtPrint.tsx`. It captures the exact geometry, the render pipeline,
and the races that already caused production bugs. Follow it and the form will
be correct the first time.

> **Status — verified on Safari (2026-10-05, commit `9491465`).** The first page
> of a `ดาวน์โหลดทั้งหมด` ZIP and the first single download now both include the
> form background _and_ the signature/stamp. Two fixes got there and must not be
> reverted: the canvas compositor (§7) draws the background and overlays from
> decoded images instead of nesting them in the SVG, and the auto-export waits
> for real settings + resolved asset URLs (§8).

---

## 0. Goal and non-negotiables

The WHT certificate is a **government form**. The operator (client) opens a
preview that must look exactly like the real Revenue-Department paper form,
with the buyer/seller data and the signature/stamp overlaid in the right cells,
then downloads a print-ready PDF (one file, or a ZIP of one per certificate).

Non-negotiables:

1. **The preview and the PDF must be pixel-identical.** The PDF is a raster of
   the actual preview DOM (see §7). Do not build a second, hand-drawn renderer:
   the deleted `src/lib/wht-pdf.ts` proved vector text drifts from the browser
   baseline on Thai script.
2. **Every overlay is absolutely positioned in one fixed coordinate space**
   (§3). No flow layout, no `mm`, no `%`.
3. **The tax-ID digits sit in the pre-printed cells** using measured geometry
   (§5), never with literal spaces or a single guessed pitch.
4. **The first click must include background + signature + stamp.** All three
   have race failure modes and all are guarded (§6, §7, §8).
5. Never edit the form image. Never let `cacheBust` re-append a query to a
   presigned URL (§7).

---

## 1. Files and architecture (current)

| File | Responsibility |
| --- | --- |
| `src/lib/wht-form.ts` | **Single source of truth**: page size, background path, font stack, `FieldDef`, `buildFields()` (all field coordinates), tax-ID geometry, check-mark positions, `cssTop()`. |
| `src/lib/sheet-to-a4-pdf.ts` | `loadBgImage()` (module-cached decoded background) + `ready()` + `composeSheetToA4Pdf()` (html-to-image `toSvg`, then our own canvas compositor → jsPDF A4). |
| `src/pages/WhtPrint.tsx` | Preview (`PndPage`/`CleanPage`), signature/stamp resolution to data URLs, drag editor, `exportPdf()` (single/ZIP), the `?download=1` auto-export effect. |
| `src/components/wht/signature-placement.tsx` | `PositionableImage` (drag/resize) + `SignaturePlacementPanel`. |
| `src/lib/settings-types.ts` | `Placement` type, `DEFAULT_SIGNATURE_PLACEMENT`, `DEFAULT_STAMP_PLACEMENT`, `signatureStoragePath`/`stampStoragePath`. |
| `src/lib/wht.ts` | Record types, `fmtWhtDate`, `fmtWhtNum`, `thaiBahtText`, `splitTaxId` (still used by the **clean** sheet only). |
| `server/src/wht.ts` | WHT API; `RECORD_SELECT` must include `v.address as vendor_address` mapped to `vendorAddress`. |
| `public/wht/form_page_final.png` | The blank form scan. **3024×4276 = 2× the 1512×2138 design space** (3024 = 1512×2, 4276 = 2138×2). |
| `scripts/measure-wht-taxid-boxes.py` | Re-derives the tax-ID cell geometry from the form image (Pillow). Run it if the form image ever changes. |

There is **one** renderer (the DOM) and one rasteriser (`composeSheetToA4Pdf`).
`buildFields()` feeds both the on-screen `PndPage` divs and the PDF (the PDF is
a snapshot of those divs), so they cannot drift.

---

## 2. Two sheets: `pnd` and `clean`

- `layout=pnd` (default): the scanned government form (`BG_IMAGE`) with the
  absolutely-positioned fields from `buildFields()`. This is the one that must
  be perfect.
- `layout=clean`: a self-drawn A4 HTML sheet (`CleanPage`), no background image,
  uses `splitTaxId()`. Not form-accurate by design; leave it alone unless asked.

---

## 3. Coordinate system

- Design space is exactly **1512 × 2138** (`PAGE_W`/`PAGE_H`), matching the form
  image at half resolution.
- The `.print-sheet` div is `width: 1512px; height: 2138px; position: relative;
  overflow: hidden`.
- The background `<img>` is drawn at `inset: 0; width: 1512px; height: 2138px`.
- Every field is an absolutely-positioned `<div>`: `top` and `left` are in this
  space; `fontSize` is px; digits use `whiteSpace: 'pre'`.
- `cssTop(configTop, fs) = configTop - fs + 3` (`FIELD_TOP_OFFSET = 3`). Fields
  are authored with a `configTop` (the text's baseline reference) and the helper
  converts it to the CSS box top for a `line-height: 1.35` div.
- `PAGE_W`/`PAGE_H` and the background path live only in `wht-form.ts`.

---

## 4. Field model — `buildFields(record, profile, seq)`

All numeric fields use the Cordia New stack (`FONT_FAMILY`, see §10). Amounts
that are drawn twice (upper/lower) share a value. `AMT_W = 260`, `WHT_W = 180`.

| name | configTop | left | fontSize | notes |
| --- | --- | --- | --- | --- |
| `wht_id` | 187 | 1317 | 33 | certificate no, or derived from BE year + month + seq |
| `payer_name` | 279 | 165 | 32 | `profile.company_name_th`, `width: 583` |
| `payer_taxid-0..12` | 241 | measured (§5) | 45 bold | buyer/payer 13-digit tax ID |
| `payer_address` | 337 | 166 | 31 | `wrap`, `width: 1166` |
| `name` | 464 | 169 | 32 | vendor name, `width: 583` |
| `taxid-0..12` | 416 | measured (§5) + `TAX_VENDOR_DX` | 45 bold | vendor 13-digit tax ID |
| `address` | 531 | 171 | 31 | vendor address (`vendorAddress`), `wrap`, `width: 1166` |
| `description1` | 1624 | 290 | 33 | `width: 480` |
| `date1` | 1620 | 857 | 35 | issue date (BE) |
| `amount1` | 1620 | 915 | 35 | right-aligned, `width: 260` (gross) |
| `wht1` | 1620 | 1190 | 35 | right-aligned, `width: 180` (WHT) |
| `amount2` | 1680 | 915 | 35 | right-aligned, `width: 260` |
| `wht2` | 1680 | 1190 | 35 | right-aligned, `width: 180` |
| `thai_amount` | 1726 | 503 | 36 | `thaiBahtText(whtAmount)` |
| `date_bottom` | 1945 | 972 | 35 | issue date (BE) |

Field-definition flags (rendered by `PndPage`):

```ts
interface FieldDef {
  name: string
  top: number        // already cssTop
  left: number
  fontSize: number
  bold?: boolean
  rightAlign?: boolean
  width?: number
  wrap?: boolean
  value: string
}
```

Check-mark boxes (one tick per form type), drawn as an inline SVG path:

```ts
CHECKMARK_POS: Record<WhtFormType, { top: number; left: number; fs: number }> = {
  pnd1:         { top: 605, left: 535,  fs: 32 },
  pnd1_special: { top: 605, left: 733,  fs: 32 },
  pnd2:         { top: 605, left: 1007, fs: 32 },
  pnd3:         { top: 605, left: 1203, fs: 32 },
  pnd2a:        { top: 657, left: 535,  fs: 32 },
  pnd3a:        { top: 657, left: 733,  fs: 32 },
  pnd53:        { top: 655, left: 1005, fs: 32 },
}
```

---

## 5. Tax-ID digit boxes (measured — do not guess)

The form pre-prints **13** digit cells in the Thai standard **1-4-5-2-1**
grouping. Literal spaces cannot hit them (font-metric dependent). Each digit is
drawn at a fixed `left`, centred on its printed cell.

Measured geometry (1512-wide design space) — current constants in
`src/lib/wht-form.ts`:

```ts
const TAX_GROUPS    = [1, 4, 5, 2, 1]
const TAX_GROUP_LEFT = [951.75, 997.25, 1135.75, 1303.5, 1383.75]
const TAX_GROUP_W    = [30, 122, 153.75, 62.25, 30]
const TAX_VENDOR_DX  = 1.25     // vendor row is ~1px right of the payer row in the scan
const TAX_FONT_SIZE  = 45
const TAX_DIGIT_ADV  = 16.4     // Cordia New Bold digit advance at 45px (1493/4096 em)
```

Placement per digit (group `g`, index `k` within the group):

```
left = TAX_GROUP_LEFT[g] + dx + (TAX_GROUP_W[g] / count) * (k + 0.5) - TAX_DIGIT_ADV / 2
top  = cssTop(configTop, 45)
```

Why per-group and not one base+pitch+gap: the gaps between groups vary
(≈15.4, 16.6, 14.0, 18.0 px). A single pitch/gap drifted the last digit ~4px
and knocked group 3 ~1.5px left. Measured per-group widths are exact.

Raw borders detected on the blank form (design x, `dark < 90`, threshold
`>= 85%` of the cell band):

- Payer row: `951.75, 981.75, 997.25, 1119.25, 1135.75, 1289.5, 1303.5, 1365.75, 1383.75, 1413.75`
- Vendor row: `952.75, 983.25, 998.75, 1120.75, 1137.25, 1290.75, 1305.0, 1367.25, 1384.75, 1415.5`

Vertical bands (design y) and centres: payer box ≈ `211.5…247.5` (centre
≈ 229.5); vendor box ≈ `386…422` (centre ≈ 404). The `cssTop` of a 45px
`line-height: 1.35` div puts the glyph centre at ≈ `configTop` + 30, i.e.
231.5 (payer) / 406 (vendor) — within ~2px of the printed centres, so **do not
change the vertical offsets**; only the horizontal geometry was wrong.

**Re-measure** with `python3 scripts/measure-wht-taxid-boxes.py` (needs Pillow).
It prints the borders and bands; update the two arrays if the form image changes.
Verify visually by overlaying the computed cells on the form before committing.

---

## 6. Signature and stamp placement

- Stored per workspace in settings: `signature_placement` / `stamp_placement`,
  typed `Placement { x, y, w, h }` in the 1512×2138 space.
- Defaults: signature `{ x: 964, y: 1883, w: 186, h: 70 }`; stamp
  `{ x: 1170, y: 1883, w: 139, h: 139 }` (stamp sits to the right of the
  signature, above the sign-date line).
- Rendered by `PositionableImage` inside `.print-sheet`; `editable` toggles the
  drag/resize outline. The editor is off during capture (`setEditing(false)`).
- The stamp is drawn at `opacity: 0.85`.
- The image bytes are resolved to **data URLs** (`signDownload(path)` → `fetch`
  → `FileReader`); the preview renders them from those. **They are not inlined
  into the capture** — `PositionableImage` tags them `data-role="overlay"`, the
  exporter filters them out of the SVG and draws them itself (see §7). This is
  what stopped Safari dropping them on the first capture.

---

## 7. Background + overlay compositor (why Safari is fixed)

**Never inline a large image into the html-to-image SVG.** html-to-image
serialises a sheet into an SVG data URL (`svgToDataURL` percent-encodes, it does
not base64). A 3.3 MB form scan inlined as a ~4.4 MB data URL becomes a ~5 MB
data URL with a nested image data URL; Safari cannot reliably decode that while
rasterising, so the image is dropped **on the first capture only** (later
captures hit the browser's decoded cache). This hit the background first; the
signature/stamp data URLs had the same flaw, smaller and rarer.

The fix (in `composeSheetToA4Pdf`):

- `loadBgImage()` fetches `BG_IMAGE = '/wht/form_page_final.png'` (3024×4276,
  ~3.3 MB) once and returns a **decoded `HTMLImageElement`** (module-cached;
  retries on failure). `loadImage(src)` does the same for the overlays.
- Mark images to draw ourselves: the background `<img data-role="form-bg">` and
  the signature/stamp `<img data-role="overlay">`.
- `toSvg(el, { cacheBust: false, filter })` where `filter` drops both roles, so
  the SVG is small and contains only text/vector.
- Draw onto one canvas at `pixelRatio = 2` in order: **background → sheet →
  overlays**. Overlays use object-fit `contain` maths (`drawContain`) and the
  stamp's `opacity: 0.85`.
- `cacheBust` must stay `false`: a cache-bust query appended after a presigned
  URL's `X-Amz-Signature` invalidates it (R2 → 403 with no CORS).
- `ready()` still awaits `document.fonts.ready` and every `<img>`'s `decode()`
  before `toSvg`, so Thai text is shaped with the loaded face.

`WhtPrint.exportPdf` calls `loadBgImage()` once and builds `overlays` from
`signatureUrl`/`stampUrl` + their placements, then calls
`composeSheetToA4Pdf(sheet, bg, overlays)` per sheet.

---

## 8. Export / download pipeline and the auto-export race (read twice)

**`exportPdf()`** (in `WhtPrint.tsx`):

1. `setEditing(false)`; wait two `requestAnimationFrame`s (let React commit +
   paint the editor outline off).
2. `const bg = await loadBgImage()`; build `overlays` (stamp then signature) from
   the resolved data URLs + placements.
3. `document.querySelectorAll('.print-sheet')`; snapshot each with
   `composeSheetToA4Pdf(sheet, bg, overlays)`. `i < records.length` bounds the
   loop.
3. One record → single PDF via `saveBlob`. Several → `fflate.zipSync(files,
   { level: 0 })` (PDFs are already compressed) named
   `wht-certificates-{period}-{n}-docs-{stamp}.zip`.

**Auto-export** — the list's `ดาวน์โหลดทั้งหมด` link
(`WhtList.tsx:printHref`) opens `/wht/print?...&download=1` in a new tab; the
effect below exports once when everything is ready:

```ts
useEffect(() => {
  if (!download || autoExported.current) return
  if (!settings || profileSource !== settings) return   // ← critical
  if (loading || !profile || records.length === 0) return
  if (settings.signatureStoragePath && !signatureUrl) return
  if (settings.stampStoragePath && !stampUrl) return
  autoExported.current = true
  void exportPdf()
}, [download, settings, profileSource, loading, profile, records, signatureUrl, stampUrl])
```

**The race this fixes (do not remove the guards).** `useSettings()` returns
`undefined` first; the profile effect copies `defaultSettings(tenant)` into
`profile`, and that seed has **no** `signatureStoragePath`/`stampStoragePath`.
`profile` lags `settings` by one render. So on the render where `settings`
arrives, `profile` is still the seed: a guard written against `profile.*` passes
vacuously, the export fires with no signature/stamp, and `autoExported` blocks
the correct retry. Fix = track `profileSource` (set with `profile` in the same
effect) and require `profileSource === settings`; check the asset paths against
`settings` (source of truth), not `profile`.

Background and signature/stamp are separate: `exportPdf` itself awaits
`loadBgImage()` and decodes the overlays, so the first click always has both.

---

## 9. Data flow

- Settings come from `useSettings()` → `GET /api/settings` (server-backed) or
  localStorage in mock mode. Fields used here: `displayName`, `taxId`,
  `address`, `clientCode`, `signatureStoragePath`, `stampStoragePath`,
  `signaturePlacement`, `stampPlacement`.
- `WhtProfile` (in `wht-form.ts`) is the render-time projection of settings:
  `company_name_th`, `tax_id`, `address`, `clientCode`, signature/stamp paths.
- The server WHT record must carry `vendorAddress` (from
  `v.address as vendor_address` in `RECORD_SELECT`); otherwise the seller
  address row is blank.
- Signature/stamp bytes: `signDownload(path)` → presigned URL → `fetch` →
  data URL. A configured path with no blob resolves to `null` (preview simply
  omits the image) and the auto-export gate waits while the URL is unresolved.

---

## 10. Fonts

- Stack: `"'Cordia New', 'Sarabun', 'Noto Sans Thai', sans-serif"`
  (`FONT_FAMILY`).
- `src/index.css` declares `@font-face` for Cordia New Regular/Bold pointing at
  `public/fonts/CordiaNew-Regular.ttf` / `CordiaNew-Bold.ttf` (extracted from
  `public/fonts/cordia.ttc` by `scripts/extract-cordia-fonts.py`).
- Digit advance used for centring: **1493/4096 em × 45px = 16.4px**.
- `ready()` awaits `document.fonts.ready` before capture, so the PDF uses the
  same face as the preview.

---

## 11. How to test

**Local** (needs the real DB + R2; `.env.local` is gitignored):

```bash
npm run api:dev   # 8787 public / 8788 admin, binds 127.0.0.1
npm run dev       # vite 5173
```

Log in as a client workspace that **has** a signature and stamp configured
(e.g. `testcompany@gmail.com` / `test1234`, workspace TESTCO) and open `/wht`.

Checks:
1. **Preview:** vendor address on both rows; tax-ID digits centred in the
   printed cells; signature + stamp in position.
2. **Single download:** background + signature + stamp present on the first
   click (no blank background).
3. **`ดาวน์โหลดทั้งหมด`** (new tab, `?download=1`): the ZIP has background +
   signature + stamp on every page, identical to a manual download.
4. **Move + save** the signature/stamp, reload, confirm persistence.
5. **Safari specifically:** repeat checks 2 and 3. This is the browser that
   dropped the background and the signature/stamp on the first capture; it is the
   regression that matters most.
6. Re-run `npm run lint`, `npm test` (359+ tests), `npm run build`.

Verify the asset chain without a browser:

```bash
node --input-type=module -e '
const B="http://localhost:8787"
const r=await fetch(B+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"testcompany@gmail.com",password:"test1234"})})
const cookie=(r.headers.get("set-cookie")||"").split(";")[0]
const s=await fetch(B+"/api/settings",{headers:{cookie}}).then(x=>x.json())
for(const p of [s.signatureStoragePath,s.stampStoragePath]){
  const sd=await fetch(B+"/api/files/sign-download",{method:"POST",headers:{"Content-Type":"application/json",cookie},body:JSON.stringify({path:p})}).then(x=>x.json())
  const b=await fetch(sd.url).then(x=>x.blob()); console.log(p, b.size, b.type)
}'
```

Expect two non-empty `image/png` blobs.

**Production:** push to `main` (deploy is automatic), wait for the Vercel
deployment to reach `READY`, then repeat check 3 on
`https://vendor.taxworkaccount.com`.

---

## 12. Gotchas / do-not list

- Do **not** reintroduce a server-side/vector WHT PDF renderer. Raster the DOM.
- Do **not** remove `cacheBust: false`.
- Do **not** drop `img.decode()` from `ready()`, or the `await loadBgImage()` /
  overlay decode in `exportPdf`.
- Do **not** inline the background or the signature/stamp into the captured SVG
  (i.e. do not remove the `data-role` filter). Composite them on the canvas.
- Do **not** gate auto-export on `profile.*` asset paths alone, and do **not**
  remove `profileSource === settings`.
- Do **not** pass a cross-origin R2 URL to html-to-image; resolve it to a data
  URL / decoded image first.
- Do **not** use `splitTaxId()` on the `pnd` sheet; it is for the `clean` sheet.
- Do **not** change the vertical `configTop` values; only horizontal tax-ID
  geometry was ever wrong.
- Do **not** edit `form_page_final.png`.

---

## 13. Definition of done

Lint, all tests, and the build pass; the single download and the ZIP both match
the preview (background + signature + stamp) from the first click; tax-ID digits
sit in their printed cells on both rows; placement persists; and a short report
is given before moving on.
