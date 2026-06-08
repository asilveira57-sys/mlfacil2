/**
 * Status mappings for Mercado Livre shipments and invoices
 */

export type Severity = 'success' | 'warning' | 'danger' | 'info' | 'muted';

export interface StatusInfo {
  label: string;
  description: string;
  severity?: Severity;
}

// Shipment status mapping
export const SHIPMENT_STATUS_MAP: Record<string, StatusInfo> = {
  pending: {
    label: 'Aguardando envio',
    description: 'O envio ainda não foi gerado.',
    severity: 'muted',
  },
  ready_to_ship: {
    label: 'Pronto para envio',
    description: 'O pedido já pode ser postado.',
    severity: 'success',
  },
  handling: {
    label: 'Em preparação',
    description: 'Pedido em separação ou embalagem.',
    severity: 'info',
  },
  shipped: {
    label: 'Postado',
    description: 'O pedido já foi enviado.',
    severity: 'info',
  },
  in_transit: {
    label: 'Em transporte',
    description: 'O pedido está a caminho do comprador.',
    severity: 'info',
  },
  delivered: {
    label: 'Entregue',
    description: 'O comprador recebeu o pedido.',
    severity: 'success',
  },
  not_delivered: {
    label: 'Não entregue',
    description: 'Houve tentativa de entrega sem sucesso.',
    severity: 'warning',
  },
  cancelled: {
    label: 'Envio cancelado',
    description: 'O envio foi cancelado.',
    severity: 'danger',
  },
  returned: {
    label: 'Devolvido',
    description: 'O pedido retornou ao vendedor.',
    severity: 'warning',
  },
  lost: {
    label: 'Extraviado',
    description: 'O pedido foi perdido no transporte.',
    severity: 'danger',
  },
  error: {
    label: 'Erro no envio',
    description: 'Ocorreu um erro operacional no envio.',
    severity: 'danger',
  },
};

// Shipment substatus mapping
export const SHIPMENT_SUBSTATUS_MAP: Record<string, StatusInfo> = {
  // Centro de distribuição
  in_warehouse: {
    label: 'No centro de distribuição',
    description: 'O pedido já foi recebido pelo centro de distribuição do Mercado Livre.',
    severity: 'info',
  },
  buffered: {
    label: 'Em triagem',
    description: 'O pedido está em processamento no centro logístico.',
    severity: 'info',
  },
  // Etiqueta
  ready_to_print: {
    label: 'Etiqueta pronta',
    description: 'A etiqueta está pronta para impressão.',
    severity: 'success',
  },
  printed: {
    label: 'Etiqueta impressa',
    description: 'A etiqueta já foi impressa.',
    severity: 'info',
  },
  // Transporte
  picked_up: {
    label: 'Coletado',
    description: 'O pedido foi coletado para transporte.',
    severity: 'info',
  },
  in_transit: {
    label: 'Em transporte',
    description: 'O pedido está a caminho do comprador.',
    severity: 'info',
  },
  out_for_delivery: {
    label: 'Saiu para entrega',
    description: 'O pedido está em rota de entrega.',
    severity: 'success',
  },
  // Atrasos
  delayed: {
    label: 'Atraso no transporte',
    description: 'O pedido teve atraso no fluxo logístico.',
    severity: 'warning',
  },
  stuck: {
    label: 'Parado no transporte',
    description: 'O pedido está sem avanço no rastreio.',
    severity: 'warning',
  },
  // Problemas na entrega
  not_delivered: {
    label: 'Não entregue',
    description: 'Houve tentativa de entrega sem sucesso.',
    severity: 'warning',
  },
  receiver_absent: {
    label: 'Destinatário ausente',
    description: 'Tentativa de entrega sem presença no local.',
    severity: 'warning',
  },
  address_not_found: {
    label: 'Endereço não localizado',
    description: 'A transportadora não conseguiu localizar o endereço.',
    severity: 'warning',
  },
  refused_by_receiver: {
    label: 'Recusado na entrega',
    description: 'O pedido foi recusado no momento da entrega.',
    severity: 'danger',
  },
  // Retirada
  waiting_for_withdrawal: {
    label: 'Aguardando retirada',
    description: 'O pedido está disponível para retirada.',
    severity: 'info',
  },
  withdrawn: {
    label: 'Retirado',
    description: 'O pedido foi retirado.',
    severity: 'success',
  },
  // Devolução
  returned: {
    label: 'Devolvido',
    description: 'O pedido retornou ao vendedor.',
    severity: 'warning',
  },
  returning_to_sender: {
    label: 'Retornando ao vendedor',
    description: 'O pedido está voltando para o vendedor.',
    severity: 'warning',
  },
  // Problemas críticos
  cancelled: {
    label: 'Envio cancelado',
    description: 'O envio foi cancelado.',
    severity: 'danger',
  },
  lost: {
    label: 'Extraviado',
    description: 'O pedido foi perdido no transporte.',
    severity: 'danger',
  },
  damaged: {
    label: 'Avariado',
    description: 'O pedido sofreu avaria no transporte.',
    severity: 'danger',
  },
  error: {
    label: 'Erro no envio',
    description: 'Ocorreu um erro operacional no envio.',
    severity: 'danger',
  },
};

// Fallback for unknown substatuses
export const SHIPMENT_SUBSTATUS_FALLBACK: StatusInfo = {
  label: 'Em processamento',
  description: 'O pedido está em uma etapa logística.',
  severity: 'muted',
};

