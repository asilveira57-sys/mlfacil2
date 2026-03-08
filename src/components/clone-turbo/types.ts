// Types for Mercado Turbo clone system

export type DraftStatus = 'draft' | 'ready' | 'error' | 'published';
export type OriginStatus = 'loading' | 'complete' | 'partial' | 'unavailable';

export interface OriginPayload {
  origin_status: OriginStatus;
  item_id?: string;
  title?: string;
  description?: string;
  price?: number;
  currency_id?: string;
  available_quantity?: number;
  condition?: string;
  category_id?: string;
  category_name?: string;
  listing_type_id?: string;
  pictures?: { id: string; url: string; secure_url: string }[];
  attributes?: { id: string; name?: string; value_name?: string }[];
  sku?: string;
  gtin?: string;
  package_height?: number;
  package_width?: number;
  package_length?: number;
  package_weight?: number;
  seller_id?: string;
  thumbnail?: string;
  catalog_product_id?: string;
  family_name?: string;
}

export interface UserPayload {
  title?: string;
  description?: string;
  price?: number | string;
  available_quantity?: number | string;
  condition?: string;
  category_id?: string;
  listing_type_id?: string;
  pictures?: { id: string; url: string; secure_url: string }[];
  attributes?: { id: string; name?: string; value_name?: string }[];
  sku?: string;
  gtin?: string;
  package_height?: number | string;
  package_width?: number | string;
  package_length?: number | string;
  package_weight?: number | string;
  family_name?: string;
}

export interface CloneDraft {
  id: string;
  correlation_id: string;
  source_item_id: string;
  status: DraftStatus;
  origin_payload: OriginPayload;
  user_payload: UserPayload;
  last_error_payload?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FieldError {
  field: string;
  message: string;
  cause?: string;
}

// Map ML API error causes to form fields
export function mapErrorToFields(errorBody: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  const causes = (errorBody.cause as any[]) || [];
  const message = (errorBody.message as string) || '';
  const error = (errorBody.error as string) || '';
  const combined = `${message} ${error}`.toLowerCase();

  // Special handling for title_invalid_fields_exhausted
  if (error === 'title_invalid_fields_exhausted' || combined.includes('rejeitou o campo título')) {
    const finalAttempt = errorBody.final_attempt as string || '';
    errors.push({
      field: 'title',
      message: `Esta categoria não aceita título neste fluxo. Tente ajustar categoria/family_name.${finalAttempt ? ` (última tentativa: ${finalAttempt})` : ''}`,
      cause: 'title_invalid_fields_exhausted',
    });
    errors.push({
      field: 'category_id',
      message: 'Considere trocar a categoria — a atual rejeita o título enviado.',
      cause: 'title_invalid_fields_exhausted',
    });
    return errors;
  }

  // Check if invalid_fields mentions title specifically
  if (combined.includes('invalid_fields') && combined.includes('title')) {
    const finalAttempt = errorBody.final_attempt as string || '';
    errors.push({
      field: 'title',
      message: `Campo título rejeitado pela categoria. Tente ajustar categoria/family_name.${finalAttempt ? ` (tentativa: ${finalAttempt})` : ''}`,
      cause: 'title_invalid_fields',
    });
  }

  for (const cause of causes) {
    const code = (cause.code || cause.type || '').toLowerCase();
    const msg = cause.message || cause.description || code;

    if (code.includes('category')) errors.push({ field: 'category_id', message: msg, cause: code });
    else if (code.includes('picture') || code.includes('image')) errors.push({ field: 'pictures', message: msg, cause: code });
    else if (code.includes('gtin') || code.includes('ean')) errors.push({ field: 'gtin', message: msg, cause: code });
    else if (code.includes('sku')) errors.push({ field: 'sku', message: msg, cause: code });
    else if (code.includes('title')) errors.push({ field: 'title', message: msg, cause: code });
    else if (code.includes('price')) errors.push({ field: 'price', message: msg, cause: code });
    else if (code.includes('dimension') || code.includes('height') || code.includes('width') || code.includes('length') || code.includes('weight'))
      errors.push({ field: 'dimensions', message: msg, cause: code });
    else if (code.includes('attribute')) errors.push({ field: 'attributes', message: msg, cause: code });
    else if (code.includes('description')) errors.push({ field: 'description', message: msg, cause: code });
    else errors.push({ field: '_general', message: msg, cause: code });
  }

  if (errors.length === 0 && (message || error)) {
    errors.push({ field: '_general', message: message || error });
  }

  return errors;
}

// Merge: user_payload takes priority, falls back to origin_payload
export function buildMergedPayload(origin: OriginPayload, user: UserPayload) {
  const str = (v: string | undefined | null) => v && v.trim() ? v.trim() : undefined;
  const num = (v: number | string | undefined | null) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return isNaN(n) || n <= 0 ? undefined : n;
  };

  const title = str(user.title) || str(origin.title);
  const description = str(user.description) || str(origin.description);
  const price = num(user.price) || num(origin.price);
  const available_quantity = num(user.available_quantity) || num(origin.available_quantity) || 1;
  const condition = str(user.condition) || str(origin.condition) || 'new';
  const category_id = str(user.category_id) || str(origin.category_id);
  const listing_type_id = str(user.listing_type_id) || str(origin.listing_type_id) || 'gold_special';
  const pictures = (user.pictures && user.pictures.length > 0) ? user.pictures : origin.pictures;
  const attributes = (user.attributes && user.attributes.length > 0) ? user.attributes : origin.attributes;
  
  const package_height = num(user.package_height) || num(origin.package_height);
  const package_width = num(user.package_width) || num(origin.package_width);
  const package_length = num(user.package_length) || num(origin.package_length);
  const package_weight = num(user.package_weight) || num(origin.package_weight);

  return {
    title,
    description,
    price,
    available_quantity,
    condition,
    category_id,
    listing_type_id,
    pictures: pictures || [],
    attributes: attributes || [],
    package_height,
    package_width,
    package_length,
    package_weight,
    sku: str(user.sku) || str(origin.sku),
    gtin: str(user.gtin) || str(origin.gtin),
    family_name: str(user.family_name) || str(origin.family_name),
  };
}
