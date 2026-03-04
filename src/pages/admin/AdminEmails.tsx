import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Settings2, FileText, History } from 'lucide-react';
import { EmailProviderTab } from '@/components/admin/email/EmailProviderTab';
import { EmailTemplatesTab } from '@/components/admin/email/EmailTemplatesTab';
import { EmailCategoriesTab } from '@/components/admin/email/EmailCategoriesTab';
import { EmailLogsTab } from '@/components/admin/email/EmailLogsTab';

export function AdminEmails() {
  const [activeTab, setActiveTab] = useState('provider');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Comunicação → E-mails</h2>
        <p className="text-sm text-muted-foreground">Configuração de envio, templates e logs</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 h-auto p-1">
          <TabsTrigger value="provider" className="gap-2 py-2.5">
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Provedor</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-2 py-2.5">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Categorias</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2 py-2.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2 py-2.5">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Logs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="provider"><EmailProviderTab /></TabsContent>
        <TabsContent value="categories"><EmailCategoriesTab /></TabsContent>
        <TabsContent value="templates"><EmailTemplatesTab /></TabsContent>
        <TabsContent value="logs"><EmailLogsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
