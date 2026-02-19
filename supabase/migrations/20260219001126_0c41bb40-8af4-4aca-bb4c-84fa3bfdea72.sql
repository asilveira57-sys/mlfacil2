
-- Drop old FK
ALTER TABLE public.module_tag_assignments 
  DROP CONSTRAINT module_tag_assignments_module_id_fkey;

-- Clear old incompatible data (old text keys that don't map to new UUIDs)
DELETE FROM public.module_tag_assignments;

-- Change column type from text to uuid
ALTER TABLE public.module_tag_assignments 
  ALTER COLUMN module_id TYPE uuid USING module_id::uuid;

-- Add new FK to system_modules
ALTER TABLE public.module_tag_assignments 
  ADD CONSTRAINT module_tag_assignments_module_id_fkey 
  FOREIGN KEY (module_id) REFERENCES public.system_modules(id) ON DELETE CASCADE;
