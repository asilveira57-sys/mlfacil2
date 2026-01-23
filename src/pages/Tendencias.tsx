import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { TrendsProvider, useTrends } from '@/contexts/TrendsContext';
import { useTrendsController } from '@/hooks/useTrendsController';

// Components
import { TrendsHeaderBar } from '@/components/trends/TrendsHeaderBar';
import { TrendsStatusBanner } from '@/components/trends/TrendsStatusBanner';
import { TrendsQuickKpis } from '@/components/trends/TrendsQuickKpis';
import { MarketTrendsSection } from '@/components/trends/MarketTrendsSection';
import { KeywordTrendsList } from '@/components/trends/KeywordTrendsList';
import { TopicChips } from '@/components/trends/TopicChips';
import { BestSellersSection } from '@/components/trends/BestSellersSection';
import { SellerGoalsSection } from '@/components/trends/SellerGoalsSection';
import { TechnicalFooterAccordion } from '@/components/trends/TechnicalFooterAccordion';

// Categories list
const CATEGORIES = [
  { id: 'MLB5672', label: 'Acessórios para Veículos' },
  { id: 'MLB1367', label: 'Antiguidades e Coleções' },
  { id: 'MLB1384', label: 'Bebês' },
  { id: 'MLB1246', label: 'Beleza e Cuidado Pessoal' },
  { id: 'MLB1132', label: 'Brinquedos e Hobbies' },
  { id: 'MLB1039', label: 'Câmeras e Acessórios' },
  { id: 'MLB1574', label: 'Casa, Móveis e Decoração' },
  { id: 'MLB1051', label: 'Celulares e Telefones' },
  { id: 'MLB1648', label: 'Computadores' },
  { id: 'MLB1500', label: 'Construção' },
  { id: 'MLB1144', label: 'Eletrodomésticos' },
  { id: 'MLB1000', label: 'Eletrônicos' },
  { id: 'MLB1276', label: 'Esportes e Fitness' },
  { id: 'MLB263532', label: 'Ferramentas' },
  { id: 'MLB1499', label: 'Indústria e Comércio' },
  { id: 'MLB1182', label: 'Instrumentos Musicais' },
  { id: 'MLB3937', label: 'Joias e Relógios' },
  { id: 'MLB1196', label: 'Livros, Revistas e Comics' },
  { id: 'MLB1168', label: 'Música, Filmes e Seriados' },
  { id: 'MLB1430', label: 'Roupas e Acessórios' },
  { id: 'MLB264586', label: 'Saúde' },
];

interface MlAccount {
  id: string;
  ml_user_id: string;
  nickname: string | null;
}

// Inner component that uses the context
function TendenciasContent() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<MlAccount[]>([]);
  const [isReloading, setIsReloading] = useState(false);
  const { setAccount, setCategory, setSubcategory, effectiveCategoryId } = useTrends();
  
  const { collectPublicData, reload, snapshotDate, isLoading } = useTrendsController();
  const [isCollecting, setIsCollecting] = useState(false);

  // Load accounts on mount
  useEffect(() => {
    const loadAccounts = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      const { data } = await supabase
        .from('ml_accounts')
        .select('id, ml_user_id, nickname')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      if (data && data.length > 0) {
        setAccounts(data);
        setAccount(data[0].ml_user_id);
      }
    };
    loadAccounts();
  }, [navigate, setAccount]);

  const handleBack = () => navigate('/dashboard');

  const handleReload = () => {
    setIsReloading(true);
    reload();
    setTimeout(() => setIsReloading(false), 2000);
  };

  const handleCollect = async () => {
    setIsCollecting(true);
    await collectPublicData();
    setTimeout(() => setIsCollecting(false), 5000);
  };

  const handleSubcategoryClick = (id: string, name: string) => {
    setSubcategory(id);
  };

  const categoriesForNavigator = CATEGORIES.map(c => ({ id: c.id, name: c.label }));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <TrendsHeaderBar
        accounts={accounts}
        onBack={handleBack}
        onReload={handleReload}
        isReloading={isReloading}
        categoriesForNavigator={categoriesForNavigator}
      />

      {/* Main Content - Loading Order */}
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* 1. Status Banner */}
        <TrendsStatusBanner />

        {/* 2. Quick KPIs */}
        <TrendsQuickKpis />

        {/* 3. Market Trends */}
        <MarketTrendsSection />

        {/* 4. Keywords + Topics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <KeywordTrendsList />
          </div>
          <div>
            <TopicChips />
          </div>
        </div>

        {/* 5. Best Sellers */}
        <BestSellersSection
          onCollect={handleCollect}
          isCollecting={isCollecting}
          snapshotDate={snapshotDate}
        />

        {/* 6. Seller Goals (Conditional) */}
        <SellerGoalsSection />

        {/* 7. Technical Footer */}
        <TechnicalFooterAccordion
          onReload={handleReload}
          isReloading={isReloading}
          snapshotDate={snapshotDate}
        />
      </main>
    </div>
  );
}

// Main export with Provider wrapper
export default function Tendencias() {
  return (
    <TrendsProvider>
      <TendenciasContent />
    </TrendsProvider>
  );
}
