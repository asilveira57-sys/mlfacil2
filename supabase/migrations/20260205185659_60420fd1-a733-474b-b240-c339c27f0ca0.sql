-- Add ml_synced value to qa_response_source enum
ALTER TYPE qa_response_source ADD VALUE IF NOT EXISTS 'ml_synced';