import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layers, Settings2, FolderTree, Package, Eye } from "lucide-react";
import { WholesaleProfiles } from "@/components/wholesale/WholesaleProfiles";
import { WholesaleDefaultProfile } from "@/components/wholesale/WholesaleDefaultProfile";
import { WholesaleCategoryBindings } from "@/components/wholesale/WholesaleCategoryBindings";
import { WholesaleProductOverrides } from "@/components/wholesale/WholesaleProductOverrides";
import { WholesalePreview } from "@/components/wholesale/WholesalePreview";

export default function Atacado() {
  const [activeTab, setActiveTab] = useState("profiles");

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Preço de Atacado</h1>
        <p className="text-muted-foreground text-sm">
          Gerencie perfis de camadas, vincule categorias e aplique preços de atacado em lote.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="profiles" className="gap-2">
            <Layers className="h-4 w-4" />
            Perfis
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-2">
            <FolderTree className="h-4 w-4" />
            Categorias
          </TabsTrigger>
          <TabsTrigger value="overrides" className="gap-2">
            <Package className="h-4 w-4" />
            Avulso (SKU)
          </TabsTrigger>
          <TabsTrigger value="default" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Padrão
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Eye className="h-4 w-4" />
            Preview & Aplicar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="mt-4">
          <WholesaleProfiles />
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <WholesaleCategoryBindings />
        </TabsContent>

        <TabsContent value="overrides" className="mt-4">
          <WholesaleProductOverrides />
        </TabsContent>

        <TabsContent value="default" className="mt-4">
          <WholesaleDefaultProfile />
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <WholesalePreview />
        </TabsContent>
      </Tabs>
    </div>
  );
}
