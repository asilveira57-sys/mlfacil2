
-- =============================================
-- Widget Bloco de Notas - Migration
-- =============================================

-- 1. Table: notes
CREATE TABLE public.notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid NULL,
  created_by_user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  content_rich jsonb,
  content_plain text DEFAULT '',
  color_hex text DEFAULT '#FBBF24',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Validation trigger for status instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_note_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'Invalid note status: %. Must be active or archived.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_note_status
  BEFORE INSERT OR UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.validate_note_status();

-- Auto-update updated_at
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for listing
CREATE INDEX idx_notes_workspace_company_updated 
  ON public.notes (workspace_id, company_id, updated_at DESC);

-- RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace notes"
  ON public.notes FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Editors can insert notes"
  ON public.notes FOR INSERT
  WITH CHECK (public.can_edit_tasks(auth.uid(), workspace_id) AND created_by_user_id = auth.uid());

CREATE POLICY "Editors can update notes"
  ON public.notes FOR UPDATE
  USING (public.can_edit_tasks(auth.uid(), workspace_id));

CREATE POLICY "Editors can delete notes"
  ON public.notes FOR DELETE
  USING (public.can_edit_tasks(auth.uid(), workspace_id));

-- 2. Table: note_attachments
CREATE TABLE public.note_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text,
  mime_type text,
  file_size integer,
  width integer,
  height integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_note_attachments_note_id ON public.note_attachments (note_id);

ALTER TABLE public.note_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view note attachments"
  ON public.note_attachments FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Editors can insert note attachments"
  ON public.note_attachments FOR INSERT
  WITH CHECK (public.can_edit_tasks(auth.uid(), workspace_id));

CREATE POLICY "Editors can delete note attachments"
  ON public.note_attachments FOR DELETE
  USING (public.can_edit_tasks(auth.uid(), workspace_id));

-- 3. Table: note_pins
CREATE TABLE public.note_pins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid NULL,
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  route_path text,
  entity_type text,
  entity_id text,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_note_pin_module UNIQUE (note_id, module_key, company_id)
);

CREATE INDEX idx_note_pins_module ON public.note_pins (workspace_id, module_key, company_id);

ALTER TABLE public.note_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view note pins"
  ON public.note_pins FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Editors can insert note pins"
  ON public.note_pins FOR INSERT
  WITH CHECK (public.can_edit_tasks(auth.uid(), workspace_id) AND created_by_user_id = auth.uid());

CREATE POLICY "Editors can delete note pins"
  ON public.note_pins FOR DELETE
  USING (public.can_edit_tasks(auth.uid(), workspace_id));

-- 4. Table: note_events
CREATE TABLE public.note_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload_json jsonb,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_note_events_note ON public.note_events (note_id, created_at DESC);

ALTER TABLE public.note_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view note events"
  ON public.note_events FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Editors can insert note events"
  ON public.note_events FOR INSERT
  WITH CHECK (public.can_edit_tasks(auth.uid(), workspace_id) AND created_by_user_id = auth.uid());

-- 5. Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('note-attachments', 'note-attachments', false);

CREATE POLICY "Members can view note attachment files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'note-attachments');

CREATE POLICY "Authenticated users can upload note attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'note-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own note attachments"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'note-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete note attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'note-attachments' AND auth.role() = 'authenticated');
