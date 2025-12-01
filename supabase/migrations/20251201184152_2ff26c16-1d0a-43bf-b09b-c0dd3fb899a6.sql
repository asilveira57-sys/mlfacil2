-- Políticas RLS para Profiles
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Políticas RLS para ML Accounts
CREATE POLICY ml_accounts_all ON public.ml_accounts FOR ALL USING (auth.uid() = user_id);

-- Políticas RLS para Analyzed Items
CREATE POLICY analyzed_items_all ON public.analyzed_items FOR ALL USING (auth.uid() = user_id);

-- Políticas RLS para Item Metrics
CREATE POLICY item_metrics_select ON public.item_metrics FOR SELECT 
USING (EXISTS (SELECT 1 FROM analyzed_items WHERE analyzed_items.id = item_metrics.analyzed_item_id AND analyzed_items.user_id = auth.uid()));

CREATE POLICY item_metrics_insert ON public.item_metrics FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM analyzed_items WHERE analyzed_items.id = item_metrics.analyzed_item_id AND analyzed_items.user_id = auth.uid()));

-- Políticas RLS para Keywords Tracking
CREATE POLICY keywords_all ON public.keywords_tracking FOR ALL 
USING (EXISTS (SELECT 1 FROM analyzed_items WHERE analyzed_items.id = keywords_tracking.analyzed_item_id AND analyzed_items.user_id = auth.uid()));