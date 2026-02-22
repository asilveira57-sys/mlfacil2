
-- PARTE 2: Função sync + trigger + migração de dados

CREATE OR REPLACE FUNCTION public.sync_visual_group_to_templates(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group RECORD;
  v_template_id uuid;
  v_template_slug text;
  v_light_variant_id uuid;
  v_dark_variant_id uuid;
  v_rule_id uuid;
  v_light_tokens jsonb;
  v_dark_tokens jsonb;
BEGIN
  SELECT * INTO v_group FROM visual_category_groups WHERE id = p_group_id;
  IF v_group IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'group_not_found');
  END IF;

  v_template_slug := 'cat-' || v_group.slug;

  v_light_tokens := jsonb_build_object(
    'primary', v_group.gradiente_inicio,
    'primary_foreground', '0 0% 100%',
    'secondary', v_group.gradiente_fim,
    'secondary_foreground', '0 0% 100%',
    'gradient_primary', 'linear-gradient(135deg, ' || v_group.gradiente_inicio || ', ' || v_group.gradiente_fim || ')'
  );
  v_dark_tokens := v_light_tokens;

  SELECT id INTO v_template_id FROM templates WHERE source_group_id = p_group_id;
  IF v_template_id IS NULL THEN
    INSERT INTO templates (name, slug, description, scope, is_active, source_group_id, is_system_default)
    VALUES (v_group.nome, v_template_slug, 'Gerado do grupo visual: ' || v_group.nome, 'category', v_group.ativo, p_group_id, false)
    RETURNING id INTO v_template_id;
  ELSE
    UPDATE templates SET name = v_group.nome, slug = v_template_slug, is_active = v_group.ativo, updated_at = now()
    WHERE id = v_template_id;
  END IF;

  SELECT id INTO v_light_variant_id FROM template_variants WHERE template_id = v_template_id AND variant_key = 'light';
  IF v_light_variant_id IS NULL THEN
    INSERT INTO template_variants (template_id, variant_key, design_tokens, overlay_url, overlay_opacity, intensity)
    VALUES (v_template_id, 'light', v_light_tokens, v_group.imagem_overlay_url, 0.85, v_group.intensidade_padrao);
  ELSE
    UPDATE template_variants SET design_tokens = v_light_tokens, overlay_url = v_group.imagem_overlay_url, intensity = v_group.intensidade_padrao, updated_at = now()
    WHERE id = v_light_variant_id;
  END IF;

  SELECT id INTO v_dark_variant_id FROM template_variants WHERE template_id = v_template_id AND variant_key = 'dark';
  IF v_dark_variant_id IS NULL THEN
    INSERT INTO template_variants (template_id, variant_key, design_tokens, overlay_url, overlay_opacity, intensity)
    VALUES (v_template_id, 'dark', v_dark_tokens, v_group.imagem_overlay_url, 0.85, v_group.intensidade_padrao);
  ELSE
    UPDATE template_variants SET design_tokens = v_dark_tokens, overlay_url = v_group.imagem_overlay_url, intensity = v_group.intensidade_padrao, updated_at = now()
    WHERE id = v_dark_variant_id;
  END IF;

  SELECT id INTO v_rule_id FROM template_rules WHERE source_group_id = p_group_id;
  IF v_rule_id IS NULL THEN
    INSERT INTO template_rules (template_id, rule_type, priority, is_enabled, category_key, match_categories, source_group_id)
    VALUES (v_template_id, 'category', v_group.prioridade, v_group.ativo, v_group.slug, v_group.categorias_ml, p_group_id);
  ELSE
    UPDATE template_rules SET template_id = v_template_id, priority = v_group.prioridade, is_enabled = v_group.ativo,
      category_key = v_group.slug, match_categories = v_group.categorias_ml, updated_at = now()
    WHERE id = v_rule_id;
  END IF;

  INSERT INTO system_logs (system_area, action, success, message, meta_json)
  VALUES ('visual_identity', 'sync_group_to_template', true,
    'Sincronizado grupo "' || v_group.nome || '" para template',
    jsonb_build_object('group_id', p_group_id, 'template_id', v_template_id, 'slug', v_template_slug, 'is_active', v_group.ativo));

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id, 'slug', v_template_slug);
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_visual_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM sync_visual_group_to_templates(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visual_group_sync ON public.visual_category_groups;
CREATE TRIGGER trg_visual_group_sync
  AFTER INSERT OR UPDATE ON public.visual_category_groups
  FOR EACH ROW EXECUTE FUNCTION public.trigger_sync_visual_group();

-- Migrar grupos existentes
DO $$
DECLARE
  v_group RECORD;
BEGIN
  FOR v_group IN SELECT id FROM visual_category_groups WHERE ativo = true ORDER BY prioridade
  LOOP
    PERFORM sync_visual_group_to_templates(v_group.id);
  END LOOP;
END;
$$;
