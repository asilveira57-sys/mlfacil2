// Data adapter layer for Mercado Analytics Module
// This abstraction allows swapping data sources without touching UI

import {
  MercadoCategoryItem,
  MercadoCategoryDetails,
  MercadoCategoryMetrics,
  MercadoComparisonData,
} from '@/types/mercado';

export interface MercadoDataAdapter {
  listCategories(parentId: string | null): Promise<MercadoCategoryItem[]>;
  getDetails(categoryId: string): Promise<MercadoCategoryDetails>;
  getMetrics(categoryId: string): Promise<MercadoCategoryMetrics>;
  getComparison(categoryIds: string[]): Promise<MercadoComparisonData>;
  toggleFavorite(categoryId: string, isFavorite: boolean): Promise<void>;
  searchCategories(query: string, parentId: string | null): Promise<MercadoCategoryItem[]>;
}

// Mock data generator - DETERMINISTIC to avoid random "no children" issues
function generateMockCategories(parentId: string | null): MercadoCategoryItem[] {
  const rootCategories = [
    { id: 'MLB5672', name: 'Acessórios para Veículos', share: 8.5 },
    { id: 'MLB1246', name: 'Beleza e Cuidado Pessoal', share: 12.3 },
    { id: 'MLB1132', name: 'Brinquedos e Hobbies', share: 6.8 },
    { id: 'MLB1574', name: 'Casa, Móveis e Decoração', share: 15.2 },
    { id: 'MLB1051', name: 'Celulares e Telefones', share: 18.7 },
    { id: 'MLB1648', name: 'Computadores', share: 9.4 },
    { id: 'MLB1144', name: 'Eletrodomésticos', share: 11.1 },
    { id: 'MLB1000', name: 'Eletrônicos', share: 14.2 },
    { id: 'MLB1276', name: 'Esportes e Fitness', share: 7.9 },
    { id: 'MLB1430', name: 'Roupas e Acessórios', share: 10.8 },
    { id: 'MLB264586', name: 'Saúde', share: 5.1 },
    { id: 'MLB1500', name: 'Construção', share: 4.2 },
  ];

  // Subcategories defined deterministically - all parent categories have children
  const subcategories: Record<string, { id: string; name: string; share: number; hasChildren: boolean }[]> = {
    'MLB5672': [
      { id: 'MLB5673', name: 'Peças para Carros', share: 35.2, hasChildren: true },
      { id: 'MLB5674', name: 'Acessórios Automotivos', share: 28.5, hasChildren: true },
      { id: 'MLB5675', name: 'Peças para Motos', share: 22.3, hasChildren: false },
      { id: 'MLB5676', name: 'Pneus e Rodas', share: 14.0, hasChildren: false },
    ],
    'MLB1246': [
      { id: 'MLB1247', name: 'Maquiagem', share: 32.5, hasChildren: true },
      { id: 'MLB1248', name: 'Cuidados com a Pele', share: 28.3, hasChildren: true },
      { id: 'MLB1249', name: 'Perfumes', share: 24.7, hasChildren: false },
      { id: 'MLB1250', name: 'Cuidados com o Cabelo', share: 14.5, hasChildren: false },
    ],
    'MLB1132': [
      { id: 'MLB1133', name: 'Bonecos e Figuras', share: 25.0, hasChildren: true },
      { id: 'MLB1134', name: 'Jogos de Tabuleiro', share: 22.5, hasChildren: false },
      { id: 'MLB1135', name: 'Veículos de Brinquedo', share: 20.0, hasChildren: false },
      { id: 'MLB1136', name: 'Blocos de Montar', share: 32.5, hasChildren: true },
    ],
    'MLB1051': [
      { id: 'MLB1055', name: 'Celulares e Smartphones', share: 45.2, hasChildren: true },
      { id: 'MLB1058', name: 'Acessórios para Celulares', share: 28.7, hasChildren: true },
      { id: 'MLB1057', name: 'Capas e Películas', share: 15.3, hasChildren: false },
      { id: 'MLB1059', name: 'Peças de Reposição', share: 10.8, hasChildren: false },
    ],
    'MLB1000': [
      { id: 'MLB1002', name: 'Áudio', share: 22.5, hasChildren: true },
      { id: 'MLB1003', name: 'TV e Vídeo', share: 31.8, hasChildren: true },
      { id: 'MLB1004', name: 'Games', share: 25.4, hasChildren: true },
      { id: 'MLB1005', name: 'Fotografia', share: 12.3, hasChildren: false },
      { id: 'MLB1006', name: 'Drones', share: 8.0, hasChildren: false },
    ],
    'MLB1574': [
      { id: 'MLB1575', name: 'Móveis para Casa', share: 35.2, hasChildren: true },
      { id: 'MLB1576', name: 'Decoração', share: 28.5, hasChildren: true },
      { id: 'MLB1577', name: 'Iluminação', share: 18.3, hasChildren: false },
      { id: 'MLB1578', name: 'Organização', share: 12.0, hasChildren: false },
      { id: 'MLB1579', name: 'Cama, Mesa e Banho', share: 6.0, hasChildren: false },
    ],
    'MLB1648': [
      { id: 'MLB1649', name: 'Notebooks', share: 38.5, hasChildren: true },
      { id: 'MLB1650', name: 'Desktops', share: 22.3, hasChildren: false },
      { id: 'MLB1651', name: 'Componentes', share: 25.7, hasChildren: true },
      { id: 'MLB1652', name: 'Periféricos', share: 13.5, hasChildren: false },
    ],
    'MLB1144': [
      { id: 'MLB1145', name: 'Geladeiras', share: 28.5, hasChildren: false },
      { id: 'MLB1146', name: 'Máquinas de Lavar', share: 25.3, hasChildren: false },
      { id: 'MLB1147', name: 'Ar Condicionado', share: 22.7, hasChildren: false },
      { id: 'MLB1148', name: 'Fogões', share: 23.5, hasChildren: false },
    ],
    'MLB1276': [
      { id: 'MLB1277', name: 'Academia e Fitness', share: 32.5, hasChildren: true },
      { id: 'MLB1278', name: 'Esportes Aquáticos', share: 18.3, hasChildren: false },
      { id: 'MLB1279', name: 'Ciclismo', share: 22.7, hasChildren: true },
      { id: 'MLB1280', name: 'Camping e Trilha', share: 26.5, hasChildren: false },
    ],
    'MLB1430': [
      { id: 'MLB1431', name: 'Roupas Masculinas', share: 35.2, hasChildren: true },
      { id: 'MLB1432', name: 'Roupas Femininas', share: 42.5, hasChildren: true },
      { id: 'MLB1433', name: 'Calçados', share: 22.3, hasChildren: true },
    ],
    'MLB264586': [
      { id: 'MLB264587', name: 'Vitaminas e Suplementos', share: 45.0, hasChildren: false },
      { id: 'MLB264588', name: 'Equipamentos Médicos', share: 35.0, hasChildren: false },
      { id: 'MLB264589', name: 'Cuidados Pessoais', share: 20.0, hasChildren: false },
    ],
    'MLB1500': [
      { id: 'MLB1501', name: 'Ferramentas', share: 40.0, hasChildren: true },
      { id: 'MLB1502', name: 'Materiais Elétricos', share: 30.0, hasChildren: false },
      { id: 'MLB1503', name: 'Materiais de Construção', share: 30.0, hasChildren: false },
    ],
    // Level 3 subcategories
    'MLB1055': [
      { id: 'MLB10551', name: 'Apple', share: 35.0, hasChildren: false },
      { id: 'MLB10552', name: 'Samsung', share: 28.0, hasChildren: false },
      { id: 'MLB10553', name: 'Xiaomi', share: 22.0, hasChildren: false },
      { id: 'MLB10554', name: 'Motorola', share: 15.0, hasChildren: false },
    ],
    'MLB1058': [
      { id: 'MLB10581', name: 'Carregadores', share: 30.0, hasChildren: false },
      { id: 'MLB10582', name: 'Fones de Ouvido', share: 35.0, hasChildren: false },
      { id: 'MLB10583', name: 'Suportes', share: 20.0, hasChildren: false },
      { id: 'MLB10584', name: 'Cabos', share: 15.0, hasChildren: false },
    ],
    'MLB1004': [
      { id: 'MLB10041', name: 'PlayStation', share: 35.0, hasChildren: false },
      { id: 'MLB10042', name: 'Xbox', share: 28.0, hasChildren: false },
      { id: 'MLB10043', name: 'Nintendo', share: 22.0, hasChildren: false },
      { id: 'MLB10044', name: 'PC Gaming', share: 15.0, hasChildren: false },
    ],
  };

  // Generate deterministic counts based on category ID
  const getCount = (id: string): number => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash) + id.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash % 500000) + 10000;
  };

  const getDelta = (id: string): number => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 3) - hash) + id.charCodeAt(i);
      hash |= 0;
    }
    return ((hash % 100) - 50) / 10;
  };

  if (!parentId) {
    return rootCategories.map((cat, index) => ({
      id: cat.id,
      name: cat.name,
      share_percent: cat.share,
      total_count: getCount(cat.id),
      parent_id: null,
      has_children: true, // All root categories have children
      delta_24h: getDelta(cat.id),
      is_favorite: index < 2,
      path: [cat.name],
    }));
  }

  const children = subcategories[parentId];
  
  // If no children defined, return empty array
  if (!children) {
    return [];
  }
  
  // Find parent name for path
  const findCategoryName = (id: string): string | null => {
    const root = rootCategories.find(c => c.id === id);
    if (root) return root.name;
    
    for (const subs of Object.values(subcategories)) {
      const found = subs.find(c => c.id === id);
      if (found) return found.name;
    }
    return null;
  };
  
  const parentName = findCategoryName(parentId);
  
  return children.map(cat => ({
    id: cat.id,
    name: cat.name,
    share_percent: cat.share,
    total_count: getCount(cat.id),
    parent_id: parentId,
    has_children: cat.hasChildren, // Use deterministic value
    delta_24h: getDelta(cat.id),
    is_favorite: false,
    path: parentName ? [parentName, cat.name] : [cat.name],
  }));
}

