import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanyCustomization } from "@/hooks/useCompanyCustomization";
import { useThemeCustomization } from "@/hooks/useThemeCustomization";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, GripVertical, Palette, Zap, LucideIcon, Menu, LayoutGrid } from "lucide-react";
import {
  CloudDownload, Megaphone, TrendingUp, DollarSign, Activity, Package,
  Tag, MessageCircle, BarChart3, CheckSquare, Clock, Eye, Box, Sprout
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { MenuCustomization } from "./customization/MenuCustomization";
import { CardsCustomization } from "./customization/CardsCustomization";
import { SyncSettings } from "./customization/SyncSettings";

// Map of icon names to components
const ICON_MAP: Record<string, LucideIcon> = {
  CloudDownload, Megaphone, TrendingUp, DollarSign, Activity, Package,
  Tag, MessageCircle, BarChart3, CheckSquare, Clock, Eye, Box, Sprout
};

export default function SettingsCustomization() {
  const { toast } = useToast();
  
  const {
    activeColor,
    setCompanyColor,
    availableColors,
    shortcuts,
    enabledShortcuts,
    toggleShortcut,
    reorderShortcuts,
    availableShortcuts,
    accountName,
    loading: companyLoading,
  } = useCompanyCustomization();

  const {
    menuTheme,
    setMenuColor,
    cardsTheme,
    setCardsColor,
    isSynced,
    setIsSynced,
    menuPresets,
    cardsPresets,
    applyPreset,
    saveSettings,
    resetToDefault,
    loading: themeLoading,
    saving,
    hasChanges,
  } = useThemeCustomization();

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(shortcuts.filter(s => s.isEnabled));
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Merge with disabled shortcuts
    const disabledShortcuts = shortcuts.filter(s => !s.isEnabled);
    const newShortcuts = [...items, ...disabledShortcuts];
    reorderShortcuts(newShortcuts);
  };

  const getIconComponent = (iconName: string): LucideIcon => {
    return ICON_MAP[iconName] || Box;
  };

  const handleSaveTheme = async () => {
    try {
      await saveSettings();
      toast({
        title: "Configurações salvas",
        description: "Suas preferências de tema foram aplicadas com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as configurações. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const loading = companyLoading || themeLoading;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="shortcuts" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-auto p-1">
          <TabsTrigger value="shortcuts" className="gap-2 py-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Atalhos</span>
          </TabsTrigger>
          <TabsTrigger value="menu" className="gap-2 py-2">
            <Menu className="h-4 w-4" />
            <span className="hidden sm:inline">Menu Lateral</span>
          </TabsTrigger>
          <TabsTrigger value="cards" className="gap-2 py-2">
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">Cards</span>
          </TabsTrigger>
          <TabsTrigger value="sync" className="gap-2 py-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Sincronização</span>
          </TabsTrigger>
        </TabsList>

        {/* Shortcuts Tab */}
        <TabsContent value="shortcuts" className="mt-6 space-y-6">
          {/* Company Color Selection */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Cor da Empresa</CardTitle>
              </div>
              <CardDescription>
                Escolha a cor tema para identificar visualmente a empresa <strong>{accountName || "ativa"}</strong>.
                Esta cor será aplicada no menu e nos atalhos do Dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
                {availableColors.map((color) => (
                  <button
                    key={color.key}
                    onClick={() => setCompanyColor(color.key)}
                    className={cn(
                      "relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover:scale-105",
                      activeColor.key === color.key
                        ? "border-primary shadow-md"
                        : "border-transparent hover:border-muted-foreground/30"
                    )}
                    title={color.name}
                  >
                    <div
                      className="w-10 h-10 rounded-full shadow-sm flex items-center justify-center"
                      style={{ backgroundColor: color.hex }}
                    >
                      {activeColor.key === color.key && (
                        <Check className="h-5 w-5 text-white drop-shadow-md" />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium truncate max-w-full">
                      {color.name}
                    </span>
                  </button>
                ))}
              </div>
              
              {/* Preview */}
              <div className="mt-6 p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground mb-3">Pré-visualização:</p>
                <div className="flex items-center gap-3">
                  <div
                    className="px-4 py-2 rounded-md text-white font-medium text-sm"
                    style={{ backgroundColor: activeColor.hex }}
                  >
                    Botão Primário
                  </div>
                  <Badge
                    className="text-white"
                    style={{ backgroundColor: activeColor.hex }}
                  >
                    Badge
                  </Badge>
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: activeColor.hex }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dashboard Shortcuts */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Atalhos Rápidos do Dashboard</CardTitle>
              </div>
              <CardDescription>
                Escolha quais atalhos aparecem no Dashboard e arraste para reordenar.
                Os atalhos herdam automaticamente a cor da empresa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enabled shortcuts - draggable */}
              <div>
                <Label className="text-sm font-medium mb-3 block">
                  Atalhos Ativos ({enabledShortcuts.length})
                </Label>
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="shortcuts">
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="space-y-2"
                      >
                        {shortcuts
                          .filter(s => s.isEnabled)
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                          .map((shortcut, index) => {
                            const info = availableShortcuts.find(as => as.key === shortcut.key);
                            if (!info) return null;
                            const IconComp = getIconComponent(info.icon);
                            
                            return (
                              <Draggable key={shortcut.key} draggableId={shortcut.key} index={index}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    className={cn(
                                      "flex items-center gap-3 p-3 rounded-lg border bg-card transition-all",
                                      snapshot.isDragging && "shadow-lg"
                                    )}
                                  >
                                    <div
                                      {...provided.dragHandleProps}
                                      className="cursor-grab active:cursor-grabbing"
                                    >
                                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div
                                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                                      style={{ backgroundColor: `${activeColor.hex}20` }}
                                    >
                                      <IconComp
                                        className="h-4 w-4"
                                        style={{ color: activeColor.hex }}
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm">{info.title}</p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {info.description}
                                      </p>
                                    </div>
                                    <Switch
                                      checked={true}
                                      onCheckedChange={() => toggleShortcut(shortcut.key)}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
                
                {enabledShortcuts.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum atalho ativo. Ative alguns abaixo.
                  </p>
                )}
              </div>

              {/* Available shortcuts to enable */}
              <div>
                <Label className="text-sm font-medium mb-3 block">
                  Atalhos Disponíveis
                </Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableShortcuts
                    .filter(as => !shortcuts.find(s => s.key === as.key)?.isEnabled)
                    .map((shortcut) => {
                      const IconComp = getIconComponent(shortcut.icon);
                      
                      return (
                        <div
                          key={shortcut.key}
                          className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                        >
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-muted">
                            <IconComp className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{shortcut.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {shortcut.description}
                            </p>
                          </div>
                          <Switch
                            checked={false}
                            onCheckedChange={() => toggleShortcut(shortcut.key)}
                          />
                        </div>
                      );
                    })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Menu Tab */}
        <TabsContent value="menu" className="mt-6">
          <MenuCustomization
            theme={menuTheme}
            onColorChange={setMenuColor}
            presets={menuPresets}
            onApplyPreset={applyPreset}
          />
        </TabsContent>

        {/* Cards Tab */}
        <TabsContent value="cards" className="mt-6">
          <CardsCustomization
            theme={cardsTheme}
            onColorChange={setCardsColor}
            presets={cardsPresets}
            onApplyPreset={applyPreset}
          />
        </TabsContent>

        {/* Sync Tab */}
        <TabsContent value="sync" className="mt-6">
          <SyncSettings
            isSynced={isSynced}
            onSyncChange={setIsSynced}
            hasChanges={hasChanges}
            saving={saving}
            onSave={handleSaveTheme}
            onReset={resetToDefault}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
