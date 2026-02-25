
-- Table: system_status_services
CREATE TABLE public.system_status_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'operational' CHECK (status IN ('operational', 'unstable', 'down')),
  message TEXT,
  last_checked TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_status_services ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can view system status services"
  ON public.system_status_services FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can insert system status services"
  ON public.system_status_services FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update system status services"
  ON public.system_status_services FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete system status services"
  ON public.system_status_services FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger updated_at
CREATE TRIGGER update_system_status_services_updated_at
  BEFORE UPDATE ON public.system_status_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table: incidents_log
CREATE TABLE public.incidents_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID NOT NULL REFERENCES public.system_status_services(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT 'Incidente detectado automaticamente.',
  status TEXT NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating', 'resolved')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.incidents_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view incidents"
  ON public.incidents_log FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert incidents"
  ON public.incidents_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update incidents"
  ON public.incidents_log FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete incidents"
  ON public.incidents_log FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Table: system_status_logs
CREATE TABLE public.system_status_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID NOT NULL REFERENCES public.system_status_services(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_status_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view status logs"
  ON public.system_status_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert status logs"
  ON public.system_status_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger: auto-create incident when service goes down, auto-resolve when back to operational
CREATE OR REPLACE FUNCTION public.handle_service_status_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  -- Update last_checked
  NEW.last_checked := now();
  
  -- If status changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Log the change
    INSERT INTO public.system_status_logs (service_id, previous_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
    
    -- If changed to down, auto-create incident
    IF NEW.status = 'down' THEN
      INSERT INTO public.incidents_log (service_id, description, status, started_at)
      VALUES (NEW.id, 'Interrupção detectada no serviço: ' || NEW.service_name, 'investigating', now());
    END IF;
    
    -- If changed back to operational, resolve open incidents
    IF NEW.status = 'operational' AND OLD.status IN ('down', 'unstable') THEN
      UPDATE public.incidents_log
      SET status = 'resolved', resolved_at = now()
      WHERE service_id = NEW.id AND status = 'investigating';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_service_status_change
  BEFORE UPDATE ON public.system_status_services
  FOR EACH ROW EXECUTE FUNCTION public.handle_service_status_change();

-- Seed initial services
INSERT INTO public.system_status_services (service_name, status) VALUES
  ('API Mercado Livre', 'operational'),
  ('Worker de Sincronização', 'operational'),
  ('Importação de Vendas', 'operational'),
  ('Dashboard', 'operational'),
  ('Extensão', 'operational'),
  ('Banco de Dados', 'operational'),
  ('Sistema de Notificações', 'operational');
