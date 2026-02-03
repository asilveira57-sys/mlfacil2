import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ToolsLayout } from "./ToolsLayout";
import { 
  ToolsNavTabs, 
  ToolsPromoCard, 
  TrendsLiteFilters, 
  KeywordsSection,
  TopProductsSection,
  RelatedSearchesSection
} from "@/components/tools";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

// Expanded trends data with subcategories and growth indicators
const TRENDS_DATA = [
  // Eletrônicos
  { term: "Fone Bluetooth TWS", category: "Eletrônicos", subcategory: "Áudio", popularity: 95, relevance: 90, growth: 'up' as const, rank: 1 },
  { term: "Carregador Portátil 20000mAh", category: "Eletrônicos", subcategory: "Acessórios", popularity: 88, relevance: 85, growth: 'up' as const, rank: 2 },
  { term: "Smart Watch Xiaomi", category: "Eletrônicos", subcategory: "Wearables", popularity: 83, relevance: 80, growth: 'stable' as const, rank: 3 },
  { term: "Câmera de Segurança WiFi", category: "Eletrônicos", subcategory: "Segurança", popularity: 76, relevance: 78, growth: 'up' as const, rank: 4 },
  { term: "Echo Dot 5ª Geração", category: "Eletrônicos", subcategory: "Smart Home", popularity: 72, relevance: 75, growth: 'stable' as const, rank: 5 },
  
  // Acessórios
  { term: "Capinha iPhone 15", category: "Acessórios", subcategory: "Cases", popularity: 92, relevance: 88, growth: 'up' as const, rank: 1 },
  { term: "Relógio Masculino Digital", category: "Acessórios", subcategory: "Relógios", popularity: 55, relevance: 52, growth: 'down' as const, rank: 2 },
  { term: "Óculos de Sol Polarizado", category: "Acessórios", subcategory: "Óculos", popularity: 48, relevance: 55, growth: 'stable' as const, rank: 3 },
  { term: "Pulseira Apple Watch", category: "Acessórios", subcategory: "Wearables", popularity: 65, relevance: 68, growth: 'up' as const, rank: 4 },
  { term: "Carteira Masculina Couro", category: "Acessórios", subcategory: "Carteiras", popularity: 58, relevance: 60, growth: 'stable' as const, rank: 5 },
  
  // Moda
  { term: "Tênis Nike Air Max", category: "Moda", subcategory: "Calçados", popularity: 85, relevance: 92, growth: 'stable' as const, rank: 1 },
  { term: "Bolsa Feminina Transversal", category: "Moda", subcategory: "Bolsas", popularity: 78, relevance: 82, growth: 'up' as const, rank: 2 },
  { term: "Cinto Masculino Couro", category: "Moda", subcategory: "Acessórios", popularity: 63, relevance: 58, growth: 'down' as const, rank: 3 },
  { term: "Jaqueta Corta Vento", category: "Moda", subcategory: "Roupas", popularity: 70, relevance: 72, growth: 'up' as const, rank: 4 },
  { term: "Vestido Midi Estampado", category: "Moda", subcategory: "Roupas", popularity: 68, relevance: 70, growth: 'up' as const, rank: 5 },
  
  // Beleza
  { term: "Perfume Importado Masculino", category: "Beleza", subcategory: "Perfumaria", popularity: 80, relevance: 75, growth: 'stable' as const, rank: 1 },
  { term: "Organizador de Maquiagem", category: "Beleza", subcategory: "Organizadores", popularity: 72, relevance: 68, growth: 'up' as const, rank: 2 },
  { term: "Kit Skincare Facial", category: "Beleza", subcategory: "Skincare", popularity: 60, relevance: 72, growth: 'up' as const, rank: 3 },
  { term: "Secador de Cabelo Profissional", category: "Beleza", subcategory: "Cabelos", popularity: 58, relevance: 62, growth: 'stable' as const, rank: 4 },
  { term: "Escova Rotativa 5 em 1", category: "Beleza", subcategory: "Cabelos", popularity: 55, relevance: 58, growth: 'up' as const, rank: 5 },
  
  // Casa
  { term: "Panela Air Fryer", category: "Casa", subcategory: "Eletrodomésticos", popularity: 50, relevance: 65, growth: 'stable' as const, rank: 1 },
  { term: "Luminária LED Mesa", category: "Casa", subcategory: "Iluminação", popularity: 65, relevance: 60, growth: 'up' as const, rank: 2 },
  { term: "Organizador de Gavetas", category: "Casa", subcategory: "Organização", popularity: 55, relevance: 58, growth: 'up' as const, rank: 3 },
  { term: "Jogo de Cama Queen", category: "Casa", subcategory: "Cama e Banho", popularity: 62, relevance: 65, growth: 'stable' as const, rank: 4 },
  { term: "Robot Aspirador", category: "Casa", subcategory: "Eletrodomésticos", popularity: 48, relevance: 52, growth: 'up' as const, rank: 5 },
  
  // Games
  { term: "Mouse Gamer RGB", category: "Games", subcategory: "Periféricos", popularity: 70, relevance: 85, growth: 'up' as const, rank: 1 },
  { term: "Cadeira Gamer", category: "Games", subcategory: "Móveis", popularity: 68, relevance: 75, growth: 'stable' as const, rank: 2 },
  { term: "Headset Gamer 7.1", category: "Games", subcategory: "Áudio", popularity: 58, relevance: 80, growth: 'up' as const, rank: 3 },
  { term: "Teclado Mecânico RGB", category: "Games", subcategory: "Periféricos", popularity: 64, relevance: 78, growth: 'up' as const, rank: 4 },
  { term: "Mousepad XXL", category: "Games", subcategory: "Acessórios", popularity: 52, relevance: 55, growth: 'stable' as const, rank: 5 },
  
  // Saúde
  { term: "Suplemento Whey Protein", category: "Saúde", subcategory: "Suplementos", popularity: 74, relevance: 70, growth: 'stable' as const, rank: 1 },
  { term: "Vitamina C 1000mg", category: "Saúde", subcategory: "Vitaminas", popularity: 52, relevance: 48, growth: 'down' as const, rank: 2 },
  { term: "Balança Digital", category: "Saúde", subcategory: "Equipamentos", popularity: 45, relevance: 50, growth: 'stable' as const, rank: 3 },
  { term: "Creatina Monohidratada", category: "Saúde", subcategory: "Suplementos", popularity: 68, relevance: 65, growth: 'up' as const, rank: 4 },
  { term: "Termômetro Digital", category: "Saúde", subcategory: "Equipamentos", popularity: 42, relevance: 45, growth: 'stable' as const, rank: 5 },
  
  // Esporte e Lazer
  { term: "Garrafa Térmica 1L", category: "Esporte e Lazer", subcategory: "Acessórios", popularity: 68, relevance: 72, growth: 'up' as const, rank: 1 },
  { term: "Corda de Pular Profissional", category: "Esporte e Lazer", subcategory: "Fitness", popularity: 55, relevance: 60, growth: 'up' as const, rank: 2 },
  { term: "Mochila Impermeável", category: "Esporte e Lazer", subcategory: "Mochilas", popularity: 62, relevance: 65, growth: 'stable' as const, rank: 3 },
  { term: "Bicicleta Ergométrica", category: "Esporte e Lazer", subcategory: "Fitness", popularity: 50, relevance: 55, growth: 'stable' as const, rank: 4 },
  { term: "Kit Halteres", category: "Esporte e Lazer", subcategory: "Musculação", popularity: 58, relevance: 62, growth: 'up' as const, rank: 5 },
  
  // Automotivo
  { term: "Suporte Celular Veicular", category: "Automotivo", subcategory: "Acessórios", popularity: 72, relevance: 75, growth: 'up' as const, rank: 1 },
  { term: "Câmera de Ré Universal", category: "Automotivo", subcategory: "Eletrônicos", popularity: 58, relevance: 62, growth: 'stable' as const, rank: 2 },
  { term: "Aspirador Portátil Carro", category: "Automotivo", subcategory: "Limpeza", popularity: 48, relevance: 52, growth: 'up' as const, rank: 3 },
  { term: "Carregador Veicular USB-C", category: "Automotivo", subcategory: "Carregadores", popularity: 55, relevance: 58, growth: 'up' as const, rank: 4 },
  { term: "Tapete Automotivo Universal", category: "Automotivo", subcategory: "Acessórios", popularity: 45, relevance: 48, growth: 'stable' as const, rank: 5 },
  
  // Pet
  { term: "Ração Premium Cães", category: "Pet", subcategory: "Alimentação", popularity: 78, relevance: 80, growth: 'stable' as const, rank: 1 },
  { term: "Caixa de Transporte Pet", category: "Pet", subcategory: "Transporte", popularity: 55, relevance: 58, growth: 'up' as const, rank: 2 },
  { term: "Arranhador para Gatos", category: "Pet", subcategory: "Acessórios", popularity: 52, relevance: 55, growth: 'up' as const, rank: 3 },
  { term: "Comedouro Automático", category: "Pet", subcategory: "Alimentação", popularity: 48, relevance: 52, growth: 'up' as const, rank: 4 },
  { term: "Coleira Antiparasitas", category: "Pet", subcategory: "Saúde", popularity: 45, relevance: 48, growth: 'stable' as const, rank: 5 },
  
  // Bebês
  { term: "Fralda Pampers Premium", category: "Bebês", subcategory: "Higiene", popularity: 85, relevance: 82, growth: 'stable' as const, rank: 1 },
  { term: "Carrinho de Bebê Compacto", category: "Bebês", subcategory: "Passeio", popularity: 65, relevance: 70, growth: 'up' as const, rank: 2 },
  { term: "Mamadeira Anticólica", category: "Bebês", subcategory: "Alimentação", popularity: 58, relevance: 62, growth: 'stable' as const, rank: 3 },
  { term: "Kit Higiene Bebê", category: "Bebês", subcategory: "Higiene", popularity: 55, relevance: 58, growth: 'up' as const, rank: 4 },
  { term: "Lenço Umedecido 100un", category: "Bebês", subcategory: "Higiene", popularity: 72, relevance: 70, growth: 'stable' as const, rank: 5 },
  
  // Informática
  { term: "SSD 1TB NVMe", category: "Informática", subcategory: "Armazenamento", popularity: 75, relevance: 80, growth: 'up' as const, rank: 1 },
  { term: "Memória RAM DDR4 16GB", category: "Informática", subcategory: "Componentes", popularity: 68, relevance: 72, growth: 'stable' as const, rank: 2 },
  { term: "Webcam Full HD", category: "Informática", subcategory: "Periféricos", popularity: 55, relevance: 58, growth: 'down' as const, rank: 3 },
  { term: "Monitor 24 144Hz", category: "Informática", subcategory: "Monitores", popularity: 62, relevance: 68, growth: 'up' as const, rank: 4 },
  { term: "Hub USB-C 7 em 1", category: "Informática", subcategory: "Acessórios", popularity: 52, relevance: 55, growth: 'up' as const, rank: 5 },
  
  // Telefonia
  { term: "Película iPhone 15", category: "Telefonia", subcategory: "Proteção", popularity: 88, relevance: 85, growth: 'up' as const, rank: 1 },
  { term: "Cabo USB-C 2m", category: "Telefonia", subcategory: "Cabos", popularity: 72, relevance: 70, growth: 'stable' as const, rank: 2 },
  { term: "Carregador Turbo 65W", category: "Telefonia", subcategory: "Carregadores", popularity: 78, relevance: 82, growth: 'up' as const, rank: 3 },
  { term: "Suporte Ring Light", category: "Telefonia", subcategory: "Acessórios", popularity: 55, relevance: 58, growth: 'stable' as const, rank: 4 },
  { term: "Tripé para Celular", category: "Telefonia", subcategory: "Acessórios", popularity: 52, relevance: 55, growth: 'up' as const, rank: 5 },
];

