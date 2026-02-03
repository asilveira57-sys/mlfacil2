import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

export function ToolsPromoCard() {
  const { t } = useTranslation('tools');
  const navigate = useNavigate();

  return (
    <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
      <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">
              {t('promo.title')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('promo.description')}
            </p>
          </div>
        </div>
        <Button 
          onClick={() => navigate("/planos")}
          className="gap-2 whitespace-nowrap"
        >
          {t('promo.cta')}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
