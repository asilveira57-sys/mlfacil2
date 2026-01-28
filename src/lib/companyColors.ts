// Fixed palette of 10 soft, professional SaaS colors
export interface CompanyColor {
  key: string;
  name: string;
  hex: string;
  hsl: string;
  hoverHex: string;
  hoverHsl: string;
}

export const COMPANY_COLORS: CompanyColor[] = [
  {
    key: 'blue',
    name: 'Azul Suave',
    hex: '#5B8DEF',
    hsl: '220 82% 65%',
    hoverHex: '#4A7BD8',
    hoverHsl: '220 68% 57%',
  },
  {
    key: 'green',
    name: 'Verde Suave',
    hex: '#4CAF7C',
    hsl: '148 42% 49%',
    hoverHex: '#3D9B6A',
    hoverHsl: '148 44% 43%',
  },
  {
    key: 'purple',
    name: 'Roxo Suave',
    hex: '#9575CD',
    hsl: '262 47% 63%',
    hoverHex: '#7E57C2',
    hoverHsl: '262 47% 55%',
  },
  {
    key: 'teal',
    name: 'Turquesa',
    hex: '#26A69A',
    hsl: '174 61% 40%',
    hoverHex: '#00897B',
    hoverHsl: '174 100% 27%',
  },
  {
    key: 'orange',
    name: 'Laranja Suave',
    hex: '#FF8A65',
    hsl: '14 100% 70%',
    hoverHex: '#FF7043',
    hoverHsl: '14 100% 63%',
  },
  {
    key: 'pink',
    name: 'Rosa Suave',
    hex: '#F48FB1',
    hsl: '340 82% 76%',
    hoverHex: '#EC407A',
    hoverHsl: '340 83% 60%',
  },
  {
    key: 'indigo',
    name: 'Índigo',
    hex: '#7986CB',
    hsl: '232 50% 64%',
    hoverHex: '#5C6BC0',
    hoverHsl: '232 48% 56%',
  },
  {
    key: 'amber',
    name: 'Âmbar',
    hex: '#FFB74D',
    hsl: '37 100% 65%',
    hoverHex: '#FFA726',
    hoverHsl: '37 100% 57%',
  },
  {
    key: 'cyan',
    name: 'Ciano',
    hex: '#4DD0E1',
    hsl: '187 71% 59%',
    hoverHex: '#26C6DA',
    hoverHsl: '187 74% 50%',
  },
  {
    key: 'slate',
    name: 'Ardósia',
    hex: '#78909C',
    hsl: '200 18% 54%',
    hoverHex: '#607D8B',
    hoverHsl: '200 18% 46%',
  },
];

export function getCompanyColor(colorKey: string): CompanyColor {
  return COMPANY_COLORS.find(c => c.key === colorKey) || COMPANY_COLORS[0];
}

// Available shortcuts that can be enabled/disabled
export interface DashboardShortcut {
  key: string;
  title: string;
  description: string;
  icon: string; // lucide icon name
  route: string;
}

export const AVAILABLE_SHORTCUTS: DashboardShortcut[] = [
  {
    key: 'shipping',
    title: 'Importar Vendas',
    description: 'Sincronize pedidos do Mercado Livre',
    icon: 'CloudDownload',
    route: '/shipping-labels',
  },
  {
    key: 'send',
    title: 'Send',
    description: 'Cultive seus melhores anúncios',
    icon: 'Sprout',
    route: '/send',
  },
  {
    key: 'ads',
    title: 'Mercado ADS',
    description: 'Gerencie campanhas publicitárias',
    icon: 'Megaphone',
    route: '/publicidade',
  },
  {
    key: 'trends',
    title: 'Ver Tendências',
    description: 'Produtos em alta por categoria',
    icon: 'TrendingUp',
    route: '/tendencias',
  },
  {
    key: 'costs',
    title: 'Validar Custos',
    description: 'Análise de margens e lucro',
    icon: 'DollarSign',
    route: '/custos',
  },
  {
    key: 'radiography',
    title: 'Radiografia',
    description: 'Análise profunda de anúncios',
    icon: 'Activity',
    route: '/radiografia',
  },
  {
    key: 'labels',
    title: 'Gerar Etiquetas',
    description: 'Imprima etiquetas PDF/ZPL',
    icon: 'Package',
    route: '/shipping-labels',
  },
  {
    key: 'promotions',
    title: 'Promoções',
    description: 'Gerencie promoções ativas',
    icon: 'Tag',
    route: '/promocoes',
  },
  {
    key: 'questions',
    title: 'Perguntas',
    description: 'Responda perguntas dos clientes',
    icon: 'MessageCircle',
    route: '/perguntas',
  },
  {
    key: 'abc',
    title: 'Análise ABC',
    description: 'Classificação de produtos',
    icon: 'BarChart3',
    route: '/abc-analysis',
  },
  {
    key: 'tasks',
    title: 'Tarefas',
    description: 'Gerencie suas tarefas',
    icon: 'CheckSquare',
    route: '/tarefas',
  },
  {
    key: 'timeline',
    title: 'Linha do Tempo',
    description: 'Gaps de venda por anúncio',
    icon: 'Clock',
    route: '/anuncios/linha-do-tempo',
  },
  {
    key: 'competitors',
    title: 'Concorrência',
    description: 'Monitore seus concorrentes',
    icon: 'Eye',
    route: '/concorrencia',
  },
];

export function getShortcut(key: string): DashboardShortcut | undefined {
  return AVAILABLE_SHORTCUTS.find(s => s.key === key);
}
