import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Trash2, FileCode, Upload, FileUp } from "lucide-react";
import { toast } from "sonner";

interface ZplCodeEditorProps {
  zplCode: string;
  onZplCodeChange: (code: string) => void;
  width: number;
  height: number;
  dpmm: number;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onDpmmChange: (dpmm: number) => void;
  onRender: () => void;
  onClear: () => void;
  isRendering: boolean;
  onImport?: () => void;
}

export function ZplCodeEditor({
  zplCode,
  onZplCodeChange,
  width,
  height,
  dpmm,
  onWidthChange,
  onHeightChange,
  onDpmmChange,
  onRender,
  onClear,
  isRendering,
  onImport,
}: ZplCodeEditorProps) {
  const { t } = useTranslation("tools");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSampleCode = () => {
    onZplCodeChange(t("zpl.sample_code"));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) {
        onZplCodeChange(content);
        toast.success(`Arquivo "${file.name}" carregado`);
      }
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg">
            <FileCode className="w-5 h-5" />
            Código ZPL
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="w-3 h-3" />
              Upload .txt
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.zpl"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder={t("zpl.input_placeholder")}
          value={zplCode}
          onChange={(e) => onZplCodeChange(e.target.value)}
          className="min-h-[280px] font-mono text-sm resize-none"
        />

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="width" className="text-xs">
              {t("zpl.label_width")}
            </Label>
            <Input
              id="width"
              type="number"
              value={width}
              onChange={(e) => onWidthChange(Number(e.target.value))}
              min={10}
              max={300}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="height" className="text-xs">
              {t("zpl.label_height")}
            </Label>
            <Input
              id="height"
              type="number"
              value={height}
              onChange={(e) => onHeightChange(Number(e.target.value))}
              min={10}
              max={300}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dpmm" className="text-xs">
              {t("zpl.label_dpmm")}
            </Label>
            <Input
              id="dpmm"
              type="number"
              value={dpmm}
              onChange={(e) => onDpmmChange(Number(e.target.value))}
              min={6}
              max={24}
              className="h-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onRender}
            disabled={isRendering}
            className="flex-1 min-w-[120px]"
          >
            <Play className="w-4 h-4 mr-2" />
            {isRendering ? t("zpl.rendering") : t("zpl.btn_render")}
          </Button>
          {onImport && (
            <Button
              variant="secondary"
              onClick={onImport}
              disabled={!zplCode.trim()}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              Importar
            </Button>
          )}
          <Button variant="outline" onClick={onClear} className="gap-2">
            <Trash2 className="w-4 h-4" />
            {t("zpl.btn_clear")}
          </Button>
          <Button
            variant="secondary"
            onClick={loadSampleCode}
            className="text-xs"
          >
            Exemplo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
