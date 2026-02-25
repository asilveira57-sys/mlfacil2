
-- =============================================
-- CONTACT MESSAGES
-- =============================================
CREATE TABLE public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'low' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'answered')),
  source TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Public: anyone can INSERT (submit contact form)
CREATE POLICY "Anyone can submit contact form"
  ON public.contact_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read
CREATE POLICY "Admins can read contact messages"
  ON public.contact_messages FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can update
CREATE POLICY "Admins can update contact messages"
  ON public.contact_messages FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- CONTACT LOGS
-- =============================================
CREATE TABLE public.contact_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contact_messages(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs
CREATE POLICY "Admins can read contact logs"
  ON public.contact_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow insert for logging (system-level via trigger)
CREATE POLICY "Allow insert contact logs"
  ON public.contact_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- =============================================
-- AUTO PRIORITY TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.set_contact_priority()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.priority := CASE NEW.subject
    WHEN 'Reclamação' THEN 'urgent'
    WHEN 'Consultoria' THEN 'high'
    WHEN 'Suporte técnico' THEN 'high'
    WHEN 'Imprensa / Reportagem' THEN 'high'
    WHEN 'Parceria' THEN 'medium'
    ELSE 'low'
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contact_priority
  BEFORE INSERT ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_contact_priority();

-- =============================================
-- AUTO LOG ON INSERT
-- =============================================
CREATE OR REPLACE FUNCTION public.log_contact_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.contact_logs (contact_id, action, performed_by)
  VALUES (NEW.id, 'created', NULL);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contact_log_created
  AFTER INSERT ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.log_contact_created();

-- =============================================
-- AUTO LOG ON STATUS CHANGE
-- =============================================
CREATE OR REPLACE FUNCTION public.log_contact_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.contact_logs (contact_id, action, performed_by)
    VALUES (NEW.id, 'status_changed', auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contact_log_status
  AFTER UPDATE ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.log_contact_status_change();
