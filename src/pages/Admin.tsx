import { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LayoutDashboard, 
  Rocket, 
  Users, 
  CreditCard, 
  Receipt, 
  FileText, 
  Search, 
  Plug, 
  Settings,
  Tags,
  Link2,
  FileStack
} from 'lucide-react';
import { AdminDashboard } from './admin/AdminDashboard';
import { AdminOnboarding } from './admin/AdminOnboarding';
import { AdminUsers } from './admin/AdminUsers';
import { AdminPayments } from './admin/AdminPayments';
import { AdminSeo } from './admin/AdminSeo';
import { AdminIntegrations } from './admin/AdminIntegrations';
import { AdminSettings } from './admin/AdminSettings';
import { AdminModuleTags } from './admin/AdminModuleTags';
import { AdminErpIntegrations } from './admin/AdminErpIntegrations';
import { AdminInvoiceQueue } from './admin/AdminInvoiceQueue';
import BlogAdmin from './BlogAdmin';

const adminTabs = [
  { id: '', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'onboarding', label: 'Primeiros Passos', icon: Rocket },
  { id: 'usuarios', label: 'Usuários', icon: Users },
  { id: 'planos', label: 'Planos', icon: CreditCard },
  { id: 'pagamentos', label: 'Pagamentos', icon: Receipt },
  { id: 'tags', label: 'Tags', icon: Tags },
  { id: 'erp', label: 'Tiny/Olist', icon: Link2 },
  { id: 'faturamento', label: 'Fila NFS-e', icon: FileStack },
  { id: 'blog', label: 'Blog', icon: FileText },
  { id: 'seo', label: 'SEO', icon: Search },
  { id: 'integracoes', label: 'Integrações', icon: Plug },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
];

export default function Admin() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine active tab from path
  const pathParts = location.pathname.split('/admin/');
  const currentTab = pathParts[1]?.split('/')[0] || '';

  const handleTabChange = (tabId: string) => {
    navigate(`/admin/${tabId}`);
  };

  return (
    <PageContainer 
      title="Administração" 
      subtitle="Centro de controle da plataforma"
      className="p-6"
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="overflow-x-auto pb-2">
          <Tabs value={currentTab} className="w-full">
            <TabsList className="h-auto p-1 flex flex-wrap gap-1">
              {adminTabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className="flex items-center gap-2 px-3 py-2"
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Content */}
        <Routes>
          <Route index element={<AdminDashboard />} />
          <Route path="onboarding" element={<AdminOnboarding />} />
          <Route path="usuarios" element={<AdminUsers />} />
          <Route path="planos/*" element={<PlanosRedirect />} />
          <Route path="pagamentos" element={<AdminPayments />} />
          <Route path="tags" element={<AdminModuleTags />} />
          <Route path="erp" element={<AdminErpIntegrations />} />
          <Route path="faturamento" element={<AdminInvoiceQueue />} />
          <Route path="blog/*" element={<BlogAdmin />} />
          <Route path="seo" element={<AdminSeo />} />
          <Route path="integracoes" element={<AdminIntegrations />} />
          <Route path="configuracoes" element={<AdminSettings />} />
        </Routes>
      </div>
    </PageContainer>
  );
}

// Redirect to existing plans admin
function PlanosRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    // Use existing AdminPlanos component by redirecting
    navigate('/admin/planos', { replace: true });
  }, [navigate]);

  return null;
}
