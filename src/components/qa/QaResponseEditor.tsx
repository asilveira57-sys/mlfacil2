import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Send,
  Save,
  Wand2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BookOpen,
  Clock,
  RefreshCw,
  Flag,
  Loader2,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { QaQuestion, QaLibraryResponse } from "@/types/qa";
import { QUESTION_CATEGORIES, STATUS_LABELS, STATUS_COLORS } from "@/types/qa";
import {
  useCreateResponse,
  useValidateResponse,
  useAiSuggest,
  useUpdateQuestionStatus,
  useSnoozeQuestion,
  useIncrementLibraryUsage,
  useQuestionResponses,
} from "@/hooks/useQA";
import { useQaSettings, resolveTemplate, type QaSettings } from "@/hooks/useQaSettings";
import { AdLinkSearchModal } from "./AdLinkSearchModal";

interface QaResponseEditorProps {
  question: QaQuestion;
  libraryResponses: QaLibraryResponse[];
  sellerId: string;
  accountId?: string;
  storeName?: string;
}

export function QaResponseEditor({
  question,
  libraryResponses,
  sellerId,
  accountId,
  storeName,
}: QaResponseEditorProps) {
  const [content, setContent] = useState("");
  const [category, setCategory] = useState(question.category || "");
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    errors: string[];
    suggestions?: string[];
  } | null>(null);
  const [usedLibraryId, setUsedLibraryId] = useState<string | null>(null);
  const [aiOriginalText, setAiOriginalText] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { toast } = useToast();
  const createResponse = useCreateResponse();
  const updateStatus = useUpdateQuestionStatus();
  const snoozeQuestion = useSnoozeQuestion();
  const incrementUsage = useIncrementLibraryUsage();
  const { validate, isValidating } = useValidateResponse();
  const { suggest, isGenerating } = useAiSuggest();
  const { data: qaSettings } = useQaSettings(sellerId);
  
  // Fetch existing responses for this question
  const { data: existingResponses } = useQuestionResponses(question.id);
  const sentResponse = existingResponses?.find(r => r.is_sent);
  const isAnswered = question.status === "answered";

  // Reset state when question changes
  useEffect(() => {
    setContent("");
    setValidationResult(null);
    setUsedLibraryId(null);
    setAiOriginalText(null);
    setCategory(question.category || "");
  }, [question.id]);

  // Validate content when it changes
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (content.length > 20) {
        const result = await validate(content);
        setValidationResult(result);
      } else {
        setValidationResult(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [content, validate]);

  // Build final text with greeting/signature
  const buildFinalText = useCallback((rawContent: string) => {
    const ctx = { buyerName: null, storeName: storeName || null };
    const parts: string[] = [];

    if (qaSettings?.greeting_enabled) {
      parts.push(resolveTemplate(qaSettings.greeting_template, ctx));
    }
    parts.push(rawContent.trim());
    if (qaSettings?.signature_enabled) {
      parts.push(resolveTemplate(qaSettings.signature_template, ctx));
    }

    return parts.filter(Boolean).join("\n");
  }, [qaSettings, storeName]);

  const handleAiSuggest = async () => {
    try {
      const suggestion = await suggest(question.question_text, {
        title: question.item_title || undefined,
        sku: question.item_sku || undefined,
        variation: question.item_variation || undefined,
      });
      setContent(suggestion);
      setAiOriginalText(suggestion);
      setUsedLibraryId(null);
      toast({
        title: "Sugestão gerada",
        description: "Revise a resposta antes de enviar",
      });
    } catch (error) {
      toast({
        title: "Erro ao gerar sugestão",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    }
  };

  const handleLibrarySelect = (response: QaLibraryResponse) => {
    setContent(response.content);
    setUsedLibraryId(response.id);
    setAiOriginalText(null);
    incrementUsage.mutate(response.id);
  };

  const handleInsertLink = (link: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + link + content.substring(end);
      setContent(newContent);
      // Focus back and set cursor after link
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + link.length, start + link.length);
      }, 50);
    } else {
      setContent((prev) => prev + (prev ? " " : "") + link);
    }
    toast({
      title: "Link inserido",
      description: "O link do anúncio foi adicionado à resposta",
    });
  };

  const handleSaveDraft = async () => {
    if (!content.trim()) return;

    await createResponse.mutateAsync({
      question_id: question.id,
      response_text: content,
      source: usedLibraryId ? "library" : aiOriginalText ? "ai_edited" : "manual",
      library_response_id: usedLibraryId || undefined,
      ai_original_text: aiOriginalText || undefined,
      is_draft: true,
      seller_id: sellerId,
      account_id: accountId,
    });

    if (category) {
      await updateStatus.mutateAsync({ questionId: question.id, category });
    }
  };

  const handleSend = async () => {
    if (!content.trim()) return;

    // Build final text with greeting + signature
    const finalText = buildFinalText(content);

    // Final validation before send
    const result = await validate(finalText);
    if (!result.isValid) {
      setValidationResult(result);
      toast({
        title: "Envio bloqueado",
        description: "A resposta contém conteúdo não permitido",
        variant: "destructive",
      });
      return;
    }

    const sendResult = await createResponse.mutateAsync({
      question_id: question.id,
      response_text: finalText,
      source: usedLibraryId ? "library" : aiOriginalText ? (content === aiOriginalText ? "ai_suggested" : "ai_edited") : "manual",
      library_response_id: usedLibraryId || undefined,
      ai_original_text: aiOriginalText || undefined,
      is_draft: false,
      seller_id: sellerId,
      account_id: accountId,
    });

    if (category) {
      await updateStatus.mutateAsync({ questionId: question.id, category });
    }

    // Only clear content if successfully sent to ML
    if (sendResult.success) {
      setContent("");
    }
  };

  const handleSnooze = (hours: number) => {
    snoozeQuestion.mutate({ questionId: question.id, hours });
  };

  const handleMarkAttention = () => {
    updateStatus.mutate({ questionId: question.id, status: "draft" as const });
  };

  const characterCount = content.length;
  const finalTextLength = buildFinalText(content).length;
  const maxCharacters = 2000;
  const isOverLimit = finalTextLength > maxCharacters;

  return (
    <div className="space-y-4">
      {/* Question Context */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          {question.item_thumbnail && (
            <img
              src={question.item_thumbnail}
              alt=""
              className="w-16 h-16 rounded object-cover"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{question.item_title}</p>
            <div className="flex items-center gap-2 mt-1">
              {question.item_sku && (
                <Badge variant="outline" className="text-[10px]">
                  SKU: {question.item_sku}
                </Badge>
              )}
              {question.item_variation && (
                <Badge variant="outline" className="text-[10px]">
                  {question.item_variation}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <p className="text-sm text-muted-foreground mb-1">Pergunta do comprador:</p>
          <p className="text-sm font-medium">{question.question_text}</p>
        </div>

        {question.risk_level !== "low" && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {question.risk_reasons.join(", ") || "Pergunta requer atenção especial"}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Show existing answer for answered questions */}
      {isAnswered && sentResponse && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Resposta enviada</span>
            {sentResponse.sent_at && (
              <span className="text-xs text-muted-foreground ml-auto">
                {format(new Date(sentResponse.sent_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            )}
          </div>
          <p className="text-sm">{sentResponse.response_text}</p>
        </div>
      )}

      {/* Show editor only for unanswered questions */}
      {!isAnswered && (
        <>

      {/* Category Classification */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Categoria:</span>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Classificar" />
          </SelectTrigger>
          <SelectContent>
            {QUESTION_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Greeting preview */}
      {qaSettings?.greeting_enabled && content.trim() && (
        <div className="bg-primary/5 border border-primary/10 rounded-md px-3 py-2">
          <p className="text-[10px] text-muted-foreground mb-0.5">Saudação automática:</p>
          <p className="text-xs text-primary">
            {resolveTemplate(qaSettings.greeting_template, { storeName: storeName || null })}
          </p>
        </div>
      )}

      {/* Response Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Sua resposta</span>
          <div className="flex items-center gap-2">
            {/* Ad Link Search */}
            <AdLinkSearchModal sellerId={sellerId} onInsertLink={handleInsertLink} />

            {/* Library Quick Insert */}
            {libraryResponses.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    <BookOpen className="h-3 w-3 mr-1" />
                    Biblioteca
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {libraryResponses.slice(0, 10).map((response) => (
                    <DropdownMenuItem
                      key={response.id}
                      onClick={() => handleLibrarySelect(response)}
                      className="flex flex-col items-start"
                    >
                      <span className="font-medium text-xs">{response.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate w-full">
                        {response.content.substring(0, 60)}...
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* AI Suggest */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleAiSuggest}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Wand2 className="h-3 w-3 mr-1" />
              )}
              IA
            </Button>
          </div>
        </div>

        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Digite sua resposta..."
            className={cn(
              "min-h-[120px] resize-none",
              validationResult && !validationResult.isValid && "border-destructive"
            )}
          />

          {/* Character counter */}
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            {isValidating && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
            <span
              className={cn(
                "text-[10px]",
                isOverLimit ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {finalTextLength}/{maxCharacters}
            </span>
          </div>
        </div>

        {/* Signature preview */}
        {qaSettings?.signature_enabled && content.trim() && (
          <div className="bg-primary/5 border border-primary/10 rounded-md px-3 py-2">
            <p className="text-[10px] text-muted-foreground mb-0.5">Assinatura automática:</p>
            <p className="text-xs text-primary">
              {resolveTemplate(qaSettings.signature_template, { storeName: storeName || null })}
            </p>
          </div>
        )}

        {/* Validation Feedback */}
        {validationResult && (
          <div
            className={cn(
              "rounded-md p-3 text-sm",
              validationResult.isValid
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-destructive/10 text-destructive"
            )}
          >
            <div className="flex items-start gap-2">
              {validationResult.isValid ? (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Resposta validada e pronta para envio</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Conteúdo bloqueado:</p>
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      {validationResult.errors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                    {validationResult.suggestions && validationResult.suggestions.length > 0 && (
                      <div className="pt-1 border-t border-destructive/20 mt-2">
                        <p className="text-xs text-muted-foreground">Sugestões:</p>
                        <ul className="list-disc list-inside text-xs">
                          {validationResult.suggestions.map((suggestion, i) => (
                            <li key={i}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Source indicator */}
        {(usedLibraryId || aiOriginalText) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {usedLibraryId && (
              <Badge variant="secondary" className="text-[10px]">
                <BookOpen className="h-2.5 w-2.5 mr-1" />
                Da biblioteca
              </Badge>
            )}
            {aiOriginalText && (
              <Badge variant="secondary" className="text-[10px]">
                <Wand2 className="h-2.5 w-2.5 mr-1" />
                {content === aiOriginalText ? "Sugestão IA" : "IA editada"}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          {/* Snooze */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                <Clock className="h-3 w-3 mr-1" />
                Adiar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => handleSnooze(1)}>
                1 hora
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSnooze(3)}>
                3 horas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSnooze(24)}>
                Amanhã
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mark attention */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={handleMarkAttention}
              >
                <Flag className="h-3 w-3 mr-1" />
                Atenção
              </Button>
            </TooltipTrigger>
            <TooltipContent>Marcar para revisão</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2">
          {/* Save Draft */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={!content.trim() || createResponse.isPending}
          >
            <Save className="h-4 w-4 mr-1" />
            Rascunho
          </Button>

          {/* Send */}
          <Button
            size="sm"
            onClick={handleSend}
            disabled={
              !content.trim() ||
              isOverLimit ||
              (validationResult && !validationResult.isValid) ||
              createResponse.isPending
            }
          >
            {createResponse.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Enviar
          </Button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