function generateMockDetails(categoryId: string): MercadoCategoryDetails {
  return {
    category_id: categoryId,
    kpis: {
      total_listings: Math.floor(Math.random() * 500000) + 10000,
      created_24h: Math.floor(Math.random() * 5000) + 100,
      avg_price: Math.floor(Math.random() * 500) + 50,
      median_price: Math.floor(Math.random() * 400) + 40,
    },
    conditions: [
      { label: 'Novo', count: Math.floor(Math.random() * 300000), percent: 65 },
      { label: 'Usado', count: Math.floor(Math.random() * 100000), percent: 25 },
      { label: 'Recondicionado', count: Math.floor(Math.random() * 50000), percent: 10 },
    ],
    sale_formats: [
      { label: 'Compra Imediata', count: Math.floor(Math.random() * 400000), percent: 85 },
      { label: 'Leilão', count: Math.floor(Math.random() * 50000), percent: 10 },
      { label: 'Classificado', count: Math.floor(Math.random() * 25000), percent: 5 },
    ],
    listing_types: [
      { label: 'Clássico', count: Math.floor(Math.random() * 200000), percent: 45 },
      { label: 'Premium', count: Math.floor(Math.random() * 150000), percent: 35 },
      { label: 'Diamante', count: Math.floor(Math.random() * 80000), percent: 20 },
    ],
    shipping_modes: [
      { label: 'Mercado Envios Full', count: Math.floor(Math.random() * 150000), percent: 35 },
      { label: 'Mercado Envios', count: Math.floor(Math.random() * 200000), percent: 45 },
      { label: 'Combinar', count: Math.floor(Math.random() * 80000), percent: 20 },
    ],
    flags: {
      with_video: Math.floor(Math.random() * 50000),
      with_offer: Math.floor(Math.random() * 80000),
      with_free_shipping: Math.floor(Math.random() * 200000),
      with_discount: Math.floor(Math.random() * 100000),
    },
    price_ranges: [
      { range: 'R$ 0 - 50', min: 0, max: 50, count: Math.floor(Math.random() * 100000), percent: 25 },
      { range: 'R$ 50 - 100', min: 50, max: 100, count: Math.floor(Math.random() * 80000), percent: 20 },
      { range: 'R$ 100 - 250', min: 100, max: 250, count: Math.floor(Math.random() * 100000), percent: 25 },
      { range: 'R$ 250 - 500', min: 250, max: 500, count: Math.floor(Math.random() * 60000), percent: 15 },
      { range: 'R$ 500+', min: 500, max: 999999, count: Math.floor(Math.random() * 60000), percent: 15 },
    ],
    official_stores: Array.from({ length: 20 }, (_, i) => ({
      id: `store_${i}`,
      name: `Loja Oficial ${i + 1}`,
      listings_count: Math.floor(Math.random() * 5000) + 100,
    })),
    locations: [
      { state: 'SP', count: Math.floor(Math.random() * 200000), percent: 40 },
      { state: 'RJ', count: Math.floor(Math.random() * 80000), percent: 16 },
      { state: 'MG', count: Math.floor(Math.random() * 60000), percent: 12 },
      { state: 'PR', count: Math.floor(Math.random() * 40000), percent: 8 },
      { state: 'RS', count: Math.floor(Math.random() * 35000), percent: 7 },
      { state: 'SC', count: Math.floor(Math.random() * 30000), percent: 6 },
      { state: 'BA', count: Math.floor(Math.random() * 25000), percent: 5 },
      { state: 'Outros', count: Math.floor(Math.random() * 30000), percent: 6 },
    ],
    cached_at: new Date().toISOString(),
    ttl_seconds: 12 * 60 * 60,
  };
}

