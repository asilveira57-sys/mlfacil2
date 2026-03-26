
## Plano de correção definitiva (Canal Oficial) — retroativo + segmentação por seller

### Diagnóstico confirmado (raiz do problema)
1. **Há anúncios antigos ativos no banco** (inclusive o do robô e “Teste plataforma”), por isso continuam aparecendo.
2. O hook `useAnnouncements` está buscando seller em **`marketplace_accounts`** (tabela vazia no projeto), então o seller ativo fica `null`.
3. O corte temporal hoje usa **data de criação do usuário** (`profiles.created_at`), mas a regra correta é por **entrada do seller** (conta ML ativa).
4. `target_seller_id` está como **UUID**, porém o seller do ML é string (`ml_user_id`), causando inconsistência na segmentação.

---

### O que vou implementar

#### 1) Ajuste de dados e schema (migração)
- Alterar `mktpfacil_announcements.target_seller_id` de **UUID → TEXT**.
- Criar índice para filtro por `target_seller_id`.
- Executar limpeza de legado:
  - desativar anúncios antigos de teste/robô já existentes (os que estão causando o problema agora).
- Adicionar validação no banco: comunicado automático do robô sem `target_seller_id` não pode ser salvo.

#### 2) Correção do emissor do robô (promoções)
Arquivo: `supabase/functions/promotion-agent-run/index.ts`
- Remover lookup morto de `marketplace_accounts`.
- Garantir insert com `target_seller_id = seller_id` (ML user id em texto).
- Garantir `published_at` explícito e log de erro detalhado se falhar insert.

#### 3) Correção do filtro no Canal Oficial (frontend)
Arquivo: `src/hooks/useOfficialChannel.ts`
- Trocar fonte da conta ativa:
  - de `marketplace_accounts` para **`ml_accounts`** (id ativo do `user_context`).
- Regra nova de visibilidade:
  - **Segmentado** (`target_seller_id`): só aparece se `target_seller_id === ml_user_id` da conta ativa.
  - **Global** (sem target): só aparece se `published_at >= ml_accounts.created_at` da conta ativa.
- Fallback seguro:
  - se não houver conta ativa válida, não exibir comunicado global retroativo (fail-closed).
- Manter filtro de expiração (`expires_at`).

#### 4) Verificação end-to-end obrigatória
- Cenário A: seller novo (conta criada hoje) **não** vê mensagens antigas.
- Cenário B: comunicado do robô para seller X **não** aparece para seller Y.
- Cenário C: comunicado novo global aparece apenas para sellers cuja entrada é anterior/compatível com `published_at`.
- Conferir badge (bolinha vermelha) coerente após os filtros.

---

## Detalhes técnicos
- Arquivos principais:
  - `src/hooks/useOfficialChannel.ts`
  - `supabase/functions/promotion-agent-run/index.ts`
  - nova migração SQL em `supabase/migrations/*`
- Critério de corte temporal passará de `profiles.created_at` para `ml_accounts.created_at` (seller-context).
- A limpeza de legado elimina imediatamente os registros que hoje estão “vazando” para usuários indevidos.

---

### Resultado esperado
- Fim definitivo de mensagem retroativa para seller novo.
- Fim do vazamento global de mensagem do robô.
- Canal Oficial passa a respeitar contexto de seller corretamente, sem spam de notificações antigas.
