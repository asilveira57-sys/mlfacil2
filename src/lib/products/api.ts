import { supabase } from "@/integrations/supabase/client";

export interface LearnedListing {
  id: string;
  workspace_id: string;
  source: string;
  source_item_id: string;
  source_url: string | null;
  title: string | null;
  category_id: string | null;
  category_name: string | null;
  currency_id: string | null;
  condition: string | null;
  listing_type_id: string | null;
  price: number | null;
  original_price: number | null;
  is_catalog_listing: boolean;
  catalog_product_id: string | null;
  seller_id: string | null;
  seller_nickname: string | null;
  shipping_mode: string | null;
  shipping_free: boolean;
  available_quantity: number | null;
  sold_quantity: number | null;
  permalink: string | null;
  description: string | null;
  raw_payload: any;
  imported_at: string;
  imported_by: string | null;
  created_at: string;
  pictures?: LearnedListingPicture[];
  attributes?: LearnedListingAttribute[];
  variations?: LearnedListingVariation[];
}

export interface LearnedListingPicture {
  id: string;
  learned_listing_id: string;
  source_picture_id: string | null;
  source_url: string;
  storage_url: string | null;
  sort_order: number;
  is_cover: boolean;
}

export interface LearnedListingAttribute {
  id: string;
  learned_listing_id: string;
  attribute_id: string;
  name: string;
  value_name: string | null;
  value_id: string | null;
  value_struct: any;
  unit: string | null;
  scope: 'item' | 'variation';
  variation_id: string | null;
  is_required: boolean;
  is_valid: boolean;
  notes: string | null;
}

export interface LearnedListingVariation {
  id: string;
  learned_listing_id: string;
  source_variation_id: string | null;
  price: number | null;
  available_quantity: number | null;
  sold_quantity: number | null;
  sku: string | null;
  gtin: string | null;
  attributes: any;
  picture_ids: string[] | null;
}

export interface ProductRecord {
  id: string;
  workspace_id: string;
  name_internal: string;
  source_learned_listing_id: string | null;
  target_site: string;
  target_category_id: string | null;
  target_category_name: string | null;
  brand: string | null;
  model: string | null;
  status: 'draft' | 'ready' | 'published' | 'error';
  default_currency: string;
  default_condition: string;
  default_listing_type: string;
  completeness_score: number;
  validation_errors: any;
  published_item_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  variants?: ProductVariant[];
  assets?: ProductAsset[];
  attributes?: ProductAttributeMap[];
}

export interface ProductVariant {
  id: string;
  product_record_id: string;
  sku_internal: string | null;
  price: number;
  compare_at_price: number | null;
  available_quantity: number;
  gtin: string | null;
  variant_attributes: any;
  status: 'active' | 'inactive' | 'out_of_stock';
  sort_order: number;
}

export interface ProductAsset {
  id: string;
  product_record_id: string;
  variant_id: string | null;
  asset_type: 'image' | 'video' | 'document';
  source: 'imported' | 'uploaded' | 'generated';
  source_url: string | null;
  storage_url: string | null;
  file_name: string | null;
  sort_order: number;
  is_cover: boolean;
}

export interface ProductAttributeMap {
  id: string;
  product_record_id: string;
  attribute_id: string;
  name: string;
  value_id: string | null;
  value_name: string | null;
  value_struct: any;
  unit: string | null;
  scope: 'item' | 'variation';
  required_level: 'required' | 'recommended' | 'optional';
  filled_by: 'import' | 'user' | 'rule' | 'suggestion';
  validation_status: 'ok' | 'missing' | 'invalid';
  validation_message: string | null;
  allowed_values: any;
}

export interface PublicationJob {
  id: string;
  workspace_id: string;
  ml_account_id: string;
  product_record_id: string;
  action: 'create_item' | 'update_item' | 'link_catalog';
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  request_summary: any;
  response_summary: any;
  published_item_id: string | null;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

// ===== API Functions =====

function extractMeliItemIdFromUrl(input: string): string | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim();

  const pdpMatch = trimmed.match(/pdp_filters=item_id[:%3A]+(MLB\d{8,})/i);
  if (pdpMatch) return pdpMatch[1].toUpperCase();

  const itemIdMatch = trimmed.match(/item_id[=:](MLB\d{8,})/i);
  if (itemIdMatch) return itemIdMatch[1].toUpperCase();

  const pathMatch = trimmed.match(/\/(MLB\d{8,})/i);
  if (pathMatch) return pathMatch[1].toUpperCase();

  const queryMatch = trimmed.match(/[?&]id=(MLB\d{8,})/i);
  if (queryMatch) return queryMatch[1].toUpperCase();

  const anyMlbMatch = trimmed.match(/(?:^|[^A-Z])(MLB\d{8,})(?:[^0-9]|$)/i);
  if (anyMlbMatch) return anyMlbMatch[1].toUpperCase();

  return null;
}

