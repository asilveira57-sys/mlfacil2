import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History, Package, Truck, Eye, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ZplImportRecord {
  id: string;
  detected_type: string;
  source: string;
  file_name: string | null;
  preset_applied_width: number;
  preset_applied_height: number;
  confidence_level: string;
  created_at: string;
  zpl_content: string;
}

interface ZplHistoryCardProps {
  onLoadImport: (zpl: string, width: number, height: number, type: string, confidence: string, source: string) => void;
  refreshTrigger?: number;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  full_volume_label: <Truck className="w-3 h-3" />,
  full_product_label: <Package className="w-3 h-3" />,
};

export function ZplHistoryCard({ onLoadImport, refreshTrigger }: ZplHistoryCardProps) {
  const [history, setHistory] = useState<ZplImportRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [refreshTrigger]);

  const loadHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("zpl_imports")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      setHistory((data as unknown as ZplImportRecord[]) || []);
    } catch (err) {
      console.error("Error loading history:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="w-4 h-4 text-primary" />
          Importações Recentes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
        {history.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-2 rounded-md border bg-muted/30 hover:bg-muted/60 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              {TYPE_ICONS[item.detected_type] || <Package className="w-3 h-3" />}
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">
                  {item.file_name || `Import ${item.id.slice(0, 8)}`}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(item.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  {" · "}
                  {item.preset_applied_width}×{item.preset_applied_height}mm
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() =>
                onLoadImport(
                  item.zpl_content,
                  item.preset_applied_width,
                  item.preset_applied_height,
                  item.detected_type,
                  item.confidence_level,
                  item.source
                )
              }
            >
              <Eye className="w-3 h-3 mr-1" />
              <span className="text-xs">Usar</span>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
