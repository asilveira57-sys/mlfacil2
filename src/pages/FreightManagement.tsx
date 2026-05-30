import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageContainer } from '@/components/layout/PageContainer';
import { FreightRulesetsTab } from '@/components/freight/FreightRulesetsTab';
import { FreightProductsTab } from '@/components/freight/FreightProductsTab';
import { FreightDivergenceTab } from '@/components/freight/FreightDivergenceTab';
import { FreightSettingsTab } from '@/components/freight/FreightSettingsTab';
import { Table2, Package, AlertTriangle, Settings } from 'lucide-react';
import { EconomyModeBanner } from '@/components/shared/EconomyModeBanner';

export default function FreightManagement() {
  const [activeTab, setActiveTab] = useState('rulesets');

  return (
    <PageContainer
      title="Gestão de Frete"
      subtitle="Tabela de frete ML, cálculo de custos e validação de divergências"
    >
      <div className="container mx-auto py-6 px-4 max-w-7xl space-y-4">
        <EconomyModeBanner moduleName="Gestão de Frete" />
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 h-auto p-1 bg-muted/50">
            <TabsTrigger value="rulesets" className="gap-2 py-3">
              <Table2 className="h-4 w-4" />
              <span className="hidden sm:inline">Tabela de Frete</span>
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-2 py-3">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Produtos</span>
            </TabsTrigger>
            <TabsTrigger value="divergence" className="gap-2 py-3">
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Divergências</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 py-3">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Configurações</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rulesets" className="mt-6">
            <FreightRulesetsTab />
          </TabsContent>

          <TabsContent value="products" className="mt-6">
            <FreightProductsTab />
          </TabsContent>

          <TabsContent value="divergence" className="mt-6">
            <FreightDivergenceTab />
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <FreightSettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
