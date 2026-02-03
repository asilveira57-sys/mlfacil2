import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Image as ImageIcon } from "lucide-react";

interface ZplPreviewCardProps {
  imageUrl: string | null;
  isRendering: boolean;
}

export function ZplPreviewCard({ imageUrl, isRendering }: ZplPreviewCardProps) {
  const { t } = useTranslation('tools');

  const handleDownload = () => {
    if (!imageUrl) return;
    
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `etiqueta-zpl-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImageIcon className="w-5 h-5" />
            Preview
          </CardTitle>
          {imageUrl && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleDownload}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              {t('zpl.btn_download')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="min-h-[300px] border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/30">
          {isRendering ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">{t('zpl.rendering')}</span>
            </div>
          ) : imageUrl ? (
            <img 
              src={imageUrl} 
              alt="ZPL Label Preview" 
              className="max-w-full max-h-[400px] object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageIcon className="w-12 h-12 opacity-30" />
              <span className="text-sm">Preview aparecerá aqui</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
