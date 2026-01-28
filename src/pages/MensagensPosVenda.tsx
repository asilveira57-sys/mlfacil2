import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, History, Bot } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  PostSaleHeader,
  PostSaleTemplatesList,
  PostSaleHistory,
  PostSaleAutomation,
} from "@/components/post-sale";

export default function MensagensPosVenda() {
  return (
    <PageContainer title="Mensagens Pós-Venda" subtitle="Automatize suas mensagens após a venda">
      <div className="p-6 space-y-6">
        <PostSaleHeader />

        <Tabs defaultValue="templates" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
            <TabsTrigger value="automation" className="gap-2">
              <Bot className="h-4 w-4" />
              Automação
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="mt-6">
            <PostSaleTemplatesList />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <PostSaleHistory />
          </TabsContent>

          <TabsContent value="automation" className="mt-6">
            <PostSaleAutomation />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
