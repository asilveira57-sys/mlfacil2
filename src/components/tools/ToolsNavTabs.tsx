import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QrCode, TrendingUp, Calculator } from "lucide-react";

export function ToolsNavTabs() {
  const { t } = useTranslation('tools');
  const navigate = useNavigate();
  const location = useLocation();

  const currentTab = location.pathname.includes('/zpl') 
    ? 'zpl' 
    : location.pathname.includes('/tendencias') 
    ? 'trends' 
    : 'pricing';

  const handleTabChange = (value: string) => {
    switch (value) {
      case 'zpl':
        navigate('/ferramentas/zpl');
        break;
      case 'trends':
        navigate('/ferramentas/tendencias');
        break;
      case 'pricing':
        navigate('/ferramentas/precificacao');
        break;
    }
  };

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto">
        <TabsTrigger value="zpl" className="gap-2">
          <QrCode className="w-4 h-4" />
          <span className="hidden sm:inline">{t('nav.zpl')}</span>
        </TabsTrigger>
        <TabsTrigger value="trends" className="gap-2">
          <TrendingUp className="w-4 h-4" />
          <span className="hidden sm:inline">{t('nav.trends')}</span>
        </TabsTrigger>
        <TabsTrigger value="pricing" className="gap-2">
          <Calculator className="w-4 h-4" />
          <span className="hidden sm:inline">{t('nav.pricing')}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
