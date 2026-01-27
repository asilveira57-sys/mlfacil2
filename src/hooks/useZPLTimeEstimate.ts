import { supabase } from "@/integrations/supabase/client";

// Tempos padrão por tipo de etiqueta (segundos por etiqueta)
const DEFAULT_TIMES: Record<string, number> = {
  'shopee': 0.5,
  'mercadolivre': 0.5,
  'magalu': 0.5,
  'full_volume': 0.5,
  'full_produto': 1.5,
};

interface ConversionRecord {
  label_type: string;
  label_subtype: string | null;
  label_count: number;
  width_mm: number;
  height_mm: number;
  duration_seconds: number;
}

export const useZPLTimeEstimate = () => {
  
  const getEstimate = async (
    labelType: string, 
    labelCount: number, 
    subtype?: string | null
  ): Promise<number> => {
    try {
      // Buscar média dos últimos 30 dias para este tipo de etiqueta
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      let query = supabase
        .from('zpl_conversion_history')
        .select('time_per_label')
        .eq('label_type', labelType)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });
      
      // Se tiver subtipo, filtrar também
      if (subtype) {
        query = query.eq('label_subtype', subtype);
      }
      
      const { data, error } = await query;
      
      if (error || !data || data.length === 0) {
        // Fallback para valores padrão
        return Math.ceil(labelCount * (DEFAULT_TIMES[labelType] || 1));
      }
      
      // Calcular média
      const times = data.map(d => Number(d.time_per_label)).filter(t => t > 0);
      if (times.length === 0) {
        return Math.ceil(labelCount * (DEFAULT_TIMES[labelType] || 1));
      }
      
      const avgTimePerLabel = times.reduce((a, b) => a + b, 0) / times.length;
      
      return Math.ceil(labelCount * avgTimePerLabel);
    } catch {
      // Em caso de erro, usar valor padrão
      return Math.ceil(labelCount * (DEFAULT_TIMES[labelType] || 1));
    }
  };

  const saveConversionTime = async (
    userId: string,
    record: ConversionRecord
  ): Promise<void> => {
    try {
      await supabase.from('zpl_conversion_history').insert({
        user_id: userId,
        label_type: record.label_type,
        label_subtype: record.label_subtype,
        label_count: record.label_count,
        width_mm: record.width_mm,
        height_mm: record.height_mm,
        duration_seconds: record.duration_seconds,
      });
    } catch (error) {
      console.error('Erro ao salvar tempo de conversão:', error);
    }
  };

  return { getEstimate, saveConversionTime };
};
