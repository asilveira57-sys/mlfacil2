import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { DashboardLayout } from "@/components/layout";
import {
  QaHeader,
  QaInbox,
  QaResponseEditor,
  QaLibraryPanel,
} from "@/components/qa";
import {
  useQuestions,
  useResponseLibrary,
} from "@/hooks/useQA";
import type { QaQuestion, QaQuestionStatus, QaRiskLevel, QaLibraryResponse } from "@/types/qa";

export default function Perguntas() {
  const { activeAccount, sellerId } = useActiveAccount();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters
  const [statusFilter, setStatusFilter] = useState<QaQuestionStatus | "all">("all");
  const [riskFilter, setRiskFilter] = useState<QaRiskLevel | "all">("all");
  const [search, setSearch] = useState("");

  // Selected question
  const [selectedQuestion, setSelectedQuestion] = useState<QaQuestion | null>(null);

  // Data
  const { data: questions, isLoading: isQuestionsLoading } = useQuestions({
    sellerId,
    status: statusFilter,
    riskLevel: riskFilter,
    search,
  });
  const { data: libraryResponses, isLoading: isLibraryLoading } = useResponseLibrary(sellerId);

  // Handle URL params for direct question access
  useEffect(() => {
    const questionId = searchParams.get("id");
    if (questionId && questions) {
      const question = questions.find((q) => q.id === questionId);
      if (question) {
        setSelectedQuestion(question);
      }
    }
  }, [searchParams, questions]);

  const handleSelectQuestion = (question: QaQuestion) => {
    setSelectedQuestion(question);
    setSearchParams({ id: question.id });
  };

  const handleLibrarySelect = (response: QaLibraryResponse) => {
    // This will be handled by the editor
  };

  if (!sellerId) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Conecte uma conta do Mercado Livre para acessar as perguntas.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 min-h-screen bg-background">
        <QaHeader />

        <Tabs defaultValue="inbox" className="space-y-4">
          <TabsList>
            <TabsTrigger value="inbox">Inbox</TabsTrigger>
            <TabsTrigger value="library">Biblioteca</TabsTrigger>
            <TabsTrigger value="metrics">Métricas</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="mt-0">
            <div className="grid lg:grid-cols-12 gap-4 h-[calc(100vh-280px)]">
              {/* Left: Inbox */}
              <Card className="lg:col-span-4 overflow-hidden">
                <QaInbox
                  questions={questions || []}
                  loading={isQuestionsLoading}
                  selectedId={selectedQuestion?.id || null}
                  onSelect={handleSelectQuestion}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  riskFilter={riskFilter}
                  onRiskFilterChange={setRiskFilter}
                  search={search}
                  onSearchChange={setSearch}
                />
              </Card>

              {/* Center: Response Editor */}
              <Card className="lg:col-span-5 p-4 overflow-auto">
                {selectedQuestion ? (
                  <QaResponseEditor
                    question={selectedQuestion}
                    libraryResponses={libraryResponses || []}
                    sellerId={sellerId}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="rounded-full bg-muted p-6 mb-4">
                      <svg
                        className="h-12 w-12 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium">Selecione uma pergunta</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Escolha uma pergunta na lista para visualizar e responder
                    </p>
                  </div>
                )}
              </Card>

              {/* Right: Library Panel */}
              <Card className="lg:col-span-3 overflow-hidden">
                <QaLibraryPanel
                  responses={libraryResponses || []}
                  loading={isLibraryLoading}
                  sellerId={sellerId}
                  onSelect={handleLibrarySelect}
                />
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="library">
            <Card className="p-6">
              <LibraryManagement sellerId={sellerId} />
            </Card>
          </TabsContent>

          <TabsContent value="metrics">
            <Card className="p-6">
              <QaMetricsDashboard sellerId={sellerId} />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// Library full management view
function LibraryManagement({ sellerId }: { sellerId: string }) {
  const { data: responses, isLoading } = useResponseLibrary(sellerId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Biblioteca de Respostas</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie suas respostas padrão aprovadas
          </p>
        </div>
      </div>

      {responses && responses.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {responses.map((response) => (
            <Card key={response.id} className="p-4">
              <h3 className="font-medium">{response.name}</h3>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                {response.content}
              </p>
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <span>Usado {response.usage_count}x</span>
                {response.shortcut && (
                  <span className="bg-muted px-1.5 py-0.5 rounded">
                    {response.shortcut}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            Nenhuma resposta na biblioteca ainda
          </p>
        </div>
      )}
    </div>
  );
}

// Metrics dashboard
function QaMetricsDashboard({ sellerId }: { sellerId: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Métricas de Atendimento</h2>
        <p className="text-sm text-muted-foreground">
          Acompanhe o desempenho do seu atendimento
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Respondidas hoje</p>
          <p className="text-3xl font-bold mt-1">0</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Tempo médio</p>
          <p className="text-3xl font-bold mt-1">--</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">SLA cumprido</p>
          <p className="text-3xl font-bold mt-1">100%</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Da biblioteca</p>
          <p className="text-3xl font-bold mt-1">0%</p>
        </Card>
      </div>

      <Card className="p-6">
        <p className="text-center text-muted-foreground">
          As métricas serão populadas conforme você responder perguntas
        </p>
      </Card>
    </div>
  );
}
