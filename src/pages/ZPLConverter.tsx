import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Home, Download, FileText, X, Upload, History, Clock, Trash2, Sparkles, Info } from "lucide-react";
import jsPDF from "jspdf";
import { useDropzone } from "react-dropzone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LABEL_TYPES, FULL_PRODUTO_SUBTYPES, splitZPLByType, detectLabelCount } from "@/hooks/useZPLSettings";
import { ZPLTimer } from "@/components/ZPLTimer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useZPLTimeEstimate } from "@/hooks/useZPLTimeEstimate";
import { useZPLPrintHistory } from "@/hooks/useZPLPrintHistory";
import type { User } from "@supabase/supabase-js";

export default function ZPLConverter() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [zplCode, setZplCode] = useState("");
  const [width, setWidth] = useState("105");
  const [height, setHeight] = useState("150");
  const [dpi, setDpi] = useState("203");
  const [isConverting, setIsConverting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [selectedLabelType, setSelectedLabelType] = useState("");
  const [selectedFullProdutoSubType, setSelectedFullProdutoSubType] = useState(() => {
    return localStorage.getItem('zpl_full_produto_subtype') || "";
  });
  const [quality, setQuality] = useState<'normal' | 'high' | 'max'>(() => {
    return (localStorage.getItem('zpl_quality_preference') as 'normal' | 'high' | 'max') || 'high';
  });
  const [outputFormat, setOutputFormat] = useState<'pdf_png' | 'pdf_vector'>(() => {
    return (localStorage.getItem('zpl_output_format') as 'pdf_png' | 'pdf_vector') || 'pdf_png';
  });
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  
  const { getEstimate, saveConversionTime } = useZPLTimeEstimate();
  const { history, addToHistory, removeFromHistory, clearHistory, getTimeRemaining } = useZPLPrintHistory();

  // Verificar autenticação
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
      setLoading(false);
    };
    
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Detecta automaticamente a quantidade de etiquetas
  const labelCount = useMemo(() => {
    if (!zplCode) return 0;
    return detectLabelCount(zplCode, selectedLabelType);
  }, [zplCode, selectedLabelType]);

  // Map quality to scale factor (supersampling)
  // Using fixed DPMM=8 and scaling dimensions for consistent physical size
  const getQualityScale = (q: 'normal' | 'high' | 'max') => {
    const scaleMap = { normal: 1, high: 2, max: 3 };
    return scaleMap[q];
  };

  const convertSingleLabel = async (
    labelCode: string, 
    widthInches: number, 
    heightInches: number, 
    scale: number = 1,
    format: 'png' | 'pdf' = 'png'
  ): Promise<Blob> => {
    // Fixed DPMM=8, use scaled dimensions for higher quality
    const dpmm = 8;
    const scaledWidthInches = widthInches * scale;
    const scaledHeightInches = heightInches * scale;
    
    const labelaryUrl = `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${scaledWidthInches.toFixed(2)}x${scaledHeightInches.toFixed(2)}/0/`;

    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const response = await fetch(labelaryUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": format === 'pdf' ? "application/pdf" : "image/png",
        },
        body: labelCode,
      });

      if (response.ok) {
        return await response.blob();
      }

      if (response.status === 429 && attempt < maxRetries - 1) {
        const waitMs = 1000 * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      const errorText = await response.text();
      throw new Error(`Erro ao converter etiqueta (${response.status}): ${errorText || response.statusText}`);
    }

    throw new Error("Erro ao converter etiqueta: limite de tentativas excedido");
  };

  const processLabelsInBatches = async (
    labels: string[], 
    widthInches: number, 
    heightInches: number, 
    scale: number = 1,
    format: 'png' | 'pdf' = 'png'
  ): Promise<Blob[]> => {
    const blobs: Blob[] = new Array(labels.length);
    let currentDelay = 200;
    // Higher scales = larger images = fewer concurrent requests
    const concurrentRequests = scale >= 3 ? 2 : 3;
    
    for (let i = 0; i < labels.length; i += concurrentRequests) {
      const batch = labels.slice(i, Math.min(i + concurrentRequests, labels.length));
      
      try {
        const batchPromises = batch.map(async (label, batchIndex) => {
          const labelIndex = i + batchIndex;
          const blob = await convertSingleLabel(label, widthInches, heightInches, scale, format);
          blobs[labelIndex] = blob;
          
          const progress = Math.round(((labelIndex + 1) / labels.length) * 100);
          setConversionProgress(progress);
          
          return blob;
        });

        await Promise.all(batchPromises);
        
        if (i + concurrentRequests < labels.length) {
          await new Promise((resolve) => setTimeout(resolve, currentDelay));
        }

      } catch (error) {
        if (error instanceof Error && error.message.includes('429')) {
          currentDelay = Math.min(currentDelay * 2, 5000);
          i -= concurrentRequests;
          await new Promise((resolve) => setTimeout(resolve, currentDelay));
        } else {
          throw error;
        }
      }
    }
    
    return blobs;
  };

  const convertZPLtoPDF = async () => {
    if (!zplCode.trim()) {
      toast.error("Por favor, insira o código ZPL");
      return;
    }

    if (!selectedLabelType) {
      toast.error("Por favor, selecione o tipo de etiqueta");
      return;
    }

    if (!width || !height || parseFloat(width) <= 0 || parseFloat(height) <= 0) {
      toast.error("Por favor, insira dimensões válidas");
      return;
    }

    setIsConverting(true);
    setConversionProgress(0);

    // Buscar estimativa baseada no histórico
    const estimatedTime = await getEstimate(selectedLabelType, labelCount, selectedFullProdutoSubType || null);
    setEstimatedSeconds(estimatedTime);

    const startTime = Date.now();

    try {
      const widthInches = parseFloat(width) / 25.4;
      const heightInches = parseFloat(height) / 25.4;
      const scale = getQualityScale(quality);
      const useVectorPdf = outputFormat === 'pdf_vector';

      const labels = splitZPLByType(zplCode.trim(), selectedLabelType);

      if (labels.length === 0) {
        toast.error("Nenhuma etiqueta encontrada no código ZPL");
        setIsConverting(false);
        return;
      }

      const qualityLabel = quality === 'max' ? 'máxima (3x)' : quality === 'high' ? 'alta (2x)' : 'normal';
      toast.info(`Processando ${labels.length} etiqueta(s) em qualidade ${qualityLabel}${useVectorPdf ? ' (PDF vetorial)' : ''}...`);

      if (useVectorPdf) {
        // Vector PDF mode - get PDFs directly from Labelary
        // For vector, scale=1 since PDF is already vector quality
        const convertedBlobs = await processLabelsInBatches(labels, widthInches, heightInches, 1, 'pdf');
        
        // For preview, get first label as PNG at scale 1
        const previewBlob = await convertSingleLabel(labels[0], widthInches, heightInches, 1, 'png');
        setPreviewImage(URL.createObjectURL(previewBlob));

        // Merge PDFs using pdf-lib would be ideal, but for simplicity, if single label, download directly
        if (convertedBlobs.length === 1) {
          const url = URL.createObjectURL(convertedBlobs[0]);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'etiquetas_zpl.pdf';
          a.click();
          URL.revokeObjectURL(url);
        } else {
          // For multiple labels in vector mode, fallback to jsPDF with max quality PNGs
          const pngBlobs = await processLabelsInBatches(labels, widthInches, heightInches, 3, 'png');
          
          const pdf = new jsPDF({
            orientation: widthInches > heightInches ? "landscape" : "portrait",
            unit: "mm",
            format: [parseFloat(width), parseFloat(height)],
          });

          for (let i = 0; i < pngBlobs.length; i++) {
            const blob = pngBlobs[i];
            const reader = new FileReader();
            
            await new Promise<void>((resolve, reject) => {
              reader.onload = () => {
                try {
                  if (i > 0) pdf.addPage();
                  // Insert scaled image at original dimensions (supersampling)
                  pdf.addImage(reader.result as string, "PNG", 0, 0, parseFloat(width), parseFloat(height));
                  resolve();
                } catch (error) {
                  reject(error);
                }
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }

          pdf.save("etiquetas_zpl.pdf");
        }
      } else {
        // Standard PNG to PDF mode with supersampling
        const convertedBlobs = await processLabelsInBatches(labels, widthInches, heightInches, scale, 'png');

        const pdf = new jsPDF({
          orientation: widthInches > heightInches ? "landscape" : "portrait",
          unit: "mm",
          format: [parseFloat(width), parseFloat(height)],
        });

        for (let i = 0; i < convertedBlobs.length; i++) {
          const blob = convertedBlobs[i];
          const reader = new FileReader();
          
          await new Promise<void>((resolve, reject) => {
            reader.onload = () => {
              try {
                if (i > 0) pdf.addPage();
                pdf.addImage(reader.result as string, "PNG", 0, 0, parseFloat(width), parseFloat(height));
                resolve();
              } catch (error) {
                reject(error);
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          if (i === 0) {
            setPreviewImage(URL.createObjectURL(blob));
          }
        }

        pdf.save("etiquetas_zpl.pdf");
      }
      toast.success(`${labels.length} etiqueta(s) convertida(s) com sucesso!`);
      
      // Salvar no histórico de reimpressão rápida
      addToHistory({
        fileName: uploadedFileName || `etiquetas_${Date.now()}.zpl`,
        labelType: selectedLabelType,
        labelSubtype: selectedFullProdutoSubType || null,
        labelCount: labels.length,
        zplCode: zplCode.trim(),
        width,
        height,
        dpi,
      });
      
      // Salvar tempo real de conversão no histórico
      const endTime = Date.now();
      const durationSeconds = (endTime - startTime) / 1000;
      
      if (user?.id) {
        await saveConversionTime(user.id, {
          label_type: selectedLabelType,
          label_subtype: selectedFullProdutoSubType || null,
          label_count: labels.length,
          width_mm: parseFloat(width),
          height_mm: parseFloat(height),
          duration_seconds: durationSeconds,
        });
      }
      
    } catch (error) {
      console.error("Erro na conversão:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao converter ZPL");
    } finally {
      setIsConverting(false);
      setConversionProgress(0);
      setEstimatedSeconds(0);
    }
  };

  const handleClearCode = () => {
    setZplCode("");
    setPreviewImage(null);
    setConversionProgress(0);
    setUploadedFileName(null);
    setSelectedLabelType("");
    setSelectedFullProdutoSubType("");
    setEstimatedSeconds(0);
    toast.success("Código ZPL limpo!");
  };

  const handleFileLoad = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setZplCode(content);
        setUploadedFileName(file.name);
        toast.success("Arquivo carregado com sucesso!");
      };
      reader.readAsText(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileLoad,
    accept: {
      "text/plain": [".txt", ".zpl", ".prn"],
    },
    multiple: false,
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
                <Home className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold">Conversor ZPL para PDF</h1>
                <p className="text-sm text-muted-foreground">Converta códigos ZPL em etiquetas PDF</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <Label>Tipo de Etiqueta *</Label>
                  <Select value={selectedLabelType} onValueChange={(value) => {
                    setSelectedLabelType(value);
                    const labelType = LABEL_TYPES.find(t => t.value === value);
                    if (value === 'full_produto') {
                      const savedSubType = localStorage.getItem('zpl_full_produto_subtype') || "";
                      setSelectedFullProdutoSubType(savedSubType);
                      const subType = FULL_PRODUTO_SUBTYPES.find(t => t.value === savedSubType);
                      if (subType) {
                        setWidth(subType.width);
                        setHeight(subType.height);
                      } else if (labelType) {
                        setWidth(labelType.defaultWidth);
                        setHeight(labelType.defaultHeight);
                      }
                    } else {
                      setSelectedFullProdutoSubType("");
                      if (labelType) {
                        setWidth(labelType.defaultWidth);
                        setHeight(labelType.defaultHeight);
                      }
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo de etiqueta" />
                    </SelectTrigger>
                    <SelectContent>
                      {LABEL_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedLabelType === 'full_produto' && (
                  <div>
                    <Label>Tamanho da Etiqueta</Label>
                    <Select value={selectedFullProdutoSubType} onValueChange={(value) => {
                      setSelectedFullProdutoSubType(value);
                      localStorage.setItem('zpl_full_produto_subtype', value);
                      const subType = FULL_PRODUTO_SUBTYPES.find(t => t.value === value);
                      if (subType) {
                        setWidth(subType.width);
                        setHeight(subType.height);
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tamanho" />
                      </SelectTrigger>
                      <SelectContent>
                        {FULL_PRODUTO_SUBTYPES.map((subType) => (
                          <SelectItem key={subType.value} value={subType.value}>
                            {subType.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>Largura (mm)</Label>
                  <Input
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    placeholder="105"
                  />
                </div>

                <div>
                  <Label>Altura (mm)</Label>
                  <Input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="150"
                  />
                </div>

                <div>
                  <Label className="flex items-center gap-1">
                    Qualidade
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            <strong>Normal (203 DPI):</strong> Mais rápido, ideal para testes<br/>
                            <strong>Alta (300 DPI):</strong> Boa qualidade para impressão<br/>
                            <strong>Máxima (600 DPI):</strong> Melhor qualidade, mais lento
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Select 
                    value={quality} 
                    onValueChange={(value: 'normal' | 'high' | 'max') => {
                      setQuality(value);
                      localStorage.setItem('zpl_quality_preference', value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal (203 DPI)</SelectItem>
                      <SelectItem value="high">Alta (300 DPI)</SelectItem>
                      <SelectItem value="max">Máxima (600 DPI)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="flex items-center gap-1">
                    Formato
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Sparkles className="h-3 w-3 text-amber-500 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            <strong>PDF Padrão:</strong> Mais compatível<br/>
                            <strong>PDF Vetorial:</strong> Qualidade máxima, códigos sempre nítidos (recomendado para etiquetas de envio)
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Select 
                    value={outputFormat} 
                    onValueChange={(value: 'pdf_png' | 'pdf_vector') => {
                      setOutputFormat(value);
                      localStorage.setItem('zpl_output_format', value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf_png">PDF Padrão</SelectItem>
                      <SelectItem value="pdf_vector">PDF Vetorial ✨</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Código ZPL</CardTitle>
                <CardDescription>Cole ou carregue seu código ZPL</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {uploadedFileName ? (
                      <span className="text-primary font-medium">{uploadedFileName}</span>
                    ) : isDragActive ? (
                      "Solte o arquivo aqui..."
                    ) : (
                      "Arraste um arquivo ZPL aqui ou clique para selecionar"
                    )}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Código ZPL</Label>
                    {zplCode && (
                      <Button variant="ghost" size="sm" onClick={handleClearCode}>
                        <X className="h-4 w-4 mr-1" />
                        Limpar
                      </Button>
                    )}
                  </div>
                  <Textarea
                    value={zplCode}
                    onChange={(e) => setZplCode(e.target.value)}
                    placeholder="Cole seu código ZPL aqui..."
                    rows={10}
                    className="font-mono text-sm"
                  />
                </div>

                {isConverting && labelCount > 0 && (
                  <div className="space-y-4">
                    <ZPLTimer 
                      isActive={isConverting} 
                      estimatedSeconds={estimatedSeconds}
                      message={`Gerando ${labelCount} etiqueta(s)... Tempo estimado: {TIME}`}
                      userName={user?.user_metadata?.full_name || user?.email}
                    />
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Progresso</span>
                        <span>{conversionProgress}%</span>
                      </div>
                      <Progress value={conversionProgress} className="w-full" />
                    </div>
                  </div>
                )}

                <Button
                  onClick={convertZPLtoPDF}
                  disabled={isConverting || !selectedLabelType}
                  className="w-full"
                  size="lg"
                >
                  {isConverting ? "Convertendo..." : <><Download className="mr-2 h-4 w-4" /> Converter e Baixar PDF</>}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Informações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Tipo selecionado:</span>
                  <span className="text-sm font-medium">
                    {selectedLabelType 
                      ? LABEL_TYPES.find(t => t.value === selectedLabelType)?.label 
                      : 'Nenhum'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Etiquetas detectadas:</span>
                  <span className="text-sm font-medium">{labelCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Dimensões:</span>
                  <span className="text-sm font-medium">{width}x{height}mm</span>
                </div>
                {selectedLabelType && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      ⚠️ Certifique-se de selecionar o tipo correto para evitar duplicações
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {previewImage && (
              <Card>
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>Primeira etiqueta convertida</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg p-4 bg-muted">
                    <img src={previewImage} alt="Preview da etiqueta" className="w-full h-auto" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Histórico de Reimpressão Rápida */}
            {history.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <History className="h-4 w-4" />
                      Reimpressão Rápida
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={clearHistory}
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Limpar
                    </Button>
                  </div>
                  <CardDescription className="text-xs">
                    Armazenamento rápido por 24h • Limite de 10 arquivos
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {history.map((item) => (
                    <div 
                      key={item.id}
                      className="flex items-center justify-between p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.fileName}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{LABEL_TYPES.find(t => t.value === item.labelType)?.label || item.labelType}</span>
                          <span>•</span>
                          <span>{item.labelCount} etiqueta(s)</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {getTimeRemaining(item.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => {
                            setZplCode(item.zplCode);
                            setSelectedLabelType(item.labelType);
                            setSelectedFullProdutoSubType(item.labelSubtype || "");
                            setWidth(item.width);
                            setHeight(item.height);
                            setDpi(item.dpi);
                            setUploadedFileName(item.fileName);
                            toast.success("Etiqueta carregada para reimpressão");
                          }}
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          Carregar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
                          onClick={() => removeFromHistory(item.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Como usar</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="shopee">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="shopee">Shopee</TabsTrigger>
                    <TabsTrigger value="ml">Mercado Livre</TabsTrigger>
                    <TabsTrigger value="full">Full</TabsTrigger>
                  </TabsList>
                  <TabsContent value="shopee" className="space-y-2">
                    <p className="text-sm">1. Selecione "Envio Shopee" como tipo</p>
                    <p className="text-sm">2. Cole o código ZPL completo</p>
                    <p className="text-sm">3. Clique em "Converter e Baixar PDF"</p>
                  </TabsContent>
                  <TabsContent value="ml" className="space-y-2">
                    <p className="text-sm">1. Selecione "Envio Mercadolivre" como tipo</p>
                    <p className="text-sm">2. Cole os códigos ZPL</p>
                    <p className="text-sm">3. Clique em "Converter e Baixar PDF"</p>
                  </TabsContent>
                  <TabsContent value="full" className="space-y-2">
                    <p className="text-sm">1. Selecione "Etiqueta Full Produtos" ou "Etiqueta Full Volume"</p>
                    <p className="text-sm">2. Cole os códigos ZPL</p>
                    <p className="text-sm">3. Clique em "Converter e Baixar PDF"</p>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