// Keywords data - top searched terms (top 5 per category)
const KEYWORDS_DATA = [
  // Eletrônicos
  { keyword: "fone bluetooth", category: "Eletrônicos", trend: 'up' as const },
  { keyword: "carregador portátil", category: "Eletrônicos", trend: 'up' as const },
  { keyword: "smart watch", category: "Eletrônicos", trend: 'up' as const },
  { keyword: "câmera segurança", category: "Eletrônicos", trend: 'stable' as const },
  { keyword: "alexa echo", category: "Eletrônicos", trend: 'stable' as const },
  
  // Acessórios
  { keyword: "capinha iphone 15", category: "Acessórios", trend: 'up' as const },
  { keyword: "pulseira apple watch", category: "Acessórios", trend: 'up' as const },
  { keyword: "óculos de sol", category: "Acessórios", trend: 'stable' as const },
  { keyword: "relógio digital", category: "Acessórios", trend: 'stable' as const },
  { keyword: "carteira masculina", category: "Acessórios", trend: 'stable' as const },
  
  // Moda
  { keyword: "tênis nike", category: "Moda", trend: 'stable' as const },
  { keyword: "bolsa feminina", category: "Moda", trend: 'up' as const },
  { keyword: "jaqueta corta vento", category: "Moda", trend: 'up' as const },
  { keyword: "vestido midi", category: "Moda", trend: 'up' as const },
  { keyword: "cinto couro", category: "Moda", trend: 'stable' as const },
  
  // Beleza
  { keyword: "perfume masculino", category: "Beleza", trend: 'stable' as const },
  { keyword: "kit skincare", category: "Beleza", trend: 'up' as const },
  { keyword: "secador profissional", category: "Beleza", trend: 'stable' as const },
  { keyword: "escova rotativa", category: "Beleza", trend: 'up' as const },
  { keyword: "organizador maquiagem", category: "Beleza", trend: 'up' as const },
  
  // Casa
  { keyword: "air fryer", category: "Casa", trend: 'stable' as const },
  { keyword: "luminária led", category: "Casa", trend: 'up' as const },
  { keyword: "robot aspirador", category: "Casa", trend: 'up' as const },
  { keyword: "jogo de cama", category: "Casa", trend: 'stable' as const },
  { keyword: "organizador gaveta", category: "Casa", trend: 'up' as const },
  
  // Games
  { keyword: "mouse gamer", category: "Games", trend: 'up' as const },
  { keyword: "cadeira gamer", category: "Games", trend: 'stable' as const },
  { keyword: "headset gamer", category: "Games", trend: 'up' as const },
  { keyword: "teclado mecânico", category: "Games", trend: 'up' as const },
  { keyword: "mousepad grande", category: "Games", trend: 'stable' as const },
  
  // Bebês
  { keyword: "fralda pampers", category: "Bebês", trend: 'stable' as const },
  { keyword: "fralda huggies", category: "Bebês", trend: 'stable' as const },
  { keyword: "lenço umedecido", category: "Bebês", trend: 'stable' as const },
  { keyword: "kit higiene bebê", category: "Bebês", trend: 'up' as const },
  { keyword: "carrinho bebê", category: "Bebês", trend: 'up' as const },
  
  // Pet
  { keyword: "ração premium", category: "Pet", trend: 'stable' as const },
  { keyword: "arranhador gato", category: "Pet", trend: 'up' as const },
  { keyword: "caixa transporte", category: "Pet", trend: 'up' as const },
  { keyword: "comedouro automático", category: "Pet", trend: 'up' as const },
  { keyword: "coleira antipulgas", category: "Pet", trend: 'stable' as const },
  
  // Informática
  { keyword: "ssd 1tb", category: "Informática", trend: 'up' as const },
  { keyword: "memória ram 16gb", category: "Informática", trend: 'stable' as const },
  { keyword: "monitor 144hz", category: "Informática", trend: 'up' as const },
  { keyword: "webcam full hd", category: "Informática", trend: 'down' as const },
  { keyword: "hub usb c", category: "Informática", trend: 'up' as const },
  
  // Telefonia
  { keyword: "película iphone", category: "Telefonia", trend: 'up' as const },
  { keyword: "carregador turbo", category: "Telefonia", trend: 'up' as const },
  { keyword: "cabo usb c", category: "Telefonia", trend: 'stable' as const },
  { keyword: "tripé celular", category: "Telefonia", trend: 'up' as const },
  { keyword: "ring light", category: "Telefonia", trend: 'stable' as const },
  
  // Saúde
  { keyword: "whey protein", category: "Saúde", trend: 'stable' as const },
  { keyword: "creatina", category: "Saúde", trend: 'up' as const },
  { keyword: "vitamina c", category: "Saúde", trend: 'down' as const },
  { keyword: "balança digital", category: "Saúde", trend: 'stable' as const },
  { keyword: "termômetro digital", category: "Saúde", trend: 'stable' as const },
  
  // Esporte e Lazer
  { keyword: "garrafa térmica", category: "Esporte e Lazer", trend: 'up' as const },
  { keyword: "corda pular", category: "Esporte e Lazer", trend: 'up' as const },
  { keyword: "halteres", category: "Esporte e Lazer", trend: 'up' as const },
  { keyword: "bicicleta ergométrica", category: "Esporte e Lazer", trend: 'stable' as const },
  { keyword: "mochila impermeável", category: "Esporte e Lazer", trend: 'stable' as const },
  
  // Automotivo
  { keyword: "suporte celular carro", category: "Automotivo", trend: 'up' as const },
  { keyword: "câmera ré", category: "Automotivo", trend: 'stable' as const },
  { keyword: "carregador veicular", category: "Automotivo", trend: 'up' as const },
  { keyword: "aspirador carro", category: "Automotivo", trend: 'up' as const },
  { keyword: "tapete automotivo", category: "Automotivo", trend: 'stable' as const },
];

