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

  // Para Shopee, usamos a lógica de split específica para contar etiquetas reais
  if (labelType === "shopee") {
    const labels = splitShopeeLabels(code);
    return labels.length || 1;
  }
  
  // Padrão: conta quantas vezes aparece ^XA (início de etiqueta ZPL)
  const matches = code.match(/\^XA/gi);
  // Se tem ~DGR, cada ~DGR = 1 etiqueta real (ex: Shopee genérico)
  const dgrMatches = code.match(/~DGR/gi);
  if (dgrMatches && dgrMatches.length > 1) {
    return dgrMatches.length;
  }
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

  const firstXAIndex = normalized.search(/\^XA/i);

  if (firstXAIndex === -1) {
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

  // Em muitos arquivos Shopee, cada etiqueta lógica é composta por 2 blocos ^XA...^XZ
  let groupedLabels: string[] = [];
  if (rawBlocks.length % 2 === 0) {
    for (let i = 0; i < rawBlocks.length; i += 2) {
      groupedLabels.push(rawBlocks[i] + "\n" + rawBlocks[i + 1]);
    }
  } else {
    groupedLabels = rawBlocks;
  }

  return groupedLabels;
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
