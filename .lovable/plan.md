Plano emergencial para tentar liberar espaço sem aumentar a instância

Diagnóstico agora
- O teste direto no banco ainda falhou com timeout de conexão.
- As requisições de autenticação no navegador também estão falhando com “Failed to fetch”.
- Isso indica que o backend/banco ainda não está aceitando conexões. Enquanto estiver assim, uma limpeza por DELETE também não consegue rodar.

O que vou fazer assim que você aprovar
1. Confirmar se o banco voltou a responder
   - Rodar uma consulta simples de saúde.
   - Se ainda estiver em timeout, eu vou informar que a limpeza ainda não é executável e que o gargalo atual é a instância em manutenção/indisponível, não a aplicação.

2. Medir onde está o volume antes de apagar
   - Conferir tamanho aproximado e quantidade de registros nas tabelas de cache mais prováveis:
     - vendas/pedidos: `meli_orders_cache`
     - envios/etiquetas/fretes: `meli_shipments_cache` e caches relacionados, se existirem
     - logs/sincronizações volumosos, se existirem
   - Prioridade: identificar o que dá mais retorno de espaço com menor risco operacional.

3. Executar limpeza segura de vendas antigas
   - Apagar vendas com mais de 30 dias dos caches de vendas, começando pelas contas Deconex/suas contas se for possível identificar com segurança no banco.
   - Se a identificação da Deconex não estiver inequívoca, aplicar a limpeza geral em cache antigo de vendas com mais de 30 dias, porque são dados reimportáveis/sincronizáveis.
   - Evitar mexer em dados críticos de usuários, pagamentos, planos, autenticação, configurações, auditoria principal ou integrações.

4. Limpar caches relacionados antigos
   - Remover registros antigos dependentes/relacionados que ocupem espaço e sejam reconstituíveis, como cache de shipment/frete/logística antigo, respeitando dependências para não quebrar tela de etiquetas recentes.
   - Manter dados dos últimos 30 dias para preservar o funcionamento operacional imediato da conversão/etiquetas.

5. Forçar recuperação de espaço de forma compatível com produção
   - Após DELETE, analisar a possibilidade de `VACUUM`/limpeza interna leve.
   - Evitar operações pesadas tipo `VACUUM FULL` em horário de uso, porque podem travar tabelas. Se necessário, deixar isso para noite/final de semana.

6. Validar abertura do sistema
   - Testar login/consulta básica.
   - Conferir se a tela de autenticação e a rota de etiqueta param de ficar carregando indefinidamente.
   - Se o backend continuar recusando conexão mesmo depois da limpeza possível, apontar o próximo bloqueio real.

Critério de segurança
- A limpeza será feita apenas em caches/dados reconstituíveis e antigos.
- Não vou apagar usuários, assinaturas, integrações, tokens, configurações de conta, planos, notas fiscais recentes, histórico recente de etiquetas ou permissões.

Observação importante
- Eu concordo com sua ideia: limpar vendas com mais de 30 dias é uma alternativa melhor do que aumentar a instância, desde que o banco já esteja aceitando conexão.
- Se o banco ainda estiver em timeout, não existe comando de limpeza que consiga rodar naquele momento; a primeira ação é aguardar ele voltar a responder e então executar a limpeza imediatamente.