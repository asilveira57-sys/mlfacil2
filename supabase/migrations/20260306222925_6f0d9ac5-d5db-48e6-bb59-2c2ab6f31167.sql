INSERT INTO public.retrospective_rules (name, period_days, retrospective_type, applies_to_scope, is_active, auto_generate, auto_send)
VALUES ('Resumo Trial 14 dias', 14, 'trial_summary', 'company', true, true, true)
ON CONFLICT DO NOTHING;