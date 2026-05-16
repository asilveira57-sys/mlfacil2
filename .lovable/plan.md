## O que muda em cada rota

### `/shipping-labels` (Etiquetas de Envio) — VAI MUDAR
Hoje usa o pipeline antigo (`useShippingLabels` + edge `ml-generate-labels`), que é o que quebra páginas e gera “22 de 24” sem aviso.

Vai passar a usar o mesmo motor que o Label Teste já usa hoje:
- geração via dispatcher `ml-generate-labels-labeltest` (PDF assíncrono em fila + ZPL inline);
- distribuição segura por envio com fallback per-shipment quando o lote falha;
- histórico em `meli_print_queue_v2`;
- recuperação de job travado com banner “Retomar verificação”;
- mensagens claras de falha parcial: “22 geradas, 2 falharam, envios X e Y, motivo Z”.

A rota, o nome da tela (“Etiquetas de Envio”) e a navegação continuam iguais. Filtros, seleção, tabela, paginação, drawer de detalhes e tela de configuração de cabeçalho são preservados.

### `/label-teste` (Label Teste V2) — NÃO MUDA
Permanece exatamente como está hoje: mesma rota, mesma página, badge “TESTE V2”, mesmo histórico, mesmo fluxo. Continua disponível para seus testes.

Os dois passam a usar o mesmo motor por baixo, mas continuam sendo páginas separadas.

### Sandbox — SAI DO MENU
A entrada `Sandbox` (`/sandbox`) está cadastrada em `system_modules` como módulo ativo. Vou desativá-la via migração para sumir do menu. A tabela `sandbox_company_snapshot` e dados antigos não são apagados.

## Como vou aplicar

### 1. Trocar o motor da página `/shipping-labels`
Em `src/pages/ShippingLabels.tsx`:
- substituir o hook `useShippingLabels` por `useShippingLabelsV2`;
- adotar `BulkActionsBarV2` no lugar do `BulkActionsBar` antigo;
- adicionar o banner de “Verificação pausada / Retomar verificação” (igual ao Label Teste);
- adicionar um botão “Histórico” opcional usando `PrintHistoryV2`;
- preservar título “Etiquetas de Envio”, atalho de configurações de cabeçalho e guard de elegibilidade.

`useShippingLabelsV2` já:
- usa cache local primeiro (não fica fazendo sync pesado toda vez que entra);
- bloqueia sync concorrente enquanto há job de geração ativo;
- faz polling do job e recupera após navegação/reload;
- registra erros por envio no histórico.

### 2. Polir feedback de erro parcial
Em `src/components/shipping-v2/BulkActionsBarV2.tsx` e nas chamadas de toast do hook V2:
- separar visualmente “geradas” x “falharam”;
- mostrar até 5 IDs com falha e motivo curto;
- evitar mensagem genérica quando a falha é parcial.

Em `src/components/shipping-v2/PrintHistoryV2.tsx`:
- expor motivos por envio do `per_shipment_log` para suporte ver depois.

### 3. Não tocar no Label Teste
`src/pages/LabelTeste.tsx`, `useShippingLabelsV2` e edges `ml-generate-labels-labeltest*` continuam como hoje. Só vão receber os mesmos ajustes de feedback citados acima, porque são componentes compartilhados — o comportamento da página de teste continua igual.

### 4. Manter o motor antigo desativado, sem apagar
- `useShippingLabels` e `ml-generate-labels` permanecem no projeto, mas a tela oficial deixa de chamá-los.
- Isso garante rollback rápido se aparecer qualquer regressão na segunda-feira.

### 5. Remover Sandbox do menu
Migração simples desativando o módulo:

```text
UPDATE system_modules
SET is_active = false, status = 'hidden'
WHERE key = 'sistema.sandbox';
```

Resultado:
- some do menu;
- não gera mais 404 acidental;
- dados históricos preservados.

## Resultado esperado

- `/shipping-labels` para de quebrar páginas e passa a relatar falhas por envio quando elas acontecerem.
- `/label-teste` continua funcionando exatamente como hoje, para você comparar.
- Sandbox some do menu sem efeito colateral.
- Sem perda de rota, sem perda de histórico, sem mexer no fluxo do Label Teste.