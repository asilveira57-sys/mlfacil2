-- Permitir novos status do sistema de fila (processando/parcial/concluido)
ALTER TABLE public.meli_print_queue
DROP CONSTRAINT IF EXISTS meli_print_queue_status_check;

ALTER TABLE public.meli_print_queue
ADD CONSTRAINT meli_print_queue_status_check
CHECK (
  status = ANY (
    ARRAY[
      'gerada'::text,
      'erro'::text,
      'processando'::text,
      'parcial'::text,
      'concluido'::text
    ]
  )
);