// Related searches data
const RELATED_SEARCHES_DATA = [
  // Bebês - related to "fralda pampers"
  { term: "fralda pampers premium care", baseTerm: "fralda pampers", category: "Bebês" },
  { term: "fralda pampers preço", baseTerm: "fralda pampers", category: "Bebês" },
  { term: "fralda pampers tamanho g", baseTerm: "fralda pampers", category: "Bebês" },
  { term: "fralda pampers noturna", baseTerm: "fralda pampers", category: "Bebês" },
  { term: "fralda pampers atacado", baseTerm: "fralda pampers", category: "Bebês" },
  
  // Eletrônicos - related to "fone bluetooth"
  { term: "fone bluetooth original", baseTerm: "fone bluetooth", category: "Eletrônicos" },
  { term: "fone bluetooth barato", baseTerm: "fone bluetooth", category: "Eletrônicos" },
  { term: "fone bluetooth jbl", baseTerm: "fone bluetooth", category: "Eletrônicos" },
  { term: "fone bluetooth sem fio", baseTerm: "fone bluetooth", category: "Eletrônicos" },
  { term: "fone bluetooth gamer", baseTerm: "fone bluetooth", category: "Eletrônicos" },
  
  // Moda - related to "tênis nike"
  { term: "tênis nike air force", baseTerm: "tênis nike", category: "Moda" },
  { term: "tênis nike masculino", baseTerm: "tênis nike", category: "Moda" },
  { term: "tênis nike feminino", baseTerm: "tênis nike", category: "Moda" },
  { term: "tênis nike original", baseTerm: "tênis nike", category: "Moda" },
  { term: "tênis nike preto", baseTerm: "tênis nike", category: "Moda" },
  
  // Games - related to "mouse gamer"
  { term: "mouse gamer sem fio", baseTerm: "mouse gamer", category: "Games" },
  { term: "mouse gamer rgb", baseTerm: "mouse gamer", category: "Games" },
  { term: "mouse gamer barato", baseTerm: "mouse gamer", category: "Games" },
  { term: "mouse gamer logitech", baseTerm: "mouse gamer", category: "Games" },
  { term: "mouse gamer razer", baseTerm: "mouse gamer", category: "Games" },
  
  // Acessórios - related to "capinha iphone"
  { term: "capinha iphone 15 pro max", baseTerm: "capinha iphone", category: "Acessórios" },
  { term: "capinha iphone silicone", baseTerm: "capinha iphone", category: "Acessórios" },
  { term: "capinha iphone magsafe", baseTerm: "capinha iphone", category: "Acessórios" },
  { term: "capinha iphone transparente", baseTerm: "capinha iphone", category: "Acessórios" },
  { term: "capinha iphone original", baseTerm: "capinha iphone", category: "Acessórios" },
  
  // Beleza - related to "perfume masculino"
  { term: "perfume masculino importado", baseTerm: "perfume masculino", category: "Beleza" },
  { term: "perfume masculino boticário", baseTerm: "perfume masculino", category: "Beleza" },
  { term: "perfume masculino doce", baseTerm: "perfume masculino", category: "Beleza" },
  { term: "perfume masculino amadeirado", baseTerm: "perfume masculino", category: "Beleza" },
  { term: "perfume masculino barato", baseTerm: "perfume masculino", category: "Beleza" },
  
  // Pet - related to "ração premium"
  { term: "ração premium golden", baseTerm: "ração premium", category: "Pet" },
  { term: "ração premium cães adultos", baseTerm: "ração premium", category: "Pet" },
  { term: "ração premium filhotes", baseTerm: "ração premium", category: "Pet" },
  { term: "ração premium gatos", baseTerm: "ração premium", category: "Pet" },
  { term: "ração premium 15kg", baseTerm: "ração premium", category: "Pet" },
  
  // Casa - related to "air fryer"
  { term: "air fryer grande", baseTerm: "air fryer", category: "Casa" },
  { term: "air fryer philips", baseTerm: "air fryer", category: "Casa" },
  { term: "air fryer 5 litros", baseTerm: "air fryer", category: "Casa" },
  { term: "air fryer mondial", baseTerm: "air fryer", category: "Casa" },
  { term: "air fryer forno", baseTerm: "air fryer", category: "Casa" },
  
  // Saúde - related to "whey protein"
  { term: "whey protein isolado", baseTerm: "whey protein", category: "Saúde" },
  { term: "whey protein concentrado", baseTerm: "whey protein", category: "Saúde" },
  { term: "whey protein growth", baseTerm: "whey protein", category: "Saúde" },
  { term: "whey protein chocolate", baseTerm: "whey protein", category: "Saúde" },
  { term: "whey protein baunilha", baseTerm: "whey protein", category: "Saúde" },
  
  // Informática - related to "ssd 1tb"
  { term: "ssd 1tb nvme", baseTerm: "ssd 1tb", category: "Informática" },
  { term: "ssd 1tb kingston", baseTerm: "ssd 1tb", category: "Informática" },
  { term: "ssd 1tb samsung", baseTerm: "ssd 1tb", category: "Informática" },
  { term: "ssd 1tb sata", baseTerm: "ssd 1tb", category: "Informática" },
  { term: "ssd 1tb notebook", baseTerm: "ssd 1tb", category: "Informática" },
  
  // Telefonia - related to "carregador turbo"
  { term: "carregador turbo samsung", baseTerm: "carregador turbo", category: "Telefonia" },
  { term: "carregador turbo iphone", baseTerm: "carregador turbo", category: "Telefonia" },
  { term: "carregador turbo 65w", baseTerm: "carregador turbo", category: "Telefonia" },
  { term: "carregador turbo original", baseTerm: "carregador turbo", category: "Telefonia" },
  { term: "carregador turbo xiaomi", baseTerm: "carregador turbo", category: "Telefonia" },
  
  // Esporte - related to "garrafa térmica"
  { term: "garrafa térmica 1 litro", baseTerm: "garrafa térmica", category: "Esporte e Lazer" },
  { term: "garrafa térmica stanley", baseTerm: "garrafa térmica", category: "Esporte e Lazer" },
  { term: "garrafa térmica inox", baseTerm: "garrafa térmica", category: "Esporte e Lazer" },
  { term: "garrafa térmica academia", baseTerm: "garrafa térmica", category: "Esporte e Lazer" },
  { term: "garrafa térmica 2 litros", baseTerm: "garrafa térmica", category: "Esporte e Lazer" },
  
  // Automotivo - related to "suporte celular"
  { term: "suporte celular magnético", baseTerm: "suporte celular carro", category: "Automotivo" },
  { term: "suporte celular ar condicionado", baseTerm: "suporte celular carro", category: "Automotivo" },
  { term: "suporte celular painel", baseTerm: "suporte celular carro", category: "Automotivo" },
  { term: "suporte celular ventosa", baseTerm: "suporte celular carro", category: "Automotivo" },
  { term: "suporte celular universal", baseTerm: "suporte celular carro", category: "Automotivo" },
];

