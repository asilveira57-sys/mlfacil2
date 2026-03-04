import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Settings2, FileText, History, Zap, Calendar, Megaphone } from 'lucide-react';
import { EmailProviderTab } from '@/components/admin/email/EmailProviderTab';
import { EmailTemplatesTab } from '@/components/admin/email/EmailTemplatesTab';
import { EmailCategoriesTab } from '@/components/admin/email/EmailCategoriesTab';
import { EmailLogsTab } from '@/components/admin/email/EmailLogsTab';
import { EmailEventRulesTab } from '@/components/admin/email/EmailEventRulesTab';
import { EmailSchedulesTab } from '@/components/admin/email/EmailSchedulesTab';
import { EmailCampaignsTab } from '@/components/admin/email/EmailCampaignsTab';

export function AdminEmails() {
  const [activeTab, setActiveTab] = useState('provider');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Comunicação → E-mails</h2>
        <p className="text-sm text-muted-foreground">Provedor, templates, regras, agendamentos, campanhas e logs</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7 h-auto p-1">
          <TabsTrigger value="provider" className="gap-1 py-2.5">
            <Settings2 className="h-4 w-4" />
            <span className="hidden lg:inline text-xs">Provedor</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-1 py-2.5">
            <Mail className="h-4 w-4" />
            <span className="hidden lg:inline text-xs">Categorias</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1 py-2.5">
            <FileText className="h-4 w-4" />
            <span className="hidden lg:inline text-xs">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1 py-2.5">
            <Zap className="h-4 w-4" />
            <span className="hidden lg:inline text-xs">Eventos</span>
          </TabsTrigger>
          <TabsTrigger value="schedules" className="gap-1 py-2.5">
            <Calendar className="h-4 w-4" />
            <span className="hidden lg:inline text-xs">Agendamentos</span>
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1 py-2.5">
            <Megaphone className="h-4 w-4" />
            <span className="hidden lg:inline text-xs">Campanhas</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1 py-2.5">
            <History className="h-4 w-4" />
            <span className="hidden lg:inline text-xs">Logs</span>
          </TabsTrigger>
        </TabsList>

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