async function safeFetchJson(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Mercado Livre ${res.status} (${url})`);
  }
  return text ? JSON.parse(text) : null;
}

async function fetchMeliBundle(itemId: string) {
  const item = await safeFetchJson(`https://api.mercadolibre.com/items/${itemId}`);

  let categoryData: any = null;
  let categoryAttributes: any[] = [];
  let description = '';
  let sellerNickname = '';

  try {
    categoryData = await safeFetchJson(`https://api.mercadolibre.com/categories/${item.category_id}`);
  } catch {
    // optional
  }

  try {
    categoryAttributes = await safeFetchJson(`https://api.mercadolibre.com/categories/${item.category_id}/attributes`);
  } catch {
    // optional
  }

  try {
    const desc = await safeFetchJson(`https://api.mercadolibre.com/items/${itemId}/description`);
    description = desc?.plain_text || desc?.text || '';
  } catch {
    // optional
  }

  try {
    const seller = await safeFetchJson(`https://api.mercadolibre.com/users/${item.seller_id}`);
    sellerNickname = seller?.nickname || '';
  } catch {
    // optional
  }

  return { item, categoryData, categoryAttributes, description, sellerNickname };
}

async function importListingDirect(url: string, workspaceId: string) {
  const itemId = extractMeliItemIdFromUrl(url);
  if (!itemId) {
    throw new Error('Não foi possível extrair o ID do anúncio da URL fornecida');
  }

  const bundle = await fetchMeliBundle(itemId);

  const { data, error } = await supabase.functions.invoke('learn-listing-save', {
    body: {
      workspaceId,
      url,
      itemId,
      itemData: bundle.item,
      categoryData: bundle.categoryData,
      categoryAttributes: bundle.categoryAttributes,
      description: bundle.description,
      sellerNickname: bundle.sellerNickname,
    },
  });

  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Falha ao salvar anúncio (modo direto)');
  return data;
}

export async function importListingFromUrl(url: string, workspaceId: string) {
  // 1) Try via backend (preferred)
  const { data, error } = await supabase.functions.invoke('learn-listing', {
    body: { url, workspaceId },
  });

  // If the backend fetch was blocked (403), fallback to direct browser fetch + save.
  if (error) {
    const status = (error as any)?.context?.status;
    const msg = String((error as any)?.message || error);
    if (status === 403 || /\b403\b/.test(msg)) {
      return importListingDirect(url, workspaceId);
    }
    throw error;
  }

  // Some backends may return structured errors but with 200.
  if (data?.success === true) return data;

  const apiStatus = data?.api_status;
  if (apiStatus === 403) {
    return importListingDirect(url, workspaceId);
  }

  throw new Error(data?.error || 'Falha ao importar anúncio');
}

export async function getLearnedListings(workspaceId: string): Promise<LearnedListing[]> {
  const { data, error } = await supabase
    .from('learned_listings')
    .select(`
      *,
      pictures:learned_listing_pictures(*),
      attributes:learned_listing_attributes(*),
      variations:learned_listing_variations(*)
    `)
    .eq('workspace_id', workspaceId)
    .order('imported_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as LearnedListing[];
}

export async function getLearnedListing(id: string): Promise<LearnedListing | null> {
  const { data, error } = await supabase
    .from('learned_listings')
    .select(`
      *,
      pictures:learned_listing_pictures(*),
      attributes:learned_listing_attributes(*),
      variations:learned_listing_variations(*)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as unknown as LearnedListing;
}

export async function deleteLearnedListing(id: string) {
  const { error } = await supabase
    .from('learned_listings')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function createProductRecord(learnedListingId: string, nameInternal?: string) {
  const { data, error } = await supabase.functions.invoke('create-product-record', {
    body: { learnedListingId, nameInternal },
  });

  if (error) throw error;
  return data;
}

export async function getProductRecords(workspaceId: string): Promise<ProductRecord[]> {
  const { data, error } = await supabase
    .from('product_records')
    .select(`
      *,
      variants:product_variants(*),
      assets:product_assets(*),
      attributes:product_attribute_map(*)
    `)
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as ProductRecord[];
}

export async function getProductRecord(id: string): Promise<ProductRecord | null> {
  const { data, error } = await supabase
    .from('product_records')
    .select(`
      *,
      variants:product_variants(*),
      assets:product_assets(*),
      attributes:product_attribute_map(*)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as unknown as ProductRecord;
}

export async function updateProductRecord(id: string, updates: Partial<ProductRecord>) {
  const { data, error } = await supabase
    .from('product_records')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProductRecord(id: string) {
  const { error } = await supabase
    .from('product_records')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function validateProductRecord(productRecordId: string) {
  const { data, error } = await supabase.functions.invoke('validate-product-record', {
    body: { productRecordId },
  });

  if (error) throw error;
  return data;
}

export async function publishToMl(productRecordId: string, mlAccountId: string, listingType?: string) {
  const { data, error } = await supabase.functions.invoke('publish-to-ml', {
    body: { productRecordId, mlAccountId, listingType },
  });

  if (error) throw error;
  return data;
}

export async function getPublicationJobs(productRecordId: string): Promise<PublicationJob[]> {
  const { data, error } = await supabase
    .from('ml_publication_jobs')
    .select('*')
    .eq('product_record_id', productRecordId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as PublicationJob[];
}

export async function updateProductAttribute(id: string, updates: Partial<ProductAttributeMap>) {
  const { data, error } = await supabase
    .from('product_attribute_map')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProductVariant(id: string, updates: Partial<ProductVariant>) {
  const { data, error } = await supabase
    .from('product_variants')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
