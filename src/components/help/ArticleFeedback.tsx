import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

interface ArticleFeedbackProps {
  articleId: string;
  articleTitle: string;
}

export default function ArticleFeedback({ articleId, articleTitle }: ArticleFeedbackProps) {
  const [voted, setVoted] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleVote = async (vote: boolean) => {
    if (submitting || voted !== null) return;
    setSubmitting(true);

    const sessionId = sessionStorage.getItem("help_session_id") || crypto.randomUUID();
    sessionStorage.setItem("help_session_id", sessionId);

    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from("help_article_feedback").insert({
      article_id: articleId,
      user_id: user?.id || null,
      session_id: sessionId,
      vote,
    });

    setVoted(vote);
    setSubmitting(false);
  };

  if (voted !== null) {
    return (
      <div className="border rounded-lg p-6 text-center space-y-3 bg-muted/30">
        <p className="text-sm font-medium text-foreground">Obrigado pelo seu feedback.</p>
        {voted === false && (
          <Link
            to={`/contato?assunto=${encodeURIComponent("Artigo não ajudou: " + articleTitle)}`}
          >
            <Button variant="outline" size="sm" className="gap-2 mt-2">
              <MessageCircle className="h-4 w-4" /> Entrar em contato
            </Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-6 text-center space-y-3">
      <p className="text-sm font-medium text-foreground">Este artigo foi útil?</p>
      <div className="flex justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => handleVote(true)}
          disabled={submitting}
        >
          <ThumbsUp className="h-4 w-4" /> Sim
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => handleVote(false)}
          disabled={submitting}
        >
          <ThumbsDown className="h-4 w-4" /> Não
        </Button>
      </div>
    </div>
  );
}
