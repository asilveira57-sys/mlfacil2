import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search,
  Filter,
  Clock,
  AlertTriangle,
  MessageCircle,
  ChevronRight,
  Inbox,
  Timer,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { QaQuestion, QaQuestionStatus, QaRiskLevel } from "@/types/qa";
import { STATUS_LABELS, STATUS_COLORS, RISK_COLORS } from "@/types/qa";

interface QaInboxProps {
  questions: QaQuestion[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (question: QaQuestion) => void;
  statusFilter: QaQuestionStatus | "all";
  onStatusFilterChange: (status: QaQuestionStatus | "all") => void;
  riskFilter: QaRiskLevel | "all";
  onRiskFilterChange: (risk: QaRiskLevel | "all") => void;
  search: string;
  onSearchChange: (search: string) => void;
}

export function QaInbox({
  questions,
  loading,
  selectedId,
  onSelect,
  statusFilter,
  onStatusFilterChange,
  riskFilter,
  onRiskFilterChange,
  search,
  onSearchChange,
}: QaInboxProps) {
  const pendingCount = questions.filter((q) => q.status === "pending").length;
  const urgentCount = questions.filter(
    (q) => q.status === "pending" && (q.risk_level === "high" || q.is_sla_breached)
  ).length;

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header Stats */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Fila de Atendimento</span>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
                {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
              </Badge>
            )}
            {urgentCount > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {urgentCount} urgente{urgentCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pergunta ou produto..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as QaQuestionStatus | "all")}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="answered">Respondidas</SelectItem>
              <SelectItem value="draft">Em revisão</SelectItem>
              <SelectItem value="archived">Arquivadas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={riskFilter} onValueChange={(v) => onRiskFilterChange(v as QaRiskLevel | "all")}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Risco" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer risco</SelectItem>
              <SelectItem value="high">Alto risco</SelectItem>
              <SelectItem value="medium">Médio risco</SelectItem>
              <SelectItem value="low">Baixo risco</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Questions List */}
      <ScrollArea className="flex-1">
        {questions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="rounded-full bg-muted p-4 mb-4">
              <MessageCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium">Nenhuma pergunta</h3>
            <p className="text-xs text-muted-foreground mt-1">
              As perguntas dos seus anúncios aparecerão aqui
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {questions.map((question) => (
              <QuestionItem
                key={question.id}
                question={question}
                isSelected={selectedId === question.id}
                onClick={() => onSelect(question)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface QuestionItemProps {
  question: QaQuestion;
  isSelected: boolean;
  onClick: () => void;
}

function QuestionItem({ question, isSelected, onClick }: QuestionItemProps) {
  const timeAgo = formatDistanceToNow(new Date(question.question_date), {
    addSuffix: true,
    locale: ptBR,
  });

  const isUrgent = question.risk_level === "high" || question.is_sla_breached;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 transition-colors hover:bg-accent/50",
        isSelected && "bg-accent",
        isUrgent && !isSelected && "bg-destructive/5 hover:bg-destructive/10"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        {question.item_thumbnail ? (
          <img
            src={question.item_thumbnail}
            alt=""
            className="w-10 h-10 rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1">
          {/* Product title */}
          <p className="text-xs text-muted-foreground truncate">
            {question.item_title || question.ml_item_id}
          </p>

          {/* Question preview */}
          <p className="text-sm font-medium line-clamp-2">
            {question.question_text}
          </p>

          {/* Meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0", STATUS_COLORS[question.status])}
            >
              {STATUS_LABELS[question.status]}
            </Badge>

            {question.risk_level !== "low" && (
              <Badge className={cn("text-[10px] px-1.5 py-0", RISK_COLORS[question.risk_level])}>
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                Risco
              </Badge>
            )}

            {question.is_sla_breached && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                <Timer className="h-2.5 w-2.5 mr-0.5" />
                SLA
              </Badge>
            )}

            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {timeAgo}
            </span>
          </div>
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </button>
  );
}