// Invoice status mapping (based on fiscal_status)
export const INVOICE_STATUS_MAP: Record<string, StatusInfo> = {
  invoice_pending: {
    label: 'Nota fiscal pendente',
    description: 'A nota fiscal ainda não foi informada.',
    severity: 'warning',
  },
  invoice_issued: {
    label: 'Nota fiscal emitida',
    description: 'A nota fiscal foi enviada.',
    severity: 'success',
  },
  invoice_validated: {
    label: 'Nota fiscal validada',
    description: 'A nota fiscal foi validada pelo Mercado Livre.',
    severity: 'success',
  },
  invoice_rejected: {
    label: 'Nota fiscal rejeitada',
    description: 'A nota fiscal possui erro e foi rejeitada.',
    severity: 'danger',
  },
  not_required: {
    label: 'Nota fiscal não exigida',
    description: 'Este pedido não exige nota fiscal.',
    severity: 'muted',
  },
  unknown: {
    label: 'Situação fiscal desconhecida',
    description: 'Não foi possível identificar o status fiscal.',
    severity: 'muted',
  },
};

// Final status for UI display (combines shipment + invoice status)
export interface FinalStatusInfo extends StatusInfo {
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
}

export const FINAL_STATUS_MAP: Record<string, FinalStatusInfo> = {
  para_imprimir: {
    label: 'Para Imprimir',
    description: 'Etiqueta liberada e ainda não impressa.',
    severity: 'success',
    badgeVariant: 'default',
    className: 'bg-green-600 hover:bg-green-700',
  },
  pronta_enviar: {
    label: 'Pronta para Enviar',
    description: 'Etiqueta impressa, aguardando postagem/coleta.',
    severity: 'success',
    badgeVariant: 'default',
    className: 'bg-emerald-600 hover:bg-emerald-700',
  },
  // Compat: registros antigos ainda podem chegar com final_status='pronta'.
  pronta: {
    label: 'Para Imprimir',
    description: 'Pedido pronto para postagem. NF emitida.',
    severity: 'success',
    badgeVariant: 'default',
    className: 'bg-green-600 hover:bg-green-700',
  },
  aguardando_nf: {
    label: 'Aguardando NF',
    description: 'A nota fiscal ainda não foi informada.',
    severity: 'warning',
    badgeVariant: 'secondary',
  },
  reimprimir: {
    label: 'Etiqueta Impressa',
    description: 'O pedido já foi impresso anteriormente.',
    severity: 'info',
    badgeVariant: 'outline',
    className: 'text-yellow-600 border-yellow-600',
  },
  agendada: {
    label: 'Agendada',
    description: 'Envio com data futura de liberação (programado pelo comprador).',
    severity: 'muted',
    badgeVariant: 'outline',
    className: 'text-amber-600 border-amber-500 bg-amber-50 dark:bg-amber-950/30',
  },
  pendente_sync: {
    label: 'Sincronizando...',
    description: 'O envio está sendo sincronizado. Aguarde ou clique em Atualizar.',
    severity: 'muted',
    badgeVariant: 'outline',
    className: 'text-blue-500 border-blue-500 animate-pulse',
  },
  full: {
    label: 'FULL',
    description: 'Enviado pelo fulfillment do Mercado Livre.',
    severity: 'muted',
    badgeVariant: 'outline',
    className: 'text-muted-foreground border-muted-foreground',
  },
  enviado: {
    label: 'Enviado',
    description: 'O pedido já foi postado.',
    severity: 'info',
    badgeVariant: 'outline',
    className: 'text-blue-600 border-blue-600',
  },
  entregue: {
    label: 'Entregue',
    description: 'O comprador recebeu o pedido.',
    severity: 'success',
    badgeVariant: 'outline',
    className: 'text-green-600 border-green-600',
  },
  problema: {
    label: 'Problema',
    description: 'Ocorreu um problema com o envio.',
    severity: 'danger',
    badgeVariant: 'destructive',
  },
  outros: {
    label: 'Outro',
    description: 'Status não mapeado.',
    severity: 'muted',
    badgeVariant: 'outline',
  },
};

/**
 * Get the translated shipment status info
 */
export function getShipmentStatus(status: string | null | undefined): StatusInfo {
  if (!status) return { label: '-', description: '' };
  return SHIPMENT_STATUS_MAP[status] || { label: status, description: '' };
}

/**
 * Get the translated shipment substatus info
 * Uses fallback for unknown substatuses
 */
export function getShipmentSubstatus(substatus: string | null | undefined): StatusInfo {
  if (!substatus) return { label: '-', description: '' };
  return SHIPMENT_SUBSTATUS_MAP[substatus] || SHIPMENT_SUBSTATUS_FALLBACK;
}

/**
 * Get the translated invoice status info (from substatus)
 */
export function getInvoiceStatusFromSubstatus(substatus: string | null | undefined): StatusInfo {
  if (!substatus) return INVOICE_STATUS_MAP.unknown;
  return INVOICE_STATUS_MAP[substatus] || { label: substatus, description: '' };
}

/**
 * Get final status info for table/UI display
 */
export function getFinalStatus(finalStatus: string | null | undefined): FinalStatusInfo {
  if (!finalStatus) return FINAL_STATUS_MAP.outros;
  return FINAL_STATUS_MAP[finalStatus] || FINAL_STATUS_MAP.outros;
}

/**
 * Map severity to Tailwind color classes
 */
export function getSeverityColors(severity: Severity): { text: string; bg: string; border: string } {
  switch (severity) {
    case 'success':
      return { text: 'text-green-600', bg: 'bg-green-100', border: 'border-green-300' };
    case 'warning':
      return { text: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-300' };
    case 'danger':
      return { text: 'text-red-600', bg: 'bg-red-100', border: 'border-red-300' };
    case 'info':
      return { text: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-300' };
    case 'muted':
    default:
      return { text: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' };
  }
}
