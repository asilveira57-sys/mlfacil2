UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{email}', '"suporte_ti@interfood.com.br"'),
    updated_at = now()
WHERE user_id = 'd0714efa-0cab-4ad1-8d2d-5a7adca4f99c'
  AND provider = 'email';