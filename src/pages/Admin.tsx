import { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useOpenTicketsCount } from '@/hooks/useOpenTicketsCount';
import { PageContainer } from '@/components/layout/PageContainer';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LayoutDashboard, Rocket, Users, Shield, CreditCard, Receipt, FileText, 
  Search, Plug, Settings, Tags, Link2, FileStack, Globe, Menu, Star,
  ClipboardList, History, Palette, Radio, CalendarDays, Sparkles, Eye, Activity, HelpCircle, Mail, Headphones, Zap,
  UserCheck,
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
import { AdminPages } from './admin/AdminPages';
import AdminMenuBuilder from './admin/menu-builder/MenuBuilderPage';
import BlogAdmin from './BlogAdmin';
import { AdminAccessProfiles } from './admin/AdminAccessProfiles';
import { AdminDailyMessages } from './admin/AdminDailyMessages';
import { AdminRatings } from './admin/AdminRatings';
import { AdminGlobalMetrics } from './admin/AdminGlobalMetrics';
import { AdminRetrospectives } from './admin/AdminRetrospectives';
import { AdminVisualIdentity } from '@/components/admin/AdminVisualIdentity';
import { AdminCanalOficial } from './admin/AdminCanalOficial';
import { AdminSocialCalendar } from './admin/AdminSocialCalendar';
import { AdminConsultantTips } from './admin/AdminConsultantTips';
import { AdminExplanatoryCards } from './admin/AdminExplanatoryCards';
import { AdminAuditLogs } from './admin/AdminAuditLogs';
import { AdminSystemStatus } from './admin/AdminSystemStatus';
import { AdminExecutionMonitor } from './admin/AdminExecutionMonitor';
import AdminContatos from './admin/AdminContatos';
import AdminCentralDeAjuda from './admin/AdminCentralDeAjuda';
import { AdminEmails } from './admin/AdminEmails';
import AdminSuporte from './admin/AdminSuporte';
import { AdminClientes } from './admin/AdminClientes';
import AdminConsents from './admin/AdminConsents';

const adminTabs = [
  { id: '', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'onboarding', label: 'Primeiros Passos', icon: Rocket },
  { id: 'canal-oficial', label: 'Canal Oficial', icon: Radio },
  { id: 'calendario-social', label: 'Calendário Social', icon: CalendarDays },
  { id: 'dica-consultor', label: 'Dica Consultor', icon: Sparkles },
  { id: 'clientes', label: 'Clientes', icon: UserCheck },
  { id: 'usuarios', label: 'Usuários', icon: Users },
  { id: 'perfis', label: 'Perfis', icon: Shield },
  { id: 'colaboradores', label: 'Colaboradores', icon: Users },
  { id: 'planos', label: 'Planos', icon: CreditCard },
  { id: 'pagamentos', label: 'Pagamentos', icon: Receipt },
  { id: 'tags', label: 'Tags', icon: Tags },
  { id: 'erp', label: 'Tiny/Olist', icon: Link2 },
  { id: 'faturamento', label: 'Fila NFS-e', icon: FileStack },
  { id: 'blog', label: 'Blog', icon: FileText },
  { id: 'paginas', label: 'Páginas', icon: Globe },
  { id: 'seo', label: 'SEO', icon: Search },
  { id: 'integracoes', label: 'Integrações', icon: Plug },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
  { id: 'menu-builder', label: 'Menu', icon: Menu },
  { id: 'mensagem-dia', label: 'Msg do Dia', icon: FileText },
  { id: 'avaliacoes', label: 'Avaliações', icon: Star },
  { id: 'global-metrics', label: 'Contador Global', icon: Globe },
  { id: 'retrospectiva', label: 'Retrospectiva', icon: History },
  { id: 'logs', label: 'Auditoria', icon: ClipboardList },
  { id: 'identidade-visual', label: 'Identidade Visual', icon: Palette },
  { id: 'cards-explicativos', label: 'Cards Explicativos', icon: Eye },
  { id: 'system-status', label: 'Status Sistema', icon: Activity },
  { id: 'execution-monitor', label: 'Motor Execução', icon: Zap },
  { id: 'contatos', label: 'Contatos', icon: Users },
  { id: 'central-de-ajuda', label: 'Central Ajuda', icon: HelpCircle },
  { id: 'emails', label: 'Comunicação', icon: Mail },
  { id: 'suporte', label: 'Suporte', icon: Headphones },
  { id: 'consentimentos', label: 'Consentimentos', icon: Shield },
];

export default function Admin() {
  const navigate = useNavigate();
  const location = useLocation();
  const openTicketsCount = useOpenTicketsCount();
  
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
                  {tab.id === 'suporte' && openTicketsCount > 0 && (
                    <span className="ml-1 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
                      {openTicketsCount}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Content */}
        <Routes>
          <Route index element={<AdminDashboard />} />
          <Route path="calendario-social" element={<AdminSocialCalendar />} />
          <Route path="onboarding" element={<AdminOnboarding />} />
          <Route path="canal-oficial" element={<AdminCanalOficial />} />
          <Route path="usuarios" element={<AdminUsers />} />
          <Route path="clientes" element={<AdminClientes />} />
          <Route path="perfis" element={<AdminAccessProfiles />} />
          <Route path="colaboradores" element={<AdminCollaboratorsPlaceholder />} />
          <Route path="planos/*" element={<PlanosRedirect />} />
          <Route path="pagamentos" element={<AdminPayments />} />
          <Route path="tags" element={<AdminModuleTags />} />
          <Route path="erp" element={<AdminErpIntegrations />} />
          <Route path="faturamento" element={<AdminInvoiceQueue />} />
          <Route path="blog/*" element={<BlogAdmin />} />
          <Route path="paginas" element={<AdminPages />} />
          <Route path="seo" element={<AdminSeo />} />
          <Route path="integracoes" element={<AdminIntegrations />} />
          <Route path="configuracoes" element={<AdminSettings />} />
          <Route path="menu-builder" element={<AdminMenuBuilder />} />
          <Route path="mensagem-dia" element={<AdminDailyMessages />} />
          <Route path="avaliacoes" element={<AdminRatings />} />
          <Route path="global-metrics" element={<AdminGlobalMetrics />} />
          <Route path="retrospectiva" element={<AdminRetrospectives />} />
          <Route path="logs" element={<AdminAuditLogs />} />
          <Route path="identidade-visual" element={<AdminVisualIdentity />} />
          <Route path="dica-consultor" element={<AdminConsultantTips />} />
          <Route path="cards-explicativos" element={<AdminExplanatoryCards />} />
          <Route path="system-status" element={<AdminSystemStatus />} />
          <Route path="execution-monitor" element={<AdminExecutionMonitor />} />
          <Route path="contatos" element={<AdminContatos />} />
          <Route path="central-de-ajuda" element={<AdminCentralDeAjuda />} />
          <Route path="emails" element={<AdminEmails />} />
          <Route path="suporte" element={<AdminSuporte />} />
          <Route path="consentimentos" element={<AdminConsents />} />
        </Routes>
      </div>
    </PageContainer>
  );
}

// Redirect to existing plans admin
function PlanosRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/admin/planos', { replace: true });
  }, [navigate]);
  return null;
}

function AdminCollaboratorsPlaceholder() {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
      <h3 className="text-lg font-medium mb-2">Colaboradores</h3>
      <p>Gerenciamento de colaboradores em desenvolvimento.</p>
    </div>
  );
}

