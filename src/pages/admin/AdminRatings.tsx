import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminFeedbackOverview } from '@/components/admin/feedback/AdminFeedbackOverview';
import { AdminSystemFeedbackTab } from '@/components/admin/feedback/AdminSystemFeedbackTab';
import { AdminModuleFeedbackTab } from '@/components/admin/feedback/AdminModuleFeedbackTab';
import { AdminCandidatesTab } from '@/components/admin/feedback/AdminCandidatesTab';
import { AdminPublishedTab } from '@/components/admin/feedback/AdminPublishedTab';

export function AdminRatings() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Avaliações & Depoimentos</h2>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="system">Sistema</TabsTrigger>
          <TabsTrigger value="modules">Módulos</TabsTrigger>
          <TabsTrigger value="candidates">Candidatos</TabsTrigger>
          <TabsTrigger value="published">Publicados</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><AdminFeedbackOverview /></TabsContent>
        <TabsContent value="system"><AdminSystemFeedbackTab /></TabsContent>
        <TabsContent value="modules"><AdminModuleFeedbackTab /></TabsContent>
        <TabsContent value="candidates"><AdminCandidatesTab /></TabsContent>
        <TabsContent value="published"><AdminPublishedTab /></TabsContent>
      </Tabs>
    </div>
  );
}
