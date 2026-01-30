
Objetivo
- Reduzir o atrito de “falhou → preciso achar o anúncio de novo” adicionando, dentro da Central de Ações (/anuncios/acoes), um fluxo de:
  1) ver detalhes do que foi cadastrado (link/ID, checklist, motivo, payload/erro)
  2) editar rapidamente
  3) reenviar/tentar de novo sem refazer o processo inteiro

Contexto atual (o que existe hoje)
- A tela “Central de Ações” (src/pages/AdActionsCenter.tsx) lista ações por status:
  - Rascunhos: DRAFT (tem “Executar” e “Cancelar”)
  - Concluídas: SUCCESS/FAILED/CANCELLED (mostra só um trecho do erro em FAILED; não dá para repetir/editar)
- A execução (hook useExecuteAction) chama a função de backend “ad-action-execute”.
  - Essa função só executa ações em DRAFT ou QUEUED. Ou seja: FAILED não pode ser “executado de novo” direto, precisa voltar a DRAFT ou virar um novo rascunho.
- “Clonar por Link” (src/components/ad-timeline/CloneByLinkDialog.tsx) cria o rascunho, mas hoje não salva o link original no banco (apenas o item_id extraído).

Proposta de solução (UX/Produto)
1) Adicionar “Detalhes / Editar / Tentar novamente” na Central de Ações
- Em cada linha (principalmente em Concluídas → FAILED), adicionar ações claras:
  - Ver detalhes (abre um modal/drawer com tudo o que foi cadastrado + erro completo)
  - Tentar novamente (cria um novo rascunho copiando as configs, sem precisar buscar o anúncio novamente)
  - Editar e criar novo rascunho (permite ajustar link/ID e checklist antes de reenviar)
- Para DRAFT, também adicionar “Editar” (para você ajustar o checklist ou corrigir o link/ID antes de executar).

2) Mostrar o erro completo (não só o trecho)
- No “Ver detalhes”, exibir:
  - Mensagem principal de erro
  - Campos técnicos, quando existirem: error code, api_error, payload_sent, etc.
  - Botão “Copiar diagnóstico” (copia JSON do result/checklist/IDs para facilitar suporte e debug)
- Opcional: na tabela, manter o trecho curto, mas com um botão/ícone “Ver” para abrir o detalhe.

3) Salvar o link original (para não precisar procurar de novo)
- Sem mexer no schema agora: salvar o link original dentro do JSON “checklist” (que já é um jsonb).
  - Ex: checklist.source_url = "<link colado>"
  - Ex: checklist.source_label = "manual_link"
- Benefícios:
  - O detalhe consegue mostrar exatamente o que você colou
  - O “Editar” já abre com o link preenchido
  - O “Tentar novamente” consegue reaproveitar o link

Decisões importantes (comportamento de “retry”)
- Vou implementar dois modos (para você não perder histórico e também ter praticidade):
  A) “Tentar novamente” (recomendado): DUPLICA a ação como um novo rascunho (novo registro em ad_lifecycle_actions)
     - Vantagem: preserva o registro de falha anterior intacto
  B) “Reabrir como rascunho” (opcional): altera a mesma ação FAILED → DRAFT e limpa result/source_snapshot
     - Vantagem: não “polui” a lista com cópias
     - Desvantagem: sobrescreve o último resultado no registro (perde o “estado final” do item, embora eventos possam existir em outras tabelas)
- Se você preferir só um dos modos, eu deixo apenas o escolhido.

Arquitetura (como fica o fluxo)
- Central de Ações:
  - FAILED → “Editar e reenviar”
    - abre modal com dados pré-carregados
    - ao salvar: cria novo registro DRAFT com as novas configs
    - opcional: já te leva para aba “Rascunhos” e destaca o novo rascunho
- DRAFT → “Editar” (update do registro atual) ou “Executar”
- “Clonar por Link” passa a gravar também checklist.source_url

