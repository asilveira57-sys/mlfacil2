-- Função para incrementar uso do voucher
CREATE OR REPLACE FUNCTION public.increment_voucher_usage(voucher_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.vouchers 
  SET current_uses = current_uses + 1 
  WHERE id = voucher_id;
END;
$$;