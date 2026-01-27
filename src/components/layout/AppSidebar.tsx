import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Megaphone,
  DollarSign,
  BarChart3,
  FileText,
  Tag,
  Settings,
  Activity,
  Target,
  Store,
  Package,
  Printer,
  ListChecks,
  LogOut,
  TrendingUp,
  ChevronDown,
  MessageSquareText,
  Shield,
  Tags,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useModuleTagsMap } from "@/hooks/useModuleTags";
import { ModuleTagsDisplay } from "@/components/admin/ModuleTagBadge";

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  badge?: string;
  moduleId?: string; // For tag lookup
}

const mainNavItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, moduleId: "dashboard" },
  { title: "Vendas", url: "/shipping-labels", icon: Package, moduleId: "etiquetas" },
  { title: "Tarefas", url: "/tarefas", icon: ListChecks, moduleId: "tarefas" },
  { title: "Promoções", url: "/promocoes", icon: Tag, moduleId: "promocoes" },
  { title: "Mercado ADS", url: "/publicidade", icon: Megaphone, moduleId: "publicidade" },
  { title: "Pós-Venda", url: "/mensagens", icon: MessageSquareText, moduleId: "pos-venda" },
  { title: "Perguntas", url: "/perguntas", icon: MessageSquareText, moduleId: "perguntas" },
];

const analyticsNavItems: NavItem[] = [
  { title: "Radiografia", url: "/radiografia", icon: Activity, moduleId: "radiografia" },
  { title: "Mercado", url: "/mercado", icon: Store, moduleId: "mercado" },
  { title: "Tendências", url: "/tendencias", icon: TrendingUp, moduleId: "tendencias" },
  { title: "Concorrência", url: "/concorrencia", icon: Target, moduleId: "concorrencia" },
  { title: "Curva ABC", url: "/abc-analysis", icon: BarChart3, moduleId: "abc" },
  { title: "Custos", url: "/custos", icon: DollarSign, moduleId: "custos" },
];

const toolsNavItems: NavItem[] = [
  { title: "ZPL Converter", url: "/zpl-converter", icon: Printer },
  { title: "Relatórios", url: "/dashboard", icon: FileText, badge: "Em breve" },
];

const configNavItems: NavItem[] = [
  { title: "Configurações", url: "/settings", icon: Settings },
];

const adminNavItems: NavItem[] = [
  { title: "Dashboard Admin", url: "/admin", icon: LayoutDashboard },
  { title: "Usuários", url: "/admin/usuarios", icon: Settings },
  { title: "Planos", url: "/admin/planos", icon: Settings },
  { title: "Pagamentos", url: "/admin/pagamentos", icon: Settings },
  { title: "Tags de Módulos", url: "/admin/tags", icon: Tags },
  { title: "Blog", url: "/admin/blog", icon: FileText },
  { title: "SEO", url: "/admin/seo", icon: Settings },
  { title: "Integrações", url: "/admin/integracoes", icon: Settings },
  { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { state } = useSidebar();
  const { isAdmin } = useUserRole();
  const moduleTagsMap = useModuleTagsMap();
  const isCollapsed = state === "collapsed";
  
  // State for collapsible groups
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Principal: true,
    Analytics: true,
    Ferramentas: true,
    Sistema: true,
    Admin: true,
  });

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (url: string) => location.pathname === url || location.pathname.startsWith(url + '/');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso",
    });
    navigate("/auth");
  };

  const NavGroup = ({ label, items, icon: GroupIcon }: { label: string; items: NavItem[]; icon?: React.ElementType }) => {
    const isOpen = openGroups[label] ?? true;
    
    // When collapsed, show items directly without collapsible header
    if (isCollapsed) {
      return (
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const moduleTags = item.moduleId ? moduleTagsMap.get(item.moduleId) || [] : [];
                return (
                  <SidebarMenuItem key={item.title}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive(item.url)}
                          className={cn(
                            "transition-colors",
                            isActive(item.url) && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          )}
                        >
                          <button
                            onClick={() => navigate(item.url)}
                            className="flex items-center gap-3 w-full"
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                          </button>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="flex items-center gap-2">
                        {item.title}
                        {item.badge && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {item.badge}
                          </span>
                        )}
                        {moduleTags.length > 0 && (
                          <ModuleTagsDisplay tags={moduleTags} size="sm" maxDisplay={1} />
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      );
    }
    
    return (
      <SidebarGroup>
        <Collapsible open={isOpen} onOpenChange={() => toggleGroup(label)}>
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent/50 rounded-md transition-colors flex items-center justify-between pr-2">
              <span className="flex items-center gap-2">
                {GroupIcon && <GroupIcon className="h-4 w-4" />}
                {label}
              </span>
              <ChevronDown className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-180"
              )} />
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => {
                  const moduleTags = item.moduleId ? moduleTagsMap.get(item.moduleId) || [] : [];
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.url)}
                        className={cn(
                          "transition-colors",
                          isActive(item.url) && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        )}
                      >
                        <button
                          onClick={() => navigate(item.url)}
                          className="flex items-center gap-3 w-full"
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate">{item.title}</span>
                          {item.badge && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {item.badge}
                            </span>
                          )}
                          {moduleTags.length > 0 && (
                            <ModuleTagsDisplay tags={moduleTags} size="sm" maxDisplay={1} />
                          )}
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary-light rounded-lg flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-sidebar-foreground truncate">
                Mktpfacil
              </h2>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">
                Analytics Pro
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <NavGroup label="Principal" items={mainNavItems} />
        <NavGroup label="Analytics" items={analyticsNavItems} />
        <NavGroup label="Ferramentas" items={toolsNavItems} />
        <NavGroup label="Sistema" items={configNavItems} />
        
        {/* Admin Section - Only visible to admins */}
        {isAdmin && (
          <NavGroup label="Admin" items={adminNavItems} icon={Shield} />
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  onClick={handleSignOut}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span>Sair</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right">Sair</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
