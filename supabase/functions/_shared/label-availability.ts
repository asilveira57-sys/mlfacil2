// Fonte ÚNICA da regra de "o vendedor pode imprimir esta etiqueta?".
//
// Esta regra já esteve duplicada em três edge functions com valores
// diferentes, e as duas cópias desatualizadas (as que rodam por cron)
// sobrescreviam a correta a cada 30 minutos. Em 21/11/2026 isso fez
// 286 envios sumirem da tela de etiquetas em 12 contas de clientes.
//
// Se precisar mudar a regra, mude AQUI e só aqui.

/** Substatus do ML em que o vendedor pode/deve imprimir a etiqueta. */
export const SELLER_PRINTABLE_SUBSTATUSES = [
  'ready_to_print',
  'printed',
  'ready_for_pickup',   // Mercado Envios Coleta: pronto para coleta, imprime sim
  'in_packing_list',    // já em lista de coleta, a etiqueta continua válida
] as const;

/** Logísticas em que quem envia é o ML — o vendedor não imprime nada. */
export const FULL_LOGISTIC_TYPES = ['fulfillment'] as const;

/**
 * Decide se a etiqueta está disponível para o vendedor.
 * cross_docking e xd_drop_off NÃO são excluídos: eles imprimem normalmente.
 */
export function isLabelAvailable(
  substatus: string | null | undefined,
  logisticType: string | null | undefined,
): boolean {
  const isFull = FULL_LOGISTIC_TYPES.includes((logisticType ?? '') as any);
  const isPrintable = SELLER_PRINTABLE_SUBSTATUSES.includes((substatus ?? '') as any);
  return isPrintable && !isFull;
}
