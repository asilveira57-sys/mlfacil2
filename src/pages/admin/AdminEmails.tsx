import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Settings2, FileText, History, Zap, Calendar, Megaphone, BarChart3, AlertTriangle } from 'lucide-react';
import { EmailProviderTab } from '@/components/admin/email/EmailProviderTab';
import { EmailTemplatesTab } from '@/components/admin/email/EmailTemplatesTab';
import { EmailCategoriesTab } from '@/components/admin/email/EmailCategoriesTab';
import { EmailLogsTab } from '@/components/admin/email/EmailLogsTab';
import { EmailEventRulesTab } from '@/components/admin/email/EmailEventRulesTab';
import { EmailSchedulesTab } from '@/components/admin/email/EmailSchedulesTab';
import { EmailCampaignsTab } from '@/components/admin/email/EmailCampaignsTab';
import { EmailAnalyticsTab } from '@/components/admin/email/EmailAnalyticsTab';
import { EmailDeliveryFailuresTab } from '@/components/admin/email/EmailDeliveryFailuresTab';

export function AdminEmails() {
  const [activeTab, setActiveTab] = useState('analytics');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Comunicação → E-mails</h2>
        <p className="text-sm text-muted-foreground">Analytics, provedor, templates, regras, agendamentos, campanhas e logs</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full h-auto p-1 overflow-x-auto">
          <TabsTrigger value="analytics" className="gap-1 py-2.5 flex-shrink-0">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden xl:inline text-xs">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="failures" className="gap-1 py-2.5 flex-shrink-0">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden xl:inline text-xs">Falhas</span>
          </TabsTrigger>
          <TabsTrigger value="provider" className="gap-1 py-2.5 flex-shrink-0">
            <Settings2 className="h-4 w-4" />
            <span className="hidden xl:inline text-xs">Provedor</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-1 py-2.5 flex-shrink-0">
            <Mail className="h-4 w-4" />
            <span className="hidden xl:inline text-xs">Categorias</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1 py-2.5 flex-shrink-0">
            <FileText className="h-4 w-4" />
            <span className="hidden xl:inline text-xs">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1 py-2.5 flex-shrink-0">
            <Zap className="h-4 w-4" />
            <span className="hidden xl:inline text-xs">Eventos</span>
          </TabsTrigger>
          <TabsTrigger value="schedules" className="gap-1 py-2.5 flex-shrink-0">
            <Calendar className="h-4 w-4" />
            <span className="hidden xl:inline text-xs">Agendamentos</span>
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1 py-2.5 flex-shrink-0">
            <Megaphone className="h-4 w-4" />
            <span className="hidden xl:inline text-xs">Campanhas</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1 py-2.5 flex-shrink-0">
            <History className="h-4 w-4" />
            <span className="hidden xl:inline text-xs">Logs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics"><EmailAnalyticsTab /></TabsContent>
        <TabsContent value="failures"><EmailDeliveryFailuresTab /></TabsContent>
        <TabsContent value="provider"><EmailProviderTab /></TabsContent>
        <TabsContent value="categories"><EmailCategoriesTab /></TabsContent>
        <TabsContent value="templates"><EmailTemplatesTab /></TabsContent>
        <TabsContent value="events"><EmailEventRulesTab /></TabsContent>
        <TabsContent value="schedules"><EmailSchedulesTab /></TabsContent>
        <TabsContent value="campaigns"><EmailCampaignsTab /></TabsContent>
        <TabsContent value="logs"><EmailLogsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
