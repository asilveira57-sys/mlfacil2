-- Add cursor_offset column for pagination-based sync
ALTER TABLE post_sale_messages_sync_state 
ADD COLUMN IF NOT EXISTS cursor_offset INTEGER DEFAULT 0;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_post_sale_sync_state_status 
ON post_sale_messages_sync_state(seller_id, status);