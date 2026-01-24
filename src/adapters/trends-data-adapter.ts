// Data adapter layer for Trends Explorer
// This abstraction allows swapping data sources without touching UI

import {
  CategoryListItem,
  CategoryDetails,
  CategoryMetrics,
  ComparisonData,
} from '@/types/trends-explorer';

export interface TrendsDataAdapter {
  // List categories at a given level
  listCategories(parentId: string | null): Promise<CategoryListItem[]>;
  
  // Get category details
  getDetails(categoryId: string): Promise<CategoryDetails>;
  
  // Get category metrics (top sellers + keywords)
  getMetrics(categoryId: string): Promise<CategoryMetrics>;
  
  // Get comparison data for multiple categories
  getComparison(categoryIds: string[]): Promise<ComparisonData>;
  
  // Toggle favorite status
  toggleFavorite(categoryId: string, isFavorite: boolean): Promise<void>;
  
  // Search categories
  searchCategories(query: string, parentId: string | null): Promise<CategoryListItem[]>;
}

// Mock data generator for development/testing
function generateMockCategories(parentId: string | null): CategoryListItem[] {
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

  const subcategories: Record<string, { id: string; name: string; share: number }[]> = {
    'MLB1051': [
      { id: 'MLB1055', name: 'Celulares e Smartphones', share: 45.2 },
      { id: 'MLB1058', name: 'Acessórios para Celulares', share: 28.7 },
      { id: 'MLB1057', name: 'Capas e Películas', share: 15.3 },
      { id: 'MLB1059', name: 'Peças de Reposição', share: 10.8 },
    ],
    'MLB1000': [
      { id: 'MLB1002', name: 'Áudio', share: 22.5 },
      { id: 'MLB1003', name: 'TV e Vídeo', share: 31.8 },
      { id: 'MLB1004', name: 'Games', share: 25.4 },
      { id: 'MLB1005', name: 'Fotografia', share: 12.3 },
      { id: 'MLB1006', name: 'Drones', share: 8.0 },
    ],
    'MLB1574': [
      { id: 'MLB1575', name: 'Móveis para Casa', share: 35.2 },
      { id: 'MLB1576', name: 'Decoração', share: 28.5 },
      { id: 'MLB1577', name: 'Iluminação', share: 18.3 },
      { id: 'MLB1578', name: 'Organização', share: 12.0 },
      { id: 'MLB1579', name: 'Cama, Mesa e Banho', share: 6.0 },
    ],
  };

  if (!parentId) {
    return rootCategories.map((cat, index) => ({
      id: cat.id,
      name: cat.name,
      share_percent: cat.share,
      total_count: Math.floor(Math.random() * 500000) + 10000,
      parent_id: null,
      has_children: true,
      delta_24h: (Math.random() - 0.5) * 10,
      is_favorite: index < 2,
      path: [cat.name],
    }));
  }

  const children = subcategories[parentId] || [];
  const parentCat = rootCategories.find(c => c.id === parentId);
  
  return children.map(cat => ({
    id: cat.id,
    name: cat.name,
    share_percent: cat.share,
    total_count: Math.floor(Math.random() * 100000) + 1000,
    parent_id: parentId,
    has_children: Math.random() > 0.5,
    delta_24h: (Math.random() - 0.5) * 8,
    is_favorite: false,
    path: parentCat ? [parentCat.name, cat.name] : [cat.name],
  }));
}

function generateMockDetails(categoryId: string): CategoryDetails {
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

function generateMockMetrics(categoryId: string): CategoryMetrics {
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
export class MockTrendsAdapter implements TrendsDataAdapter {
  private favorites = new Set<string>();

  async listCategories(parentId: string | null): Promise<CategoryListItem[]> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    
    const categories = generateMockCategories(parentId);
    return categories.map(cat => ({
      ...cat,
      is_favorite: this.favorites.has(cat.id),
    }));
  }

  async getDetails(categoryId: string): Promise<CategoryDetails> {
    await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 600));
    return generateMockDetails(categoryId);
  }

  async getMetrics(categoryId: string): Promise<CategoryMetrics> {
    await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 800));
    return generateMockMetrics(categoryId);
  }

  async getComparison(categoryIds: string[]): Promise<ComparisonData> {
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

  async searchCategories(query: string, parentId: string | null): Promise<CategoryListItem[]> {
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const all = generateMockCategories(parentId);
    const lowerQuery = query.toLowerCase();
    
    return all.filter(cat => 
      cat.name.toLowerCase().includes(lowerQuery)
    );
  }
}

// Factory function to get the appropriate adapter
export function createTrendsAdapter(): TrendsDataAdapter {
  // In the future, this can return different adapters based on config
  // e.g., return new SupabaseTrendsAdapter() for production
  return new MockTrendsAdapter();
}
