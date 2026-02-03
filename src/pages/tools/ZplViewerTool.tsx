import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ToolsLayout } from "./ToolsLayout";
import { 
  ToolsNavTabs, 
  ToolsPromoCard, 
  ZplCodeEditor, 
  ZplPreviewCard 
} from "@/components/tools";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

export default function ZplViewerTool() {
  const { t } = useTranslation('tools');
  const [zplCode, setZplCode] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [width, setWidth] = useState(105); // mm
  const [height, setHeight] = useState(150); // mm
  const [dpmm, setDpmm] = useState(8); // dots per mm

  const handleRender = async () => {
    if (!zplCode.trim()) {
      toast.error(t('zpl.error_empty'));
      return;
    }

    setIsRendering(true);
    
    try {
      // Convert mm to inches (Labelary uses inches)
      const widthInches = (width / 25.4).toFixed(2);
      const heightInches = (height / 25.4).toFixed(2);

      const response = await fetch(
        `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${widthInches}x${heightInches}/0/`,
        {
          method: 'POST',
          headers: {
            'Accept': 'image/png',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: zplCode,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Revoke previous URL to prevent memory leaks
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
      
      setImageUrl(url);
      toast.success(t('zpl.success_render'));
    } catch (error) {
      console.error('Error rendering ZPL:', error);
      toast.error(t('zpl.error_render'));
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
  };

  return (
    <ToolsLayout>
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            {t('zpl.title')}
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t('zpl.subtitle')}
          </p>
        </div>

        {/* Navigation Tabs */}
        <ToolsNavTabs />

        {/* Main Content */}
        <div className="grid lg:grid-cols-2 gap-6">
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
          />
          <ZplPreviewCard
            imageUrl={imageUrl}
            isRendering={isRendering}
          />
        </div>

        {/* Disclaimer */}
        <Alert variant="default" className="bg-muted/50 border-muted">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm text-muted-foreground">
            {t('zpl.disclaimer')}
          </AlertDescription>
        </Alert>

        {/* Promo Card */}
        <ToolsPromoCard />
      </div>
    </ToolsLayout>
  );
}
