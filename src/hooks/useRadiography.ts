import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ListingSnapshot {
  item_id: string;
  title: string;
  price: number;
  status: string;
  score_total: number;
  score_semantica: number;
  score_visual: number;
  score_clip: number;
  score_competitividade: number;
  score_logistica: number;
  score_performance: number;
  visits_7d: number;
  sales_7d: number;
  conversion_rate_7d: number;
  available_quantity: number;
  logistic_type: string;
  catalog_product_id: string | null;
  snapshot_date: string;
  thumbnail?: string;
  permalink?: string;
}

export interface ListingEvent {
  id: string;
  item_id: string;
  event_type: string;
  event_category: string;
  origin: string;
  severity: string;
  state_before: any;
  state_after: any;
  blocks_affected: string[];
  score_delta: any;
  impact_direction: string;
  observation_pt: string;
  detected_at: string;
}

export interface Radiography {
  id: string;
  item_id: string;
  analysis_date: string;
  period_analyzed_days: number;
  score_breakdown: any;
  narrative_pt: string;
  period_summary: string;
  suggested_actions: any[];
  event_timeline: any[];
  cause_effect_insights: any[];
}

export interface MonitorStatus {
  config: {
    auto_monitor_enabled: boolean;
    last_snapshot_at: string | null;
    total_items_monitored: number;
  };
  stats: {
    total_snapshots: number;
    total_events: number;
    items_with_radiography: number;
  };
  critical_events: ListingEvent[];
}

export function useRadiography(sellerId: string | null) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ListingSnapshot[]>([]);
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [events, setEvents] = useState<ListingEvent[]>([]);
  const [radiography, setRadiography] = useState<Radiography | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!sellerId) return;
    try {
      const { data, error } = await supabase.functions.invoke("radiography-engine", {
        body: { seller_id: sellerId, action: "status" }
      });
      if (error) throw error;
      setStatus(data);
    } catch (err) {
      console.error("[useRadiography] Status error:", err);
    }
  }, [sellerId]);

  const fetchItems = useCallback(async (sortBy = "score_total", order = "desc") => {
    if (!sellerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("radiography-engine", {
        body: { seller_id: sellerId, action: "list", sort_by: sortBy, order }
      });
      if (error) throw error;
      setItems(data.items || []);
    } catch (err) {
      console.error("[useRadiography] List error:", err);
      toast({
        title: "Erro ao carregar anúncios",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [sellerId, toast]);

  const runSnapshot = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    try {
      toast({ title: "Coletando dados...", description: "Criando snapshots dos anúncios." });
      
      const { data, error } = await supabase.functions.invoke("radiography-engine", {
        body: { seller_id: sellerId, action: "snapshot" }
      });
      if (error) throw error;
      
      toast({
        title: "Snapshots criados",
        description: `${data.items_processed} anúncios processados, ${data.events_detected} eventos detectados.`,
      });
      
      // Refresh data
      await fetchStatus();
      await fetchItems();
    } catch (err) {
      console.error("[useRadiography] Snapshot error:", err);
      toast({
        title: "Erro ao criar snapshots",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [sellerId, toast, fetchStatus, fetchItems]);

  const analyzeItem = useCallback(async (itemId: string) => {
    if (!sellerId) return null;
    setLoading(true);
    try {
      toast({ title: "Analisando anúncio...", description: "Gerando radiografia detalhada." });
      
      const { data, error } = await supabase.functions.invoke("radiography-engine", {
        body: { seller_id: sellerId, action: "analyze", item_id: itemId }
      });
      if (error) throw error;
      
      setRadiography(data.radiography);
      
      toast({
        title: "Análise concluída",
        description: `${data.snapshots_count} snapshots e ${data.events_count} eventos analisados.`,
      });
      
      return data;
    } catch (err: any) {
      console.error("[useRadiography] Analyze error:", err);
      toast({
        title: "Erro na análise",
        description: err.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [sellerId, toast]);

  const fetchEvents = useCallback(async (itemId?: string) => {
    if (!sellerId) return;
    try {
      const { data, error } = await supabase.functions.invoke("radiography-engine", {
        body: { seller_id: sellerId, action: "events", item_id: itemId }
      });
      if (error) throw error;
      setEvents(data.events || []);
    } catch (err) {
      console.error("[useRadiography] Events error:", err);
    }
  }, [sellerId]);

  return {
    loading,
    items,
    status,
    events,
    radiography,
    fetchStatus,
    fetchItems,
    runSnapshot,
    analyzeItem,
    fetchEvents,
    setRadiography,
  };
}
