

# Sandbox Cutoff & Sync Issues — Diagnosis & Fix Plan

## Problem Summary

Two issues identified:

### 1. Cutoff times are wrong (not matching Mercado Livre)
**Root cause**: The system extracts "cutoff" from the SLA endpoint's `expected_date` field of **old shipped shipments** (e.g., Feb 24th, March 6th). This field is the **delivery ETA for that specific shipment**, NOT the agency drop-off deadline. The ML panel shows "Até as 13:30h" which is the real agency cutoff — our system shows 15:00 or 16:25 from stale SLA data.

The `lead_time` API returns all null values for `estimated_schedule_limit`, `pickup_promise`, meaning ML has changed their API structure. The SLA fallback grabs irrelevant dates.

### 2. "Not syncing all accounts"
**Not a bug**: The user has 4 companies, but "Adeconex Etiquetas" has no ML account linked. The sandbox correctly shows 3 cards for the 3 companies with ML connections. The `no_account` status is correctly filtered.

---

## Fix Plan

### A. Fix cutoff extraction in `meli-shipping-cutoff-refresh/index.ts`

The SLA `expected_date` is NOT a cutoff time. Instead, the real cutoff should come from:

1. **Primary source**: Use `estimated_handling_limit` from **today's active shipments** directly. The earliest `estimated_handling_limit` with time-of-day component (not midnight) is the agency cutoff. Convert to SP timezone and extract the time.

2. **Secondary source**: The `capacity_middleend` API response may contain processing windows — parse these as the coleta cutoff.

3. **Remove the SLA fallback**: It returns delivery ETAs, not cutoffs.

**Changes**:
- In the cutoff extraction block (lines 125-285), replace the lead_time + SLA logic with direct extraction from `estimated_handling_limit` of today's `ready_to_ship`/`handling` shipments
- Query shipments with `estimated_handling_limit` between now and end-of-tomorrow (SP time)
- Extract the time component from the **earliest** handling limit as the agency cutoff
- Remove the misleading SLA endpoint fallback

### B. Fix sandbox to show the 4th company status

Add a visual indicator for the "Adeconex Etiquetas" company that has no ML account, so the user understands why it's missing. Currently it's silently filtered with `snapshot_status !== 'no_account'`. We can either:
- Keep filtering (current) and add a small note showing "1 empresa sem conta ML"
- Or show the card in a disabled/greyed state

### C. Fix `sandbox-snapshot-refresh` cutoff reading

The snapshot refresh (lines 206-264) reads cutoff from `shipping_cutoff_cache` using `accountId` (ml_account UUID) as `seller_id`. Verify the cache `seller_id` column matches this UUID — confirmed it does (e.g., `997e5eb2-8abd-4a08-9c17-977acbce7cc1`).

The cutoff from the cache is wrong because the source data (from refresh function) is wrong. Fixing the refresh function (step A) fixes this automatically.

---

## Technical Details

### Files to modify:
1. **`supabase/functions/meli-shipping-cutoff-refresh/index.ts`** — Replace lead_time/SLA extraction with handling_limit-based cutoff
2. **`src/components/sandbox/SandboxGlobalSummary.tsx`** — Optionally add "N empresas sem conta" note
3. **`src/pages/Sandbox.tsx`** — Optionally show disconnected company count

### New cutoff extraction logic (pseudocode):
```text
1. Query meli_shipments_cache WHERE seller_id = mlUserId
   AND shipment_status IN ('ready_to_ship', 'handling')  
   AND estimated_handling_limit > now()
   ORDER BY estimated_handling_limit ASC
   LIMIT 10

2. For each shipment, convert estimated_handling_limit to SP timezone
3. Extract time (HH:MM), skip midnight (00:00)
4. The earliest valid time = agency cutoff
5. If no results, try meli_orders_cache handling limits
6. Remove SLA/lead_time API calls entirely (they return wrong data)
```

This approach is simpler, faster (no external API calls), and more accurate since `estimated_handling_limit` is the actual deadline ML gives sellers.

