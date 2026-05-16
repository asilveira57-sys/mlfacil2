UPDATE public.system_modules
SET is_active = false, status = 'hidden', updated_at = now()
WHERE key = 'sistema.sandbox';