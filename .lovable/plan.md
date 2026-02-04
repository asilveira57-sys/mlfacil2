
# Plano: Corrigir exibição da Linha do Tempo

## Diagnóstico

Após análise técnica detalhada, identifiquei que o problema **não é limite ou erro de API do Mercado Livre**. 

O recálculo foi bem-sucedido e inseriu 774 registros na tabela `ad_timeline_stats` com:
- `workspace_id = 433a4292-92c0-4ced-9c29-f1199f990d9a` (seu user_id)
- `ml_account_id = 997e5eb2-8abd-4a08-9c17-977acbce7cc1` (conta ADECONEXVV)

Porém as **políticas de segurança (RLS)** da tabela estão bloqueando a leitura.

## Causa Raiz

As políticas RLS atuais validam acesso assim:
```sql
workspace_id IN (
  SELECT w.id 
  FROM workspaces w JOIN workspace_members wm ON ...
  WHERE wm.user_id = auth.uid()
)
```

Mas o sistema está usando `user_id` como `workspace_id` diretamente. Como não existe um registro `workspaces` com `id = seu_user_id`, a política bloqueia a leitura.

## Correção Proposta

Atualizar as políticas RLS para o padrão híbrido que suporta ambos os casos:

```text
workspace_id = auth.uid() 
OR 
workspace_id IN (SELECT ... FROM workspace_members WHERE user_id = auth.uid())
```

Isso permitirá:
1. Acesso direto quando `workspace_id = user_id` (caso atual)
2. Acesso via membership em workspaces compartilhados (caso futuro)

## Alterações

### 1. Migração SQL (criação)
Arquivo: Nova migração para ajustar políticas

- DROP das 3 políticas atuais (SELECT, INSERT, UPDATE)
- CREATE de novas políticas com condição híbrida

### 2. Arquivos de Código
Nenhuma alteração necessária no frontend ou Edge Function. A lógica atual está correta.

## Resultado Esperado

Após aplicar a migração:
- Os 774 anúncios serão exibidos na tabela
- Os cards de status (120D: 198, NO_SALES: 576) mostrarão as contagens corretas
- Futuras sincronizações funcionarão normalmente

## Impacto

- Baixo risco: apenas ajuste de políticas de segurança
- Sem downtime: a migração é atômica
- Dados preservados: nenhum dado será alterado ou perdido
