
## Diagnosis

### Issue 1: "Envios de hoje" showing 4 instead of 7

The RPC `get_shipping_orders` filters "today dispatch" orders using:

```sql
s.estimated_handling_limit <= v_today_end
```

Where `v_today_end` = end of today in BRT = `2026-02-26 03:00:00 UTC`.

The 7 `ready_to_print` orders for the seller break down as:
- **3 orders** have `estimated_handling_limit` set to **Feb 26 BRT** (tomorrow) -- e.g. `2026-02-26 07:03 BRT`, `16:28 BRT`, `16:36 BRT`. These are **excluded** because they exceed `v_today_end`.
- **4 orders** have `estimated_handling_limit = NULL` -- these are **included** via the fallback clause.

Result: only 4 show. But Mercado Livre shows all 7 as "envios de hoje" because the seller must act TODAY to meet tomorrow's deadline.

**Fix**: Extend the handling limit window by 1 day:

```sql
s.estimated_handling_limit <= v_today_end + interval '1 day'
```

### Issue 2: Cutoff time not appearing

The logs reveal:
1. **`handling_time` API** returns **404** (endpoint not available for this seller type)
2. **Shipment-based fallback** searches `estimated_handling_limit` within today's BRT window (`03:00 UTC – 02:59 UTC`), but all handling limits fall on Feb 26 UTC (outside the window). Result: **no cutoff found**.
3. **`shipping_preferences`** returns successfully but contains no cutoff time data (only `flex_enabled = true`, `cutoff_type = "unknown"`)
4. **`capacity_middleend`** returns successfully but contains capacity data, not cutoff times

**Fix**: Extend the shipment-based fallback search window to include tomorrow's deadlines (same root cause as Issue 1), and extract the earliest deadline as a usable cutoff reference.

---

## Implementation Plan

### Step 1 -- Fix the `get_shipping_orders` RPC (database migration)

Update the "today_dispatch" filter clause from:

```sql
s.estimated_handling_limit <= v_today_end
```

To:

```sql
s.estimated_handling_limit < v_today_end + interval '1 day'
```

This captures orders whose deadline is today or tomorrow (in BRT), matching ML's behavior of showing "envios de hoje" for orders the seller must prepare now.

### Step 2 -- Fix the cutoff refresh edge function

In `meli-shipping-cutoff-refresh/index.ts`, extend the shipment-based cutoff fallback search window:

Change the query range from today-only:
```
todayStartUTC .. todayEndUTC  (24h window)
```
To today + tomorrow:
```
todayStartUTC .. tomorrowEndUTC  (48h window)
```

This ensures the earliest `estimated_handling_limit` (e.g., Feb 26 07:03 BRT) is found and used as the colecta cutoff time.

### Step 3 -- Deploy and audit log

- Deploy the updated edge function
- Add a `system_logs` entry documenting the fix
- Verify the RPC returns 7 orders for "today_dispatch"
- Verify the cutoff cache gets populated with a time value

### Technical Details

```text
Root cause diagram:

ML "Envios de hoje" = orders seller must act on TODAY
  └─ includes orders with deadline TOMORROW (dispatch today to meet it)

System "Envios de hoje" filter:
  └─ only includes handling_limit <= end-of-today-BRT
  └─ MISSES orders with handling_limit = tomorrow-BRT

Same gap affects cutoff extraction:
  └─ searches handling_limit within today-BRT only
  └─ finds nothing → cutoff = NULL → "—" in UI
```

No changes to RLS policies, no changes to table structure. Only the RPC function and one edge function are modified.
