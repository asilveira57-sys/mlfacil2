Remoção total do Sandbox para aliviar o backend imediatamente.

Status até agora (já feito):
- Removidos os arquivos: `src/pages/Sandbox.tsx`, `src/components/sandbox/`, `src/hooks/useSandboxSnapshots.ts`, `src/hooks/useOperationalQuickSync.ts`.
- Removidas as edge functions do backend: `sandbox-snapshot-refresh` e `operational-quick-sync` (essas duas eram as principais responsáveis pela tempestade de chamadas a cada 30s por aba aberta).

Falta aplicar (precisa aprovar este plano para eu editar os arquivos):

1. `src/App.tsx`
   - Remover a linha do `lazyRetry` que importa `./pages/Sandbox` (linha 129).
   - Remover a rota `<Route path="/sandbox" element={<Sandbox />} />` (linha 315).

2. `src/pages/admin/AdminAuditLogs.tsx`
   - Remover as chaves `operational_quick_sync` e `sandbox` do mapa `AREA_LABELS` (linhas 44 e 46), pois as áreas não existem mais.

3. Sem migração de banco
   - Não vou mexer na tabela `sandbox_company_snapshot` agora — apenas paro de chamá-la. Você pode dropar à noite quando quiser, sem risco para o sistema em produção.
   - O item `sandbox` em `AdminErpIntegrations` é "ambiente sandbox de ERP" (não tem relação com a página Sandbox); fica como está.

4. Verificação pós-edição
   - Confirmar que o app compila sem o `Sandbox`.
   - Conferir se Dashboard, Conversor ZPL e demais telas voltaram a responder normal.

Por que isso resolve agora:
- O hook `useOperationalQuickSync` disparava `operational-quick-sync` a cada 30 segundos para cada aba do Sandbox aberta. Cada execução fazia upserts em `hot_orders_queue`, varreduras em `meli_orders_cache` e `meli_shipments_cache`, e ainda chamava `sandbox-snapshot-refresh`. Multiplicado pelos clientes simultâneos, isso era o principal vetor de saturação. Removendo, o banco respira.

Pode aprovar para eu aplicar as edições restantes.

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>