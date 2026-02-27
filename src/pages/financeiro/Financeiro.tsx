import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useMemo } from 'react';
import { Loader2 } from 'lucide-react';

const FinanceiroResumo = lazy(() => import('./FinanceiroResumo'));
const FinanceiroRecebimentos = lazy(() => import('./FinanceiroRecebimentos'));
const FinanceiroMovimentos = lazy(() => import('./FinanceiroMovimentos'));
const FinanceiroConciliacao = lazy(() => import('./FinanceiroConciliacao'));
const FinanceiroRotinas = lazy(() => import('./FinanceiroRotinas'));
const FinanceiroIntegracoes = lazy(() => import('./FinanceiroIntegracoes'));

const TABS = [
  { value: 'resumo', label: 'Resumo', path: '/financeiro/resumo' },
  { value: 'recebimentos', label: 'Recebimentos', path: '/financeiro/recebimentos' },
  { value: 'movimentos', label: 'Movimentos', path: '/financeiro/movimentos' },
  { value: 'conciliacao', label: 'Conciliação', path: '/financeiro/conciliacao' },
  { value: 'rotinas', label: 'Rotinas', path: '/financeiro/rotinas' },
  { value: 'integracoes', label: 'Integrações', path: '/financeiro/integracoes' },
] as const;

function FallbackLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function Financeiro() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(() => {
    const segment = location.pathname.replace('/financeiro/', '').replace('/financeiro', '');
    const found = TABS.find(t => t.value === segment);
    return found ? found.value : 'resumo';
  }, [location.pathname]);

  const handleTabChange = (value: string) => {
    const tab = TABS.find(t => t.value === value);
    if (tab) navigate(tab.path, { replace: true });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <Suspense fallback={<FallbackLoader />}>
          <TabsContent value="resumo"><FinanceiroResumo /></TabsContent>
          <TabsContent value="recebimentos"><FinanceiroRecebimentos /></TabsContent>
          <TabsContent value="movimentos"><FinanceiroMovimentos /></TabsContent>
          <TabsContent value="conciliacao"><FinanceiroConciliacao /></TabsContent>
          <TabsContent value="rotinas"><FinanceiroRotinas /></TabsContent>
          <TabsContent value="integracoes"><FinanceiroIntegracoes /></TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
