import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────
export interface BrEstado {
  uf: string;
  codigo_uf: number;
  nome: string;
  regiao: string | null;
}

export interface BrMunicipio {
  codigo_ibge: number;
  nome: string;
  capital: boolean;
  uf: string;
  ddd: number | null;
  fuso_horario: string | null;
}

export interface BrFeriado {
  id: string;
  data: string;
  nome: string;
  tipo: string;
  descricao: string | null;
  uf: string | null;
  codigo_ibge: number | null;
  ano: number;
}

// ─────────────────────────────────────────
// Fetch all rows helper (pagination para >1000)
// ─────────────────────────────────────────
async function fetchAllRowsFromTable<T>(
  table: string,
  filters: Record<string, string>,
  orderBy: string
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const all: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = (supabase as any).from(table).select('*');
    for (const [col, val] of Object.entries(filters)) {
      query = query.eq(col, val);
    }
    query = query.order(orderBy).range(from, from + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      all.push(...data);
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    }
  }
  return all;
}

// ─────────────────────────────────────────
// HOOK: Todos os estados (27 registros)
// ─────────────────────────────────────────
export function useBrEstados() {
  return useQuery({
    queryKey: ['br_estados'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('br_estados')
        .select('*')
        .order('nome');
      if (error) throw error;
      return (data ?? []) as BrEstado[];
    },
    staleTime: 60 * 60 * 1000,
  });
}

// ─────────────────────────────────────────
// HOOK: Municípios por UF (com paginação)
// ─────────────────────────────────────────
export function useBrMunicipios(uf: string | null | undefined) {
  return useQuery({
    queryKey: ['br_municipios', uf],
    queryFn: async () => {
      if (!uf) return [];
      return fetchAllRowsFromTable<BrMunicipio>(
        'br_municipios',
        { uf },
        'nome'
      );
    },
    enabled: !!uf,
    staleTime: 60 * 60 * 1000,
  });
}

// ─────────────────────────────────────────
// HOOK: Feriados do mês (filtrados por localização)
// ─────────────────────────────────────────
export function useBrFeriados(
  currentMonth: Date,
  uf: string | null | undefined,
  codigoIbge: number | null | undefined
) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth() + 1;
  const monthStr = String(month).padStart(2, '0');
  const from = `${year}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
  const qc = useQueryClient();
  const fetchedRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ['br_feriados', from, to, uf, codigoIbge],
    queryFn: async () => {
      // Build OR filter: NACIONAL always + ESTADUAL if uf + MUNICIPAL if codigo_ibge
      const filters: string[] = ['tipo.eq.NACIONAL'];
      if (uf) {
        filters.push(`and(tipo.eq.ESTADUAL,uf.eq.${uf})`);
      }
      if (codigoIbge) {
        filters.push(`and(tipo.eq.MUNICIPAL,codigo_ibge.eq.${codigoIbge})`);
      }

      const { data, error } = await (supabase as any)
        .from('br_feriados')
        .select('*')
        .gte('data', from)
        .lte('data', to)
        .or(filters.join(','));

      if (error) throw error;
      return (data ?? []) as BrFeriado[];
    },
    staleTime: 30 * 60 * 1000,
  });

  // Auto-fetch municipal holidays from API if none exist for this municipality+year
  useEffect(() => {
    if (!codigoIbge || !query.data) return;
    const key = `${codigoIbge}-${year}`;
    if (fetchedRef.current === key) return;

    const hasMunicipal = query.data.some((f) => f.tipo === 'MUNICIPAL');
    if (hasMunicipal) {
      fetchedRef.current = key;
      return;
    }

    // No municipal holidays found — fetch from complementary API
    fetchedRef.current = key;
    supabase.functions.invoke('fetch-municipal-holidays', {
      body: { codigo_ibge: codigoIbge, ano: year },
    }).then(({ error }) => {
      if (!error) {
        // Refetch holidays after new data inserted
        qc.invalidateQueries({ queryKey: ['br_feriados'] });
      }
    });
  }, [codigoIbge, year, query.data, qc]);

  return query;
}
