import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ToolsLayout } from "./ToolsLayout";
import {
  ToolsNavTabs,
  ToolsPromoCard,
  ZplCodeEditor,
  ZplPreviewCard,
} from "@/components/tools";
import { ZplImportCard } from "@/components/tools/ZplImportCard";
import { ZplPreferencesCard } from "@/components/tools/ZplPreferencesCard";
import { ZplHistoryCard } from "@/components/tools/ZplHistoryCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info, Upload, Settings2, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ZPL_TOOL_STATE_KEY = 'zpl_viewer_tool_state_v1';

type PersistedZplState = {
  zplCode: string;
  width: number;
  height: number;
  dpmm: number;
  detectedType: string | null;
  confidence: string | null;
  presetSource: string | null;
  importSource: string | null;
  totalLabels: number | null;
};

function loadPersistedZplState(): Partial<PersistedZplState> {
  try {
    const raw = sessionStorage.getItem(ZPL_TOOL_STATE_KEY);
    return raw ? JSON.parse(raw) as PersistedZplState : {};
  } catch { return {}; }
}

export default function ZplViewerTool() {
  const { t } = useTranslation("tools");
  const [searchParams] = useSearchParams();
  const persisted = loadPersistedZplState();

  const [zplCode, setZplCode] = useState(persisted.zplCode ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [width, setWidth] = useState(persisted.width ?? 105);
  const [height, setHeight] = useState(persisted.height ?? 150);
  const [dpmm, setDpmm] = useState(persisted.dpmm ?? 8);

  // Import state
  const [detectedType, setDetectedType] = useState<string | null>(persisted.detectedType ?? null);
  const [confidence, setConfidence] = useState<string | null>(persisted.confidence ?? null);
  const [presetSource, setPresetSource] = useState<string | null>(persisted.presetSource ?? null);
  const [importSource, setImportSource] = useState<string | null>(persisted.importSource ?? null);
  const [totalLabels, setTotalLabels] = useState<number | null>(persisted.totalLabels ?? null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Persist state across tab switches / remounts
  useEffect(() => {
    try {
      sessionStorage.setItem(ZPL_TOOL_STATE_KEY, JSON.stringify({
        zplCode, width, height, dpmm,
        detectedType, confidence, presetSource, importSource, totalLabels,
      }));
    } catch { /* quota */ }
  }, [zplCode, width, height, dpmm, detectedType, confidence, presetSource, importSource, totalLabels]);

  // Check for extension auto-import on load
  useEffect(() => {
    const zplParam = searchParams.get("zpl");
    const sourceParam = searchParams.get("source");
    const fileNameParam = searchParams.get("file_name");

    if (zplParam) {
      const decoded = decodeURIComponent(zplParam);
      handleAutoImport(decoded, sourceParam || "extension", fileNameParam);
    }
  }, []);

  const handleAutoImport = async (
    zpl: string,
    source: string,
    fileName?: string | null
  ) => {
    setZplCode(zpl);
    toast.info("Etiqueta importada automaticamente");

    try {
      const { data, error } = await supabase.functions.invoke("zpl-import", {
        body: { zpl, source, file_name: fileName },
      });

      if (error) throw error;

      if (data.status === "duplicate") {
        toast.info("Esta etiqueta já foi importada anteriormente");
      }

      setDetectedType(data.type || null);
      setConfidence(data.confidence || null);
      setPresetSource(data.preset_source || null);
      setImportSource(source);
      setTotalLabels(data.total_labels || null);

      if (data.applied_width) setWidth(data.applied_width);
      if (data.applied_height) setHeight(data.applied_height);

      setRefreshTrigger((p) => p + 1);

      if (data.type) {
        const typeLabel =
          data.type === "full_volume_label"
            ? "Volume"
            : data.type === "full_product_label"
            ? "Produto"
            : "ZPL";
        toast.success(
          `Tipo detectado: ${typeLabel} · Padrão ${data.applied_width}×${data.applied_height}mm aplicado`
        );
      }

      // Auto-render
      handleRenderWithDims(zpl, data.applied_width, data.applied_height);
    } catch (err) {
      console.error("[ZPL_IMPORT] error:", err);
      toast.error("Erro ao processar importação");
    }
  };

  const handleRender = async () => {
    if (!zplCode.trim()) {
      toast.error(t("zpl.error_empty"));
      return;
    }
    await handleRenderWithDims(zplCode, width, height);
  };

  const handleRenderWithDims = async (
    code: string,
    w: number,
    h: number
  ) => {
    if (!code.trim()) return;
    setIsRendering(true);

    try {
      const widthInches = (w / 25.4).toFixed(2);
      const heightInches = (h / 25.4).toFixed(2);

      const response = await fetch(
        `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${widthInches}x${heightInches}/0/`,
        {
          method: "POST",
          headers: {
            Accept: "image/png",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: code,
        }
      );

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(url);
      toast.success(t("zpl.success_render"));
    } catch (error) {
      console.error("Error rendering ZPL:", error);
      toast.error(t("zpl.error_render"));
    } finally {
      setIsRendering(false);
    }
  };

  const handleClear = () => {
    setZplCode("");
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
      setImageUrl(null);
    }
    setDetectedType(null);
    setConfidence(null);
    setPresetSource(null);
    setImportSource(null);
    setTotalLabels(null);
  };

  const handleLoadFromHistory = (
    zpl: string,
    w: number,
    h: number,
    type: string,
    conf: string,
    src: string
  ) => {
    setZplCode(zpl);
    setWidth(w);
    setHeight(h);
    setDetectedType(type);
    setConfidence(conf);
    setImportSource(src);
    toast.info("Importação carregada do histórico");
    handleRenderWithDims(zpl, w, h);
  };

  const handleManualImport = async () => {
    if (!zplCode.trim()) {
      toast.error("Cole ou carregue um código ZPL primeiro");
      return;
    }
    await handleAutoImport(zplCode, "manual", null);
  };

  return (
    <ToolsLayout>
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            {t("zpl.title")}
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t("zpl.subtitle")}
          </p>
        </div>

        {/* Navigation Tabs */}
        <ToolsNavTabs />

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Editor + Import */}
          <div className="lg:col-span-2 space-y-4">
            <ZplCodeEditor
              zplCode={zplCode}
              onZplCodeChange={setZplCode}
              width={width}
              height={height}
              dpmm={dpmm}
              onWidthChange={setWidth}
              onHeightChange={setHeight}
              onDpmmChange={setDpmm}
              onRender={handleRender}
              onClear={handleClear}
              isRendering={isRendering}
              onImport={handleManualImport}
            />

            {/* Import info card */}
            <ZplImportCard
              detectedType={detectedType}
              confidence={confidence}
              presetSource={presetSource}
              appliedWidth={width}
              appliedHeight={height}
              source={importSource}
              totalLabels={totalLabels}
            />

            <ZplPreviewCard imageUrl={imageUrl} isRendering={isRendering} />
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            <Tabs defaultValue="preferences" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="preferences" className="text-xs gap-1">
                  <Settings2 className="w-3 h-3" />
                  Preferências
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs gap-1">
                  <History className="w-3 h-3" />
                  Histórico
                </TabsTrigger>
              </TabsList>
              <TabsContent value="preferences" className="mt-3">
                <ZplPreferencesCard />
              </TabsContent>
              <TabsContent value="history" className="mt-3">
                <ZplHistoryCard
                  onLoadImport={handleLoadFromHistory}
                  refreshTrigger={refreshTrigger}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Disclaimer */}
        <Alert variant="default" className="bg-muted/50 border-muted">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm text-muted-foreground">
            {t("zpl.disclaimer")}
          </AlertDescription>
        </Alert>

        {/* Promo Card */}
        <ToolsPromoCard />
      </div>
    </ToolsLayout>
  );
}
