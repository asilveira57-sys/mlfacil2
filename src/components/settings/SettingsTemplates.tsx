import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, LayoutTemplate, ListChecks, Sparkles, Settings2 } from 'lucide-react';
import { AdminOnly } from '@/components/auth/AdminOnly';
import { TemplatesOverview } from './templates/TemplatesOverview';
import { TemplatesList } from './templates/TemplatesList';
import { TemplateRulesPanel } from './templates/TemplateRulesPanel';
import { TemplateSimulator } from './templates/TemplateSimulator';
import { TemplateWizard } from './templates/TemplateWizard';
import { SellerAppearancePanel } from './SellerAppearancePanel';
import { Button } from '@/components/ui/button';
import { useUserRole } from '@/hooks/useUserRole';

export function SettingsTemplates() {
  const [activeTab, setActiveTab] = useState('overview');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const { isAdmin } = useUserRole();

  if (editingTemplateId) {
    return (
      <TemplateWizard
        templateId={editingTemplateId}
        onClose={() => setEditingTemplateId(null)}
      />
    );
  }

  // Seller view: simplified appearance panel
  if (!showAdminPanel) {
    return (
      <div className="space-y-4">
        <SellerAppearancePanel />
        {isAdmin && (
          <div className="flex justify-center pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground gap-1.5"
              onClick={() => setShowAdminPanel(true)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Gerenciar Templates (Admin)
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Admin view: full template management
  return (
    <AdminOnly
      loadingFallback={<div className="text-sm text-muted-foreground p-4">Carregando...</div>}
    >
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground gap-1.5"
          onClick={() => setShowAdminPanel(false)}
        >
          ← Voltar para Aparência
        </Button>

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
      </div>
    </AdminOnly>
  );
}
