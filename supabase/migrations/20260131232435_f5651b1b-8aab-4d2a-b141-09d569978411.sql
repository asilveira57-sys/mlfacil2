-- Add company_id column to ml_accounts for hierarchical linking
ALTER TABLE ml_accounts 
ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

-- Create index for performance on company lookups
CREATE INDEX idx_ml_accounts_company_id ON ml_accounts(company_id);