
## Plan: Fix shipment status sync stuck on "printed"

### Problem
Shipment `46866434971` shows `ready_to_ship/printed` in cache but was already delivered on ML. The current `shipping-status-sync` only checks shipments with status in `["ready_to_ship", "handling", "pending"]` — once a shipment moves to `shipped` or `delivered` on ML, it's correctly excluded from polling. **But if the cache update from `ready_to_ship → shipped` is missed (e.g., webhook failure, sync interruption), the shipment stays "stuck" in `ready_to_ship` forever** because:

1. Webhooks may fail or be dropped silently.
2. The sync hits the 150-shipment limit per account ordered by `last_sync_at ASC`, so high-volume accounts can have stale entries pushed back.
3. There's no detection of "logically impossible" stuck states (e.g., `ready_to_ship/printed` for >5 days when ML usually delivers in 2-3 days).

### Fix

**File: `supabase/functions/shipping-status-sync/index.ts`**

1. **Add a "stale stuck shipments" pass** — at the start of each account loop, additionally fetch shipments where:
   - `shipment_status = 'ready_to_ship'`
   - `shipment_substatus IN ('printed', 'ready_for_pickup')`
   - `last_sync_at < now() - interval '24 hours'` OR `date_created < now() - interval '5 days'`
   
   These get priority revalidation (separate batch of up to 50 per account, before the regular pass).

2. **Increase per-account limit** from 150 → 250 to reduce backlog risk.

3. **Add terminal-state safety net** — also revalidate shipments stuck in `shipped` (not yet `delivered`) for >7 days, limited to 30 per account.

4. **Better logging** — log when a shipment transitions to a terminal state (`delivered`, `not_delivered`, `cancelled`) so we can track resolution.

5. **One-shot manual recovery** — add a `?shipment_id=X` query param support so admins can force-revalidate a single shipment without waiting for the cron.

### Verification

After deploy:
- Manually invoke with `?shipment_id=46866434971` to fix the reported case immediately.
- Confirm cache now shows `delivered` status.
- Monitor next scheduled run logs for "transitioned to terminal" entries.

### Scope
Single file change. No frontend, no DB schema, no impact on `shipping-labels` or `labelTest`.