// All main categories
const MAIN_CATEGORIES = [
  "Acessórios",
  "Automotivo",
  "Bebês",
  "Beleza",
  "Casa",
  "Eletrônicos",
  "Esporte e Lazer",
  "Games",
  "Informática",
  "Moda",
  "Pet",
  "Saúde",
  "Telefonia",
];

export default function TrendsLiteTool() {
  const { t } = useTranslation('tools');
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSubcategory, setSelectedSubcategory] = useState("all");
  const [sortBy, setSortBy] = useState<'popularity' | 'growth'>('popularity');

  // Get subcategories based on selected category
  const subcategories = useMemo(() => {
    if (selectedCategory === "all") return [];
    const subs = TRENDS_DATA
      .filter(item => item.category === selectedCategory)
      .map(item => item.subcategory);
    return [...new Set(subs)].sort();
  }, [selectedCategory]);

  // Reset subcategory when category changes
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setSelectedSubcategory("all");
  };

  return (
    <ToolsLayout>
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            {t('trends.title')}
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t('trends.subtitle')}
          </p>
        </div>

        {/* Navigation Tabs */}
        <ToolsNavTabs />

        {/* Filters */}
        <TrendsLiteFilters
          categories={MAIN_CATEGORIES}
          subcategories={subcategories}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
          sortBy={sortBy}
          onCategoryChange={handleCategoryChange}
          onSubcategoryChange={setSelectedSubcategory}
          onSortChange={setSortBy}
        />

        {/* Three Sections Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Section 1: Buscas em Alta (Top 5 Keywords) */}
          <KeywordsSection 
            keywords={KEYWORDS_DATA}
            selectedCategory={selectedCategory}
          />

          {/* Section 2: Top Produtos em Destaque */}
          <TopProductsSection
            products={TRENDS_DATA}
            selectedCategory={selectedCategory}
            selectedSubcategory={selectedSubcategory}
          />

          {/* Section 3: Pesquisas Relacionadas */}
          <RelatedSearchesSection
            searches={RELATED_SEARCHES_DATA}
            selectedCategory={selectedCategory}
          />
        </div>

        {/* Disclaimer */}
        <Alert variant="default" className="bg-muted/50 border-muted">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm text-muted-foreground">
            {t('trends.disclaimer')}
          </AlertDescription>
        </Alert>

        {/* Promo Card */}
        <ToolsPromoCard />
      </div>
    </ToolsLayout>
  );
}
