import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, History, Bot, MessageCircle, ClipboardCheck } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/badge";
import {
  PostSaleHeader,
  PostSaleTemplatesList,
  PostSaleHistory,
  PostSaleAutomation,
  PostSaleConversationsTab,
} from "@/components/post-sale";
import { PostSalePendingDrafts } from "@/components/post-sale/PostSalePendingDrafts";
import { usePostSalePendingCount } from "@/hooks/usePostSalePendingMessages";

export default function MensagensPosVenda() {
  const { data: pendingCount = 0 } = usePostSalePendingCount();

  return (
    <PageContainer title="Mensagens Pós-Venda" subtitle="Gerencie conversas e automatize mensagens após a venda">
      <div className="p-6 space-y-6">
        <PostSaleHeader />

        <Tabs defaultValue={pendingCount > 0 ? "pendentes" : "conversas"} className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-5">
            <TabsTrigger value="conversas" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              Conversas
            </TabsTrigger>
            <TabsTrigger value="pendentes" className="gap-2 relative">
              <ClipboardCheck className="h-4 w-4" />
              Pendentes
              {pendingCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px] leading-none"
                >
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
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

          <TabsContent value="conversas" className="mt-6">
            <PostSaleConversationsTab />
          </TabsContent>

          <TabsContent value="pendentes" className="mt-6">
            <PostSalePendingDrafts />
          </TabsContent>

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
