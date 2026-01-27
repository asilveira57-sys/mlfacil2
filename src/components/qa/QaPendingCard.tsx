import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  MessageCircle,
  AlertTriangle,
  ChevronRight,
  Timer,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { QaQuestion } from "@/types/qa";
import { usePendingQuestionsCount, useQuestions } from "@/hooks/useQA";

interface QaPendingCardProps {
  sellerId: string | null;
}

export function QaPendingCard({ sellerId }: QaPendingCardProps) {
  const navigate = useNavigate();
  const { data: pendingCount, isLoading: isCountLoading } = usePendingQuestionsCount(sellerId);
  const { data: questions, isLoading: isQuestionsLoading } = useQuestions({
    sellerId,
    status: "pending",
  });

  const urgentQuestions = questions?.filter(
    (q) => q.risk_level === "high" || q.is_sla_breached
  ) || [];

  const displayQuestions = urgentQuestions.length > 0 
    ? urgentQuestions.slice(0, 3) 
    : questions?.slice(0, 3) || [];

  const isLoading = isCountLoading || isQuestionsLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!pendingCount || pendingCount === 0) {
    return (
      <Card className="bg-emerald-500/5 border-emerald-500/20">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Perguntas em dia!</p>
              <p className="text-xs text-muted-foreground">
                Nenhuma pergunta pendente
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      urgentQuestions.length > 0 && "border-destructive/30 bg-destructive/5"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Perguntas Pendentes
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge 
              variant={urgentQuestions.length > 0 ? "destructive" : "secondary"}
              className={cn(
                urgentQuestions.length > 0 && "animate-pulse"
              )}
            >
              {pendingCount}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Priority Alert */}
        {urgentQuestions.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2">
            <AlertTriangle className="h-3 w-3" />
            <span>
              {urgentQuestions.length} pergunta{urgentQuestions.length !== 1 ? "s" : ""} urgente{urgentQuestions.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Questions Preview */}
        <div className="space-y-2">
          {displayQuestions.map((question) => (
            <QuestionPreview key={question.id} question={question} />
          ))}
        </div>

        {/* Action Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => navigate("/perguntas")}
        >
          Ver todas as perguntas
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}

function QuestionPreview({ question }: { question: QaQuestion }) {
  const navigate = useNavigate();
  const timeAgo = formatDistanceToNow(new Date(question.question_date), {
    addSuffix: true,
    locale: ptBR,
  });

  const isUrgent = question.risk_level === "high" || question.is_sla_breached;

  return (
    <button
      onClick={() => navigate(`/perguntas?id=${question.id}`)}
      className={cn(
        "w-full text-left p-2 rounded-md transition-colors hover:bg-accent",
        isUrgent && "bg-destructive/5 hover:bg-destructive/10"
      )}
    >
      <div className="flex items-start gap-2">
        {question.item_thumbnail ? (
          <img
            src={question.item_thumbnail}
            alt=""
            className="w-8 h-8 rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
            <MessageCircle className="h-3 w-3 text-muted-foreground" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate">
            {question.item_title || question.ml_item_id}
          </p>
          <p className="text-sm font-medium line-clamp-1">
            {question.question_text}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
            {question.is_sla_breached && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0">
                <Timer className="h-2 w-2 mr-0.5" />
                SLA
              </Badge>
            )}
            {question.risk_level === "high" && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0">
                <AlertTriangle className="h-2 w-2 mr-0.5" />
                Risco
              </Badge>
            )}
          </div>
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </button>
  );
}
