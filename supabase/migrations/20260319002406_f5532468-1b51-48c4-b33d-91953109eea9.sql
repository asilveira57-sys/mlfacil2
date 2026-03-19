DELETE FROM config_menu_items WHERE id IN (
  -- Children
  '5de8f8a7-6c80-47a5-baf5-d1f8114509b7', -- Nome da Empresa
  'db26864a-5591-45f2-9a4a-794a10ccb633', -- Logotipo
  'd802b5d8-bee0-4597-ad6e-982538aec9eb', -- Cores
  '6536642f-26b2-4267-b764-ad9e4d0b7e47', -- Tema Claro/Escuro
  '209f7aa2-92e0-40f4-9f5b-d298e0a5f144', -- Consentimentos
  'b99636b3-c9c7-4c6c-8cbb-21e6e4834b94', -- Exportação de Dados
  '6f03ef2f-880e-4cdd-8cd0-4b7bf97c2757', -- Chaves de API
  'd329f878-d50c-4e72-86b2-c3dcd2b685ba', -- Webhooks
  '72aab302-e585-4e53-8ffa-107e660e375e', -- Logs
  -- Parents
  'f40a4212-fc29-4194-805c-99d9c2f22aba', -- Personalização
  'be735275-8efb-4298-b7f9-ad665a3cb1a6', -- Aparência
  '553e3802-551b-4a4d-be04-288b81fd8962', -- Privacidade e LGPD
  '85ea1fc4-08f9-4826-9dce-af3873d181be'  -- Utilidades
);