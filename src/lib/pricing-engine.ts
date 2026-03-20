/**
 * Pricing Engine — Central calculation service for ML marketplace simulator.
 * 
 * Sources:
 * - Freight: ML official table for MercadoLíder / reputação verde / sem reputação
 *   https://www.mercadolivre.com.br/ajuda/custos-envio-reputacao-verde-mercado-lider_40538
 * - Commission: Static fallback data per category/listing_type
 * - Fixed cost: Simplified R$ 6 (Premium) / R$ 5 (Clássico)
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SimulationInput {
  productName: string;
  description: string;
  categoryId: string;
  categoryName: string;
  listingType: 'gold_pro' | 'gold_special';
  salePrice: number;
  productCost: number;
  weightKg: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  packagingCost: number;
  otherCosts: number;
  reputation: 'green' | 'yellow' | 'none';
}

export interface SimulationResult {
  volumetricWeightKg: number;
  effectiveWeightKg: number;
  weightBand: string;
  priceBand: string;
  commissionPercent: number;
  commissionValue: number;
  fixedCostValue: number;
  freightValue: number;
  totalCost: number;
  netProfit: number;
  marginPercent: number;
  netReceived: number;
  breakevenPrice: number;
}

export interface ComparisonDiff {
  freightDiff: number;
  freightDiffPercent: number;
  commissionDiff: number;
  commissionDiffPercent: number;
  profitDiff: number;
  profitDiffPercent: number;
  marginDiff: number;
  netReceivedDiff: number;
  netReceivedDiffPercent: number;
}

// ─── ML Categories with commissions ────────────────────────────────────────────

export const ML_CATEGORIES = [
  { id: "MLB5672", name: "Acessórios para Veículos" },
  { id: "MLB1071", name: "Animais" },
  { id: "MLB1367", name: "Antiguidades e Coleções" },
  { id: "MLB1368", name: "Arte, Papelaria e Armarinho" },
  { id: "MLB1384", name: "Bebês" },
  { id: "MLB1246", name: "Beleza e Cuidado Pessoal" },
  { id: "MLB1132", name: "Brinquedos e Hobbies" },
  { id: "MLB1430", name: "Calçados, Roupas e Bolsas" },
  { id: "MLB1039", name: "Câmeras e Acessórios" },
  { id: "MLB1743", name: "Carros, Motos e Outros" },
  { id: "MLB1574", name: "Casa, Móveis e Decoração" },
  { id: "MLB1051", name: "Celulares e Telefones" },
  { id: "MLB1500", name: "Construção" },
  { id: "MLB5726", name: "Eletrodomésticos" },
  { id: "MLB1000", name: "Eletrônicos, Áudio e Vídeo" },
  { id: "MLB1276", name: "Esportes e Fitness" },
  { id: "MLB263532", name: "Ferramentas" },
  { id: "MLB12404", name: "Festas e Lembrancinhas" },
  { id: "MLB1144", name: "Games" },
  { id: "MLB1459", name: "Imóveis" },
  { id: "MLB1499", name: "Indústria e Comércio" },
  { id: "MLB1648", name: "Informática" },
  { id: "MLB218519", name: "Ingressos" },
  { id: "MLB1182", name: "Instrumentos Musicais" },
  { id: "MLB3937", name: "Joias e Relógios" },
  { id: "MLB1196", name: "Livros, Revistas e Comics" },
  { id: "MLB1168", name: "Música, Filmes e Seriados" },
  { id: "MLB264586", name: "Saúde" },
  { id: "MLB1540", name: "Serviços" },
  { id: "MLB1953", name: "Mais Categorias" },
] as const;

// Commission % by category and listing type
const COMMISSION_MAP: Record<string, { gold_pro: number; gold_special: number }> = {
  "MLB1051": { gold_pro: 16, gold_special: 12 },
  "MLB1000": { gold_pro: 14, gold_special: 11 },
  "MLB1430": { gold_pro: 16, gold_special: 13 },
  "MLB1246": { gold_pro: 16, gold_special: 13 },
  "MLB1574": { gold_pro: 14, gold_special: 11 },
  "MLB1384": { gold_pro: 15, gold_special: 12 },
  "MLB1648": { gold_pro: 13, gold_special: 10 },
  "MLB1276": { gold_pro: 14, gold_special: 11 },
  "MLB1144": { gold_pro: 13, gold_special: 10 },
  "MLB5726": { gold_pro: 12, gold_special: 9 },
  "MLB1071": { gold_pro: 14, gold_special: 11 },
  "MLB5672": { gold_pro: 14, gold_special: 11 },
  "MLB1132": { gold_pro: 16, gold_special: 13 },
  "MLB1039": { gold_pro: 13, gold_special: 10 },
  "MLB1500": { gold_pro: 14, gold_special: 11 },
  "MLB263532": { gold_pro: 14, gold_special: 11 },
  "MLB12404": { gold_pro: 16, gold_special: 13 },
  "MLB3937": { gold_pro: 16, gold_special: 13 },
  "MLB1196": { gold_pro: 16, gold_special: 13 },
  "MLB1182": { gold_pro: 14, gold_special: 11 },
  "MLB264586": { gold_pro: 16, gold_special: 13 },
  "MLB1168": { gold_pro: 14, gold_special: 11 },
  "MLB1367": { gold_pro: 16, gold_special: 13 },
  "MLB1368": { gold_pro: 16, gold_special: 13 },
  "MLB1743": { gold_pro: 13, gold_special: 10 },
  "MLB1459": { gold_pro: 14, gold_special: 11 },
  "MLB1499": { gold_pro: 14, gold_special: 11 },
  "MLB218519": { gold_pro: 14, gold_special: 11 },
  "MLB1540": { gold_pro: 14, gold_special: 11 },
  "MLB1953": { gold_pro: 16, gold_special: 13 },
};

// Default commission if category not found
const DEFAULT_COMMISSION = { gold_pro: 16, gold_special: 13 };

// ─── Fixed cost per sale ───────────────────────────────────────────────────────
// Simplified: Premium R$ 6.00, Classic R$ 5.00 for sales >= R$ 79
// For sales < R$ 79: no fixed cost
function getFixedCost(salePrice: number, listingType: 'gold_pro' | 'gold_special'): number {
  if (salePrice < 79) return 0;
  return listingType === 'gold_pro' ? 6.0 : 5.0;
}

// ─── Freight table ─────────────────────────────────────────────────────────────
// ML official: MercadoLíder / reputação verde / sem reputação
// Price bands: [0-18.99, 19-48.99, 49-78.99, 79-99.99, 100-119.99, 120-149.99, 150-199.99, 200+]

interface WeightBand {
  min: number;
  max: number | null;
  label: string;
}

const WEIGHT_BANDS: WeightBand[] = [
  { min: 0, max: 0.3, label: "Até 0,3 kg" },
  { min: 0.3, max: 0.5, label: "0,3 a 0,5 kg" },
  { min: 0.5, max: 1, label: "0,5 a 1 kg" },
  { min: 1, max: 1.5, label: "1 a 1,5 kg" },
  { min: 1.5, max: 2, label: "1,5 a 2 kg" },
  { min: 2, max: 3, label: "2 a 3 kg" },
  { min: 3, max: 4, label: "3 a 4 kg" },
  { min: 4, max: 5, label: "4 a 5 kg" },
  { min: 5, max: 6, label: "5 a 6 kg" },
  { min: 6, max: 7, label: "6 a 7 kg" },
  { min: 7, max: 8, label: "7 a 8 kg" },
  { min: 8, max: 9, label: "8 a 9 kg" },
  { min: 9, max: 11, label: "9 a 11 kg" },
  { min: 11, max: 13, label: "11 a 13 kg" },
  { min: 13, max: 15, label: "13 a 15 kg" },
  { min: 15, max: 17, label: "15 a 17 kg" },
  { min: 17, max: 20, label: "17 a 20 kg" },
  { min: 20, max: 25, label: "20 a 25 kg" },
  { min: 25, max: 30, label: "25 a 30 kg" },
  { min: 30, max: 40, label: "30 a 40 kg" },
  { min: 40, max: 50, label: "40 a 50 kg" },
  { min: 50, max: 60, label: "50 a 60 kg" },
  { min: 60, max: 70, label: "60 a 70 kg" },
  { min: 70, max: 80, label: "70 a 80 kg" },
  { min: 80, max: 90, label: "80 a 90 kg" },
  { min: 90, max: 100, label: "90 a 100 kg" },
  { min: 100, max: 125, label: "100 a 125 kg" },
  { min: 125, max: 150, label: "125 a 150 kg" },
  { min: 150, max: null, label: "Mais de 150 kg" },
];

interface PriceBand {
  min: number;
  max: number | null;
  label: string;
}

const PRICE_BANDS: PriceBand[] = [
  { min: 0, max: 18.99, label: "R$ 0 a R$ 18,99" },
  { min: 19, max: 48.99, label: "R$ 19 a R$ 48,99" },
  { min: 49, max: 78.99, label: "R$ 49 a R$ 78,99" },
  { min: 79, max: 99.99, label: "R$ 79 a R$ 99,99" },
  { min: 100, max: 119.99, label: "R$ 100 a R$ 119,99" },
  { min: 120, max: 149.99, label: "R$ 120 a R$ 149,99" },
  { min: 150, max: 199.99, label: "R$ 150 a R$ 199,99" },
  { min: 200, max: null, label: "A partir de R$ 200" },
];

// Freight cost matrix [weightBandIndex][priceBandIndex]
// Source: https://www.mercadolivre.com.br/ajuda/custos-envio-reputacao-verde-mercado-lider_40538
const FREIGHT_MATRIX: number[][] = [
  [5.65, 6.55, 7.75, 12.35, 14.35, 16.45, 18.45, 20.95],  // Até 0,3 kg
  [5.95, 6.65, 7.85, 13.25, 15.45, 17.65, 19.85, 22.55],  // 0,3 a 0,5 kg
  [6.05, 6.75, 7.95, 13.85, 16.15, 18.45, 20.75, 23.65],  // 0,5 a 1 kg
  [6.15, 6.85, 8.05, 14.15, 16.45, 18.85, 21.15, 24.65],  // 1 a 1,5 kg
  [6.25, 6.95, 8.15, 14.45, 16.85, 19.25, 21.65, 24.65],  // 1,5 a 2 kg
  [6.35, 7.95, 8.55, 15.75, 18.35, 21.05, 23.65, 26.25],  // 2 a 3 kg
  [6.45, 8.15, 8.95, 17.05, 19.85, 22.65, 25.55, 28.35],  // 3 a 4 kg
  [6.55, 8.35, 9.75, 18.45, 21.55, 24.65, 27.75, 30.75],  // 4 a 5 kg
  [6.65, 8.55, 9.95, 25.45, 28.55, 32.65, 35.75, 39.75],  // 5 a 6 kg
  [6.75, 8.75, 10.15, 27.05, 31.05, 36.05, 40.05, 44.05], // 6 a 7 kg
  [6.85, 8.95, 10.35, 28.85, 33.65, 38.45, 43.25, 48.05], // 7 a 8 kg
  [6.95, 9.15, 10.55, 29.65, 34.55, 39.55, 44.45, 49.35], // 8 a 9 kg
  [7.05, 9.55, 10.95, 41.25, 48.05, 54.95, 61.75, 68.65], // 9 a 11 kg
  [7.15, 9.95, 11.35, 42.15, 49.25, 56.25, 63.25, 70.25], // 11 a 13 kg
  [7.25, 10.15, 11.55, 45.05, 52.45, 59.95, 67.45, 74.95], // 13 a 15 kg
  [7.35, 10.35, 11.75, 48.55, 56.05, 63.55, 70.75, 78.65], // 15 a 17 kg
  [7.45, 10.55, 11.95, 54.75, 63.85, 72.95, 82.05, 91.15], // 17 a 20 kg
  [7.65, 10.95, 12.15, 64.05, 75.05, 84.75, 95.35, 105.95], // 20 a 25 kg
  [7.75, 11.15, 12.35, 65.95, 75.45, 85.55, 96.25, 106.95], // 25 a 30 kg
  [7.85, 11.35, 12.55, 67.75, 78.95, 88.95, 99.15, 107.05], // 30 a 40 kg
  [7.95, 11.55, 12.75, 70.25, 81.05, 92.05, 102.55, 110.75], // 40 a 50 kg
  [8.05, 11.75, 12.95, 74.95, 86.45, 98.15, 109.35, 118.15], // 50 a 60 kg
  [8.15, 11.95, 13.15, 80.25, 92.95, 105.05, 117.15, 126.55], // 60 a 70 kg
  [8.25, 12.15, 13.35, 83.95, 97.05, 109.85, 122.45, 132.25], // 70 a 80 kg
  [8.35, 12.35, 13.55, 93.25, 107.45, 122.05, 136.05, 146.95], // 80 a 90 kg
  [8.45, 12.55, 13.75, 106.55, 123.95, 139.55, 155.55, 167.95], // 90 a 100 kg
  [8.55, 12.75, 13.95, 119.25, 138.05, 156.05, 173.95, 187.95], // 100 a 125 kg
  [8.65, 12.75, 14.15, 126.55, 146.15, 165.65, 184.65, 199.45], // 125 a 150 kg
  [8.75, 12.95, 14.35, 166.15, 192.45, 217.55, 242.55, 261.95], // Mais de 150 kg
];

// ─── Core calculation functions ────────────────────────────────────────────────

function findWeightBandIndex(weightKg: number): number {
  for (let i = 0; i < WEIGHT_BANDS.length; i++) {
    const band = WEIGHT_BANDS[i];
    if (band.max === null) return i;
    if (weightKg <= band.max) return i;
  }
  return WEIGHT_BANDS.length - 1;
}

function findPriceBandIndex(price: number): number {
  for (let i = 0; i < PRICE_BANDS.length; i++) {
    const band = PRICE_BANDS[i];
    if (band.max === null) return i;
    if (price <= band.max) return i;
  }
  return PRICE_BANDS.length - 1;
}

export function calculateVolumetricWeight(heightCm: number, widthCm: number, lengthCm: number): number {
  if (heightCm <= 0 || widthCm <= 0 || lengthCm <= 0) return 0;
  return (heightCm * widthCm * lengthCm) / 6000;
}

export function getCommissionPercent(categoryId: string, listingType: 'gold_pro' | 'gold_special'): number {
  const entry = COMMISSION_MAP[categoryId] || DEFAULT_COMMISSION;
  return entry[listingType];
}

export function getFreightCost(weightKg: number, salePrice: number): number {
  if (weightKg <= 0 || salePrice <= 0) return 0;
  const wIdx = findWeightBandIndex(weightKg);
  const pIdx = findPriceBandIndex(salePrice);
  const cost = FREIGHT_MATRIX[wIdx]?.[pIdx] ?? 0;
  
  // ML rule: products < R$ 19 pay at most half the product price in freight
  if (salePrice < 19) {
    return Math.min(cost, salePrice / 2);
  }
  return cost;
}

// ─── Main simulation calculation ──────────────────────────────────────────────

export function calculateSimulation(input: SimulationInput): SimulationResult {
  const { salePrice, productCost, weightKg, heightCm, widthCm, lengthCm, 
          categoryId, listingType, packagingCost, otherCosts } = input;

  // Weight calculation
  const volumetricWeightKg = calculateVolumetricWeight(heightCm, widthCm, lengthCm);
  const effectiveWeightKg = Math.max(weightKg, volumetricWeightKg);
  
  // Band identification
  const wIdx = findWeightBandIndex(effectiveWeightKg > 0 ? effectiveWeightKg : weightKg);
  const pIdx = findPriceBandIndex(salePrice);
  const weightBand = WEIGHT_BANDS[wIdx]?.label ?? '';
  const priceBand = PRICE_BANDS[pIdx]?.label ?? '';

  // Commission
  const commissionPercent = getCommissionPercent(categoryId, listingType);
  const commissionValue = salePrice * (commissionPercent / 100);

  // Fixed cost
  const fixedCostValue = getFixedCost(salePrice, listingType);

  // Freight
  const freightWeight = effectiveWeightKg > 0 ? effectiveWeightKg : weightKg;
  const freightValue = getFreightCost(freightWeight, salePrice);

  // Total cost
  const totalCost = productCost + commissionValue + fixedCostValue + freightValue + packagingCost + otherCosts;

  // Profit and margin
  const netReceived = salePrice - commissionValue - fixedCostValue - freightValue;
  const netProfit = netReceived - productCost - packagingCost - otherCosts;
  const marginPercent = salePrice > 0 ? (netProfit / salePrice) * 100 : 0;

  // Breakeven: price where netProfit = 0
  // netProfit = salePrice - salePrice*(comm/100) - fixedCost - freight - productCost - packaging - other = 0
  // For breakeven, we need to iterate since freight depends on price
  const breakevenPrice = calculateBreakeven(productCost + packagingCost + otherCosts, categoryId, listingType, freightWeight);

  return {
    volumetricWeightKg: Math.round(volumetricWeightKg * 1000) / 1000,
    effectiveWeightKg: Math.round(Math.max(effectiveWeightKg, weightKg) * 1000) / 1000,
    weightBand,
    priceBand,
    commissionPercent,
    commissionValue: Math.round(commissionValue * 100) / 100,
    fixedCostValue,
    freightValue: Math.round(freightValue * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    marginPercent: Math.round(marginPercent * 100) / 100,
    netReceived: Math.round(netReceived * 100) / 100,
    breakevenPrice: Math.round(breakevenPrice * 100) / 100,
  };
}

function calculateBreakeven(
  fixedCosts: number, 
  categoryId: string, 
  listingType: 'gold_pro' | 'gold_special',
  weightKg: number
): number {
  // Binary search for breakeven price
  let low = 0;
  let high = fixedCosts * 10 + 1000;
  
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const comm = mid * (getCommissionPercent(categoryId, listingType) / 100);
    const fixed = getFixedCost(mid, listingType);
    const freight = getFreightCost(weightKg, mid);
    const profit = mid - comm - fixed - freight - fixedCosts;
    
    if (Math.abs(profit) < 0.01) return mid;
    if (profit < 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

// ─── Comparison ────────────────────────────────────────────────────────────────

export function compareSimulations(base: SimulationResult, variant: SimulationResult): ComparisonDiff {
  const safePct = (diff: number, base: number) => base !== 0 ? (diff / Math.abs(base)) * 100 : 0;
  
  return {
    freightDiff: Math.round((variant.freightValue - base.freightValue) * 100) / 100,
    freightDiffPercent: Math.round(safePct(variant.freightValue - base.freightValue, base.freightValue) * 100) / 100,
    commissionDiff: Math.round((variant.commissionValue - base.commissionValue) * 100) / 100,
    commissionDiffPercent: Math.round(safePct(variant.commissionValue - base.commissionValue, base.commissionValue) * 100) / 100,
    profitDiff: Math.round((variant.netProfit - base.netProfit) * 100) / 100,
    profitDiffPercent: Math.round(safePct(variant.netProfit - base.netProfit, base.netProfit) * 100) / 100,
    marginDiff: Math.round((variant.marginPercent - base.marginPercent) * 100) / 100,
    netReceivedDiff: Math.round((variant.netReceived - base.netReceived) * 100) / 100,
    netReceivedDiffPercent: Math.round(safePct(variant.netReceived - base.netReceived, base.netReceived) * 100) / 100,
  };
}

// ─── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_INPUT: SimulationInput = {
  productName: '',
  description: '',
  categoryId: '',
  categoryName: '',
  listingType: 'gold_pro',
  salePrice: 0,
  productCost: 0,
  weightKg: 0,
  heightCm: 0,
  widthCm: 0,
  lengthCm: 0,
  packagingCost: 0,
  otherCosts: 0,
  reputation: 'green',
};

export { WEIGHT_BANDS, PRICE_BANDS };