function generateMockMetrics(categoryId: string): MercadoCategoryMetrics {
  const products = [
    'iPhone 15 Pro Max 256GB',
    'Galaxy S24 Ultra 512GB',
    'MacBook Pro M3 14"',
    'PlayStation 5 Slim',
    'AirPods Pro 2ª Geração',
    'Nintendo Switch OLED',
    'iPad Pro 12.9" M2',
    'Apple Watch Series 9',
    'JBL Flip 6 Bluetooth',
    'Kindle Paperwhite 11ª',
  ];

  const keywords = [
    'iphone 15', 'samsung galaxy', 'notebook gamer', 'playstation 5',
    'airpods', 'smartwatch', 'fone bluetooth', 'tablet samsung',
    'mouse gamer', 'teclado mecânico', 'monitor 144hz', 'ssd 1tb',
  ];

  return {
    category_id: categoryId,
    top_sellers: products.map((title, i) => ({
      id: `item_${categoryId}_${i}`,
      item_id: `MLB${Math.floor(Math.random() * 9000000000) + 1000000000}`,
      title,
      thumbnail: `https://http2.mlstatic.com/D_NQ_NP_${Math.floor(Math.random() * 900000) + 100000}-MLA${Math.floor(Math.random() * 90000000) + 10000000}_O.webp`,
      price: Math.floor(Math.random() * 8000) + 200,
      sold_quantity: Math.floor(Math.random() * 10000) + 100,
      is_catalog: Math.random() > 0.5,
      is_full: Math.random() > 0.3,
      rank: i + 1,
    })),
    top_keywords: keywords.map((keyword, i) => ({
      keyword,
      volume: Math.floor(Math.random() * 500000) + 10000,
      trend: ['up', 'down', 'stable'][Math.floor(Math.random() * 3)] as 'up' | 'down' | 'stable',
      rank: i + 1,
    })),
    cached_at: new Date().toISOString(),
    ttl_seconds: 45 * 60,
  };
}

