import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface ValidationIssue {
  type: 'error' | 'warning';
  category: 'attribute' | 'image' | 'price' | 'variation' | 'general';
  field?: string;
  message: string;
  suggestion?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { productRecordId } = await req.json();

    if (!productRecordId) {
      throw new Error('productRecordId é obrigatório');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get product record with all related data
    const { data: record, error: recordError } = await supabase
      .from('product_records')
      .select(`
        *,
        variants:product_variants(*),
        assets:product_assets(*),
        attributes:product_attribute_map(*)
      `)
      .eq('id', productRecordId)
      .single();

    if (recordError || !record) {
      return new Response(
        JSON.stringify({ error: 'Registro de produto não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', record.workspace_id)
      .single();

    if (!member) {
      return new Response(
        JSON.stringify({ error: 'Sem acesso ao workspace' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[validate-product-record] Validating: ${productRecordId}`);

    // Get category requirements
    const { data: requirements } = await supabase
      .from('category_attribute_requirements')
      .select('*')
      .eq('category_id', record.target_category_id)
      .eq('site_id', 'MLB');

    const issues: ValidationIssue[] = [];
    const requirementMap = new Map((requirements || []).map((r: any) => [r.attribute_id, r]));

    // ===== VALIDATE ATTRIBUTES =====
    const requiredAttrs = (requirements || []).filter((r: any) => r.required_level === 'required');
    
    for (const req of requiredAttrs) {
      const attr = record.attributes?.find((a: any) => a.attribute_id === req.attribute_id);
      
      if (!attr || (!attr.value_name && !attr.value_id)) {
        issues.push({
          type: 'error',
          category: 'attribute',
          field: req.name,
          message: `Atributo obrigatório "${req.name}" não preenchido`,
          suggestion: req.hint || undefined,
        });

        // Update attribute status
        if (attr) {
          await supabase
            .from('product_attribute_map')
            .update({ validation_status: 'missing', validation_message: 'Campo obrigatório' })
            .eq('id', attr.id);
        }
      } else {
        // Validate value format if has allowed_values
        if (req.allowed_values?.length > 0) {
          const validValues = req.allowed_values.map((v: any) => v.id || v.name);
          if (attr.value_id && !validValues.includes(attr.value_id)) {
            issues.push({
              type: 'error',
              category: 'attribute',
              field: req.name,
              message: `Valor inválido para "${req.name}"`,
              suggestion: `Valores permitidos: ${validValues.slice(0, 5).join(', ')}${validValues.length > 5 ? '...' : ''}`,
            });

            await supabase
              .from('product_attribute_map')
              .update({ validation_status: 'invalid', validation_message: 'Valor não permitido' })
              .eq('id', attr.id);
          } else {
            await supabase
              .from('product_attribute_map')
              .update({ validation_status: 'ok', validation_message: null })
              .eq('id', attr.id);
          }
        }
      }
    }

    // ===== VALIDATE IMAGES =====
    const images = record.assets?.filter((a: any) => a.asset_type === 'image') || [];
    
    if (images.length === 0) {
      issues.push({
        type: 'error',
        category: 'image',
        message: 'Nenhuma imagem cadastrada. É necessário pelo menos 1 imagem.',
      });
    } else if (images.length < 3) {
      issues.push({
        type: 'warning',
        category: 'image',
        message: `Apenas ${images.length} imagem(ns). Recomendamos pelo menos 3 imagens.`,
      });
    }

    const hasCover = images.some((img: any) => img.is_cover);
    if (images.length > 0 && !hasCover) {
      issues.push({
        type: 'warning',
        category: 'image',
        message: 'Nenhuma imagem definida como capa.',
      });
    }

    // Check for duplicate images by hash
    const hashes = images.filter((i: any) => i.file_hash).map((i: any) => i.file_hash);
    const duplicateHashes = hashes.filter((h: string, i: number) => hashes.indexOf(h) !== i);
    if (duplicateHashes.length > 0) {
      issues.push({
        type: 'warning',
        category: 'image',
        message: `${duplicateHashes.length} imagem(ns) duplicada(s) detectada(s).`,
      });
    }

    // ===== VALIDATE VARIANTS =====
    const variants = record.variants || [];
    
    if (variants.length === 0) {
      issues.push({
        type: 'error',
        category: 'variation',
        message: 'Nenhuma variação/SKU cadastrado.',
      });
    }

    for (const variant of variants) {
      if (!variant.price || variant.price <= 0) {
        issues.push({
          type: 'error',
          category: 'price',
          field: variant.sku_internal,
          message: `Variação "${variant.sku_internal}" sem preço válido.`,
        });
      }

      if (variant.available_quantity < 0) {
        issues.push({
          type: 'error',
          category: 'variation',
          field: variant.sku_internal,
          message: `Variação "${variant.sku_internal}" com estoque negativo.`,
        });
      }

      // Check GTIN if category requires it
      const gtinReq = requirementMap.get('GTIN');
      if (gtinReq?.required_level === 'required' && !variant.gtin) {
        issues.push({
          type: 'error',
          category: 'variation',
          field: variant.sku_internal,
          message: `Variação "${variant.sku_internal}" sem GTIN (obrigatório para esta categoria).`,
        });
      }
    }

    // ===== VALIDATE GENERAL =====
    if (!record.name_internal || record.name_internal.trim().length < 10) {
      issues.push({
        type: 'warning',
        category: 'general',
        message: 'Nome interno muito curto. Recomendamos pelo menos 10 caracteres.',
      });
    }

    if (!record.target_category_id) {
      issues.push({
        type: 'error',
        category: 'general',
        message: 'Categoria não definida.',
      });
    }

    // ===== CALCULATE SCORE =====
    const errors = issues.filter(i => i.type === 'error');
    const warnings = issues.filter(i => i.type === 'warning');

    let score = 100;
    score -= errors.length * 15;
    score -= warnings.length * 5;
    score = Math.max(0, Math.min(100, score));

    const isValid = errors.length === 0;
    const newStatus = isValid && score >= 80 ? 'ready' : 'draft';

    // Update product record
    await supabase
      .from('product_records')
      .update({
        completeness_score: score,
        validation_errors: issues.length > 0 ? { issues } : null,
        status: record.status === 'published' ? record.status : newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productRecordId);

    console.log(`[validate-product-record] Validation complete. Score: ${score}, Valid: ${isValid}`);

    return new Response(
      JSON.stringify({
        success: true,
        isValid,
        score,
        errors: errors.length,
        warnings: warnings.length,
        issues,
        status: newStatus,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[validate-product-record] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
