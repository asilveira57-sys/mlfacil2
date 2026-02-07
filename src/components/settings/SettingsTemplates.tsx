import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, LayoutTemplate, ListChecks, Sparkles, Settings2 } from 'lucide-react';
import { AdminOnly } from '@/components/auth/AdminOnly';
import { TemplatesOverview } from './templates/TemplatesOverview';
import { TemplatesList } from './templates/TemplatesList';
import { TemplateRulesPanel } from './templates/TemplateRulesPanel';
import { TemplateSimulator } from './templates/TemplateSimulator';
import { TemplateWizard } from './templates/TemplateWizard';

export function SettingsTemplates() {
  const [activeTab, setActiveTab] = useState('overview');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  if (editingTemplateId) {
    return (
      <TemplateWizard
        templateId={editingTemplateId}
        onClose={() => setEditingTemplateId(null)}
      />
    );
  }

  return (
    <AdminOnly
      loadingFallback={<div className="text-sm text-muted-foreground p-4">Carregando...</div>}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-auto p-1">
          <TabsTrigger value="overview" className="gap-2 py-2.5">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Visão Geral</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2 py-2.5">
            <LayoutTemplate className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2 py-2.5">
            <ListChecks className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Regras</span>
          </TabsTrigger>
          <TabsTrigger value="simulator" className="gap-2 py-2.5">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Simulador</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <TemplatesOverview onNavigate={setActiveTab} />
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesList onEdit={setEditingTemplateId} />
        </TabsContent>

        <TabsContent value="rules">
          <TemplateRulesPanel />
        </TabsContent>

        <TabsContent value="simulator">
          <TemplateSimulator />
        </TabsContent>
      </Tabs>
    </AdminOnly>
  );
}