// Mock adapter implementation
export class MockMercadoAdapter implements MercadoDataAdapter {
  private favorites = new Set<string>();

  async listCategories(parentId: string | null): Promise<MercadoCategoryItem[]> {
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    
    const categories = generateMockCategories(parentId);
    return categories.map(cat => ({
      ...cat,
      is_favorite: this.favorites.has(cat.id),
    }));
  }

  async getDetails(categoryId: string): Promise<MercadoCategoryDetails> {
    await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 600));
    return generateMockDetails(categoryId);
  }

  async getMetrics(categoryId: string): Promise<MercadoCategoryMetrics> {
    await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 800));
    return generateMockMetrics(categoryId);
  }

  async getComparison(categoryIds: string[]): Promise<MercadoComparisonData> {
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));
    
    return {
      categories: categoryIds.map(id => {
        const details = generateMockDetails(id);
        const metrics = generateMockMetrics(id);
        const list = generateMockCategories(null).find(c => c.id === id);
        
        return {
          id,
          name: list?.name || `Categoria ${id}`,
          share_percent: list?.share_percent || 0,
          total_count: details.kpis.total_listings,
          delta_24h: list?.delta_24h,
          top_keywords: metrics.top_keywords.slice(0, 5),
          price_ranges: details.price_ranges,
        };
      }),
    };
  }

  async toggleFavorite(categoryId: string, isFavorite: boolean): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (isFavorite) {
      this.favorites.add(categoryId);
    } else {
      this.favorites.delete(categoryId);
    }
  }

  async searchCategories(query: string, parentId: string | null): Promise<MercadoCategoryItem[]> {
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const all = generateMockCategories(parentId);
    const lowerQuery = query.toLowerCase();
    
    return all.filter(cat => 
      cat.name.toLowerCase().includes(lowerQuery)
    );
  }
}

// Factory function
export function createMercadoAdapter(): MercadoDataAdapter {
  return new MockMercadoAdapter();
}
