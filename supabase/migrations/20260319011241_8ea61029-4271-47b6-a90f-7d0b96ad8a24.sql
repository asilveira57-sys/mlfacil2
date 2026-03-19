drop policy if exists "Users can delete own security events" on public.security_events;

create policy "Users can delete own security events"
on public.security_events
for delete
to authenticated
using (auth.uid() = user_id);