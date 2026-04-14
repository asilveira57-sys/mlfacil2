export interface ZPLSetting {
  id: string;
  label_type: string;
  time_per_10_labels: number;
  custom_message: string;
  created_at: string;
  updated_at: string;
}

// Hook disabled until zpl_converter_settings table is created
export const useZPLSettings = () => {
  return {
    data: [] as ZPLSetting[],
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
  };
};

export const detectLabelCount = (zplCode: string, labelType?: string): number => {
  const code = zplCode || "";
  if (!code.trim()) return 0;

  // Use the same split logic used for conversion so count matches actual output
  if (labelType) {
    const labels = splitZPLByType(code, labelType);
    return labels.length || (code.trim().length > 0 ? 1 : 0);
  }

  // Fallback: count printable ^XA blocks
  const matches = code.match(/\^XA/gi);
  return matches ? matches.length : 1;
};

// ============ DEFINIÇÃO DOS TIPOS DE ETIQUETA ============

export interface LabelTypeConfig {
  value: string;
  label: string;
  defaultWidth: string;
  defaultHeight: string;
}

export interface FullProdutoSubType {
  value: string;
  label: string;
  width: string;
  height: string;
}

export const FULL_PRODUTO_SUBTYPES: FullProdutoSubType[] = [
  { value: '40x25_1col', label: '40x25 1 Coluna', width: '44', height: '25' },
  { value: '40x25_2col', label: '40x25 2 Colunas', width: '85', height: '25' },
  { value: '50x25_1col', label: '50x25 1 Coluna', width: '55', height: '25' },
  { value: '50x25_2col', label: '50x25 2 Colunas', width: '105', height: '25' },
  { value: '60x40_1col', label: '60x40 1 Coluna', width: '65', height: '40' },
  { value: '80x50_1col', label: '80x50 1 Coluna', width: '85', height: '50' },
];

export const LABEL_TYPES: LabelTypeConfig[] = [
  { value: 'full_produto', label: 'Etiqueta Full Produtos', defaultWidth: '105', defaultHeight: '25' },
  { value: 'full_volume', label: 'Etiqueta Full Volume', defaultWidth: '105', defaultHeight: '150' },
  { value: 'mercadolivre', label: 'Envio Mercadolivre', defaultWidth: '105', defaultHeight: '150' },
  { value: 'shopee', label: 'Envio Shopee', defaultWidth: '105', defaultHeight: '150' },
  { value: 'magalu', label: 'Envio Magalu', defaultWidth: '105', defaultHeight: '150' },
];

// ============ FUNÇÕES DE SPLIT POR TIPO DE ETIQUETA ============

// SHOPEE - arquivo pode conter múltiplas etiquetas no MESMO ZPL
export const splitShopeeLabels = (zplCode: string): string[] => {
  const normalized = zplCode.trim();
  if (!normalized) return [];

  // Strategy: split by ~DGR markers (each Shopee label has its own ~DGR graphic block)
  const dgrPositions: number[] = [];
  const dgrRegex = /~DGR/gi;
  let dgrMatch: RegExpExecArray | null;
  while ((dgrMatch = dgrRegex.exec(normalized)) !== null) {
    dgrPositions.push(dgrMatch.index);
  }

  let candidates: string[];

  if (dgrPositions.length > 1) {
    // Multiple ~DGR: split at each one
    candidates = [];
    for (let i = 0; i < dgrPositions.length; i++) {
      const start = dgrPositions[i];
      const end = i + 1 < dgrPositions.length ? dgrPositions[i + 1] : normalized.length;
      const block = normalized.slice(start, end).trim();
      if (block.length > 0) {
        candidates.push(block);
      }
    }
  } else {
    // Fallback: split by ^XA blocks
    const firstXAIndex = normalized.search(/\^XA/i);
    if (firstXAIndex === -1) {
      // No ^XA at all — return whole thing only if it has some content
      return [normalized];
    }

    const header = normalized.slice(0, firstXAIndex);
    const body = normalized.slice(firstXAIndex);

    const regex = /\^XA[\s\S]*?\^XZ/gi;
    const rawBlocks: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(body)) !== null) {
      const labelBody = match[0].trim();
      if (labelBody.length > 0) {
        rawBlocks.push(header ? header + labelBody : labelBody);
      }
    }

    if (rawBlocks.length === 0) {
      return [normalized];
    }

    // Old Shopee files: logical labels composed of 2 ^XA...^XZ blocks
    if (rawBlocks.length % 2 === 0) {
      const grouped: string[] = [];
      for (let i = 0; i < rawBlocks.length; i += 2) {
        grouped.push(rawBlocks[i] + "\n" + rawBlocks[i + 1]);
      }
      candidates = grouped;
    } else {
      candidates = rawBlocks;
    }
  }

  // VALIDATION: every candidate must contain at least one printable ^XA...^XZ block
  // If a candidate is only a graphic preamble without ^XA, it's not a real label
  const valid = candidates.filter(block => /\^XA[\s\S]*?\^XZ/i.test(block));

  // If validation removed everything, try the whole document as a single label
  if (valid.length === 0 && normalized.length > 0) {
    return [normalized];
  }

  return valid;
};

// FULL PRODUTOS/VOLUMES - Para etiquetas que já têm ^XA/^XZ
export const splitFullLabels = (zplCode: string): string[] => {
  const normalized = zplCode.trim();
  
  const parts = normalized.split(/(?=\^XA)/i);
  
  const labels = parts
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .filter(part => /\^XA/i.test(part) && /\^XZ/i.test(part));
  
  return labels;
};

// MERCADO LIVRE - Estrutura similar ao Full
export const splitMercadoLivreLabels = (zplCode: string): string[] => {
  return splitFullLabels(zplCode);
};

// MAGALU - Estrutura similar ao Full
export const splitMagaluLabels = (zplCode: string): string[] => {
  return splitFullLabels(zplCode);
};

// Função principal que escolhe a estratégia baseada no tipo
export const splitZPLByType = (zplCode: string, labelType: string): string[] => {
  if (!zplCode.trim()) return [];
  
  switch(labelType) {
    case 'shopee':
      return splitShopeeLabels(zplCode);
    case 'full_produto':
    case 'full_volume':
      return splitFullLabels(zplCode);
    case 'mercadolivre':
      return splitMercadoLivreLabels(zplCode);
    case 'magalu':
      return splitMagaluLabels(zplCode);
    default:
      return [];
  }
};
