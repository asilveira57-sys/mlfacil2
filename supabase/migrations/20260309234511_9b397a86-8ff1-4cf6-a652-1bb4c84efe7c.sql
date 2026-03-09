ALTER TABLE public.send_metrics_snapshots 
  ADD CONSTRAINT send_metrics_snapshots_planted_item_date_unique 
  UNIQUE (planted_item_id, snapshot_date);