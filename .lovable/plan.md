

## Plano: Adicionar tag Flex/Coleta na tabela de envios

### O que muda

No `src/components/shipping/ShippingTable.tsx`, adicionar um badge ao lado do status (ou na coluna de prazo) indicando o tipo logístico:

- **Flex** → badge amarelo/laranja "Flex" (quando `logistic_type` contém `"self_service"` ou similar valor Flex do ML)
- **Coleta** → badge azul "Coleta" (demais tipos como `"xd_drop_off"`, `"cross_docking"`, etc.)

O campo `logistic_type` já existe no `ShippingOrder` e já vem do banco. Nenhuma alteração de banco necessária.

### Arquivo alterado

| Arquivo | Mudança |
|---|---|
| `src/components/shipping/ShippingTable.tsx` | Adicionar badge Flex/Coleta ao lado do status ou na coluna de prazo, usando `order.logistic_type` |

### Mapeamento de tipos

- `self_service` → **Flex**
- `fulfillment` → **Full**  
- Todos os demais (`xd_drop_off`, `cross_docking`, `drop_off`, etc.) → **Coleta**

