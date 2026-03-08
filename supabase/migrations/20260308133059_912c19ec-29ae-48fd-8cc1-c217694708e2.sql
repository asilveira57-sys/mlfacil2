-- Admin RLS policies for support ticket management

-- Admin can read ALL support tickets
CREATE POLICY "Admins can read all tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin can update ALL support tickets (status changes)
CREATE POLICY "Admins can update all tickets"
ON public.support_tickets FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin can read ALL support messages
CREATE POLICY "Admins can read all messages"
ON public.support_messages FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin can INSERT messages on any ticket (replies)
CREATE POLICY "Admins can insert messages on any ticket"
ON public.support_messages FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admin can read ALL support ticket logs
CREATE POLICY "Admins can read all ticket logs"
ON public.support_ticket_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin can insert ticket logs
CREATE POLICY "Admins can insert ticket logs"
ON public.support_ticket_logs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admin can read ALL support attachments
CREATE POLICY "Admins can read all attachments"
ON public.support_attachments FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin can insert notifications for any user (for ticket reply notifications)
CREATE POLICY "Admins can insert notifications for any user"
ON public.app_notifications FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));