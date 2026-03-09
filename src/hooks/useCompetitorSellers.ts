import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ResolvedSeller } from '@/lib/meli/resolveSellerFromLink';

export interface CompetitorSeller {
  id: string;
  user_id: string;
  seller_id: string;
  ml_seller_id: string;
  ml_nickname: string | null;
  user_alias: string | null;
  seller_reputation: any;
  total_items_tracked: number;
  last_synced_at: string | null;
  next_sync_at: string | null;
  sync_interval_hours: number;
  status: string;
  binding_date: string;
  created_at: string;
  updated_at: string;
}

export interface CompetitorSellerItem {
  id: string;
  competitor_seller_id: string;
  item_id: string;
  title: string | null;
  thumbnail: string | null;
  price: number | null;
  original_price: number | null;
  sold_quantity_ref: number;
  available_qty_ref: number;
  category_id: string | null;
  listing_type: string | null;
  condition: string | null;
  status: string;
  permalink: string | null;
  free_shipping: boolean;
  catalog_listing: boolean;
  last_synced_at: string | null;
}

export interface SellerDetail {
  seller: CompetitorSeller;
  items: CompetitorSellerItem[];
  deltas: Record<string, { sales_delta: number; price_change: number; first_seen: string }>;
}

export interface CompetitorSalesReportDay {
  date: string; // YYYY-MM-DD
  estimated_sales: number;
  items_with_data: number;
}

export interface SellerPreview {
  ml_seller_id: string;
  ml_nickname: string;
  reputation: any;
  total_items: number;
}

export function useCompetitorSellers(sellerId: string) {
  const [sellers, setSellers] = useState<CompetitorSeller[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const invoke = useCallback(async (body: any) => {
    const { data, error } = await supabase.functions.invoke('competitor-seller-sync', { body });
    if (error) throw error;
    return data;
  }, []);

  const fetchSellers = useCallback(async (status: string = 'ativo') => {
    setLoading(true);
    try {
      const data = await invoke({ action: 'list', seller_id: sellerId, status });
      setSellers(data.sellers || []);
    } catch (e) {
      console.error('fetchSellers error:', e);
      toast.error('Erro ao carregar sellers monitorados');
    } finally {
      setLoading(false);
    }
  }, [sellerId, invoke]);

  const previewSeller = useCallback(async (input: string): Promise<SellerPreview | null> => {
    try {
      const data = await invoke({ action: 'preview', input, seller_id: sellerId });
      return data;
    } catch (e) {
      console.error('previewSeller error:', e);
      toast.error('Erro ao buscar dados do seller');
      return null;
    }
  }, [sellerId, invoke]);

  const addSeller = useCallback(async (input: string, userAlias?: string) => {
    try {
      const data = await invoke({ action: 'add', seller_id: sellerId, input, user_alias: userAlias });
      if (data.error) {
        toast.error(data.error);
        return false;
      }
      toast.success(`Seller adicionado com ${data.items_count} anúncios`);
      await fetchSellers();
      return true;
    } catch (e) {
      console.error('addSeller error:', e);
      toast.error('Erro ao adicionar seller');
      return false;
    }
  }, [sellerId, invoke, fetchSellers]);

  /** Add seller using pre-resolved data from client-side resolution */
  const addSellerResolved = useCallback(async (resolved: ResolvedSeller, userAlias?: string) => {
    try {
      // Send numeric seller_id directly — edge function skips resolution
      const data = await invoke({
        action: 'add',
        seller_id: sellerId,
        input: resolved.ml_seller_id,
        user_alias: userAlias,
      });
      if (data.error) {
        toast.error(data.error);
        return false;
      }
      toast.success(`Seller adicionado com ${data.items_count} anúncios`);
      await fetchSellers();
      return true;
    } catch (e) {
      console.error('addSellerResolved error:', e);
      toast.error('Erro ao adicionar seller');
      return false;
    }
  }, [sellerId, invoke, fetchSellers]);

  const syncSeller = useCallback(async (competitorSellerId: string) => {
    setSyncing(competitorSellerId);
    try {
      await invoke({ action: 'sync', seller_id: sellerId, competitor_seller_id: competitorSellerId });
      toast.success('Sincronização concluída');
      await fetchSellers();
    } catch (e) {
      console.error('syncSeller error:', e);
      toast.error('Erro ao sincronizar');
    } finally {
      setSyncing(null);
    }
  }, [sellerId, invoke, fetchSellers]);

  const getDetail = useCallback(async (competitorSellerId: string): Promise<SellerDetail | null> => {
    try {
      const data = await invoke({ action: 'detail', seller_id: sellerId, competitor_seller_id: competitorSellerId });
      return data;
    } catch (e) {
      console.error('getDetail error:', e);
      toast.error('Erro ao carregar detalhes');
      return null;
    }
  }, [sellerId, invoke]);

  const updateAlias = useCallback(async (competitorSellerId: string, alias: string) => {
    try {
      await invoke({ action: 'update_alias', seller_id: sellerId, competitor_seller_id: competitorSellerId, user_alias: alias });
      toast.success('Apelido atualizado');
      await fetchSellers();
    } catch (e) {
      console.error('updateAlias error:', e);
      toast.error('Erro ao atualizar apelido');
    }
  }, [sellerId, invoke, fetchSellers]);

  const deleteSeller = useCallback(async (competitorSellerId: string) => {
    try {
      await invoke({ action: 'delete', seller_id: sellerId, competitor_seller_id: competitorSellerId });
      toast.success('Seller removido');
      await fetchSellers();
    } catch (e) {
      console.error('deleteSeller error:', e);
      toast.error('Erro ao remover seller');
    }
  }, [sellerId, invoke, fetchSellers]);

  const getSalesReport = useCallback(async (competitorSellerId: string, days: number = 7): Promise<CompetitorSalesReportDay[]> => {
    try {
      const data = await invoke({ action: 'sales_report', seller_id: sellerId, competitor_seller_id: competitorSellerId, days });
      return data.days || [];
    } catch (e) {
      console.error('getSalesReport error:', e);
      toast.error('Erro ao carregar relatório de vendas');
      return [];
    }
  }, [sellerId, invoke]);

  return {
    sellers,
    loading,
    syncing,
    fetchSellers,
    previewSeller,
    addSeller,
    addSellerResolved,
    syncSeller,
    getDetail,
    getSalesReport,
    updateAlias,
    deleteSeller,
  };
}