Implementação (o que será alterado no código)
1) Criar um componente de edição/detalhes para ações
- Novo componente (exemplo de caminho): src/components/ad-actions/ActionDetailsDialog.tsx
  - Responsabilidades:
    - Receber um AdLifecycleAction
    - Mostrar:
      - item_id, action_type, status, reason, updated_at
      - checklist (UI amigável para os booleans; e exibir source_url quando existir)
      - result (erro completo com formatação)
    - Permitir edição:
      - Campo “Link do anúncio” (ou “ID do anúncio”), com a mesma lógica de extração/normalização de IDs do CloneByLinkDialog
      - Checklist de clonagem (se action_type === CLONE)
      - Motivo (reason)
    - Botões:
      - “Salvar” (se status = DRAFT → update no mesmo registro)
      - “Criar novo rascunho” (sempre disponível; duplica com as alterações)
      - (Opcional) “Reabrir como rascunho” (se status = FAILED/CANCELLED → update status para DRAFT e limpar result)

2) Central de Ações (src/pages/AdActionsCenter.tsx)
- Ajustar a coluna “Ações”:
  - DRAFT: Executar + Editar + Cancelar
  - FAILED: Ver detalhes + Editar e reenviar (abre modal já no modo “novo rascunho”) + (opcional) Reabrir
  - SUCCESS: Ver detalhes + (manter “Ver novo anúncio” quando existir)
- Melhorar a visualização do erro:
  - Trocar o texto truncado por:
    - “Falhou” + botão “Ver” para abrir o modal (onde o erro aparece completo)

3) Reaproveitar a lógica de extrair ID do link
- Extrair a função extractItemId (regex) para um util compartilhado (exemplo):
  - src/lib/meli/extractMeliId.ts
- Usar esse util em:
  - CloneByLinkDialog
  - ActionDetailsDialog (editar/retry)

4) Persistir o link original no checklist (CloneByLinkDialog.tsx)
- No momento do insert do rascunho, incluir:
  - checklist.source_url = link (string)
  - checklist.source = 'manual_link' (já existe)
- Assim, na Central de Ações você sempre consegue “ver o que foi colado” e editar.

5) Hooks/mutações (sem mexer em backend)
- Adicionar no hook useAdTimeline.ts (ou criar hooks específicos) mutações para:
  - updateAction (update de DRAFT: item_id, reason, checklist, updated_at)
  - duplicateAction (insert copiando workspace_id, ml_account_id, action_type; com item_id/checklist/reason editados)
  - reopenAction (opcional) (update action_status para DRAFT + limpar result/source_snapshot)
- Todos invalidando a query ['ad-lifecycle-actions'] para atualizar a tabela.

Edge cases e cuidados
- Ações não-CLONE:
  - O modal deve esconder checklist de clonagem e só mostrar campos relevantes (reason / item_id).
- “ml_account_id”:
  - Ao duplicar, copiar o mesmo ml_account_id do registro para não exigir que você selecione a conta novamente.
- Segurança/RLS:
  - Já existe update (cancelar) hoje, então o update/insert seguirá o mesmo padrão e deve respeitar o workspace atual.
- ID vs link:
  - O campo principal no modal será “Link do anúncio” (mais amigável), mas sempre exibindo o “ID detectado”.
  - Permitir também colar diretamente um ID.
- UX:
  - Após criar o novo rascunho a partir de FAILED, automaticamente:
    - mudar para aba “Rascunhos”
    - mostrar toast “Novo rascunho criado”
    - (se possível) rolar/realçar o item recém-criado

Plano de testes (end-to-end)
1) Criar rascunho via “Clonar por Link” e validar que:
   - aparece em Rascunhos
   - o detalhe mostra também o link original (source_url)
2) Executar um rascunho e forçar falha (ex: item que hoje dá erro)
   - aparece em Concluídas como FAILED
   - “Ver detalhes” mostra erro completo + JSON copiável
3) Em FAILED → “Editar e reenviar”
   - abrir modal com dados pré-preenchidos
   - alterar link/ID/checklist
   - criar novo rascunho
   - executar e validar que o fluxo não exige refazer todo o processo
4) Testar também em mobile (layout do modal/drawer e botões na tabela).

Sugestões de próximos passos (após isso)
1) Testar o fluxo completo de “falhou → editar → reenviar” ponta a ponta na Central de Ações (incluindo mobile).
2) Adicionar busca/filtro na Central de Ações (por item_id, motivo, status) para achar rapidamente ações antigas.
3) Criar um “Histórico de tentativas” por ação (encadear retries) com um campo parent_action_id (exige ajuste no schema).
4) Melhorar “diagnóstico guiado”: quando o erro for “token desconectado”, exibir botão “Reconectar conta” diretamente no detalhe.
5) Exibir título/thumbnail do anúncio (quando existir no cache) na lista da Central de Ações para facilitar identificação.
