import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layers, Settings2 } from "lucide-react";
import { WholesaleProfiles } from "@/components/wholesale/WholesaleProfiles";
import { WholesaleDefaultProfile } from "@/components/wholesale/WholesaleDefaultProfile";

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
        <TabsList>
          <TabsTrigger value="profiles" className="gap-2">
            <Layers className="h-4 w-4" />
            Perfis de Camadas
          </TabsTrigger>
          <TabsTrigger value="default" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Perfil Padrão
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="mt-4">
          <WholesaleProfiles />
        </TabsContent>

        <TabsContent value="default" className="mt-4">
          <WholesaleDefaultProfile />
        </TabsContent>
      </Tabs>
    </div>
  );
}
