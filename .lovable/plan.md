

## Diagnosis

Two bugs prevent headers from appearing on labels in the labelTest module:

1. **Wrong table name** (line 459 of `index.ts`): The edge function queries `shipping_label_header_prefs` but the actual database table is `meli_label_header_preferences`. This causes the preferences query to silently return null.

2. **Direct PDF fallback skips header rendering** (lines 489-508): When ZPL is invalid and the system falls back to ML's direct PDF, it copies pages verbatim via `copyPages()` — no header area is created, no text is drawn. The 100x175 layout is effectively ignored.

## Fix Plan

### File: `supabase/functions/ml-generate-labels-labeltest/index.ts`

**Fix 1 — Table name** (line 459):
- Change `shipping_label_header_prefs` → `meli_label_header_preferences`

**Fix 2 — Add header to direct PDF fallback path** (lines 489-508):
- When `layoutInfo.includeHeader` is true and the fallback PDF path is used:
  - Create a new 100x175mm page
  - Load the fallback PDF, extract page 0 (label)
  - Embed it as a sub-page in the bottom 150mm area (same as the Labelary path)
  - Draw the header text in the top 25mm area using the same `buildHeaderLines` logic
  - Draw the separator line
- When header is NOT needed, keep current behavior (copy pages directly)

**Fix 3 — DANFE extraction from direct PDF fallback**:
- If the direct PDF has >1 page and `includeDanfe` is true, also copy page index 1 (DANFE) as a separate page — same logic as the ZPL path already does via `fetchDanfePdf`.

### No other files changed. No shipping-labels module changes.

## Technical Detail

The direct PDF fallback will convert the copied PDF page into an embedded object using `pdf-lib`'s `embedPage()` method, which allows placing it at a specific position within a new page — preserving the header+label layout structure.

