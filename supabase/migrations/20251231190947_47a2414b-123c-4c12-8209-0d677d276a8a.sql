-- Add INSERT and UPDATE policies for cep_cache to allow edge functions to populate it
CREATE POLICY "cep_cache_insert_authenticated" 
ON public.cep_cache 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "cep_cache_update_authenticated" 
ON public.cep_cache 
FOR UPDATE 
USING (true);