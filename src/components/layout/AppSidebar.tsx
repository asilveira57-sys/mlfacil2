import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  History,
  Sprout,
  BookOpen,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
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
import { useCollaboratorAccess } from "@/hooks/useCollaboratorAccess";
import { ModuleTagsDisplay } from "@/components/admin/ModuleTagBadge";

interface NavItem {
  titleKey: string; // i18n key
  url: string;
  icon: React.ElementType;
  badgeKey?: string; // i18n key for badge
  moduleId?: string;
  moduleKey?: string;
}

// IDs devem coincidir com system_modules.id no banco de dados
// moduleKey é usado para controle de acesso de colaboradores
const mainNavItems: NavItem[] = [
  { titleKey: "nav:dashboard", url: "/dashboard", icon: LayoutDashboard, moduleId: "dashboard", moduleKey: "dashboard" },
  { titleKey: "nav:sales", url: "/shipping-labels", icon: Package, moduleId: "etiquetas", moduleKey: "etiquetas" },
  { titleKey: "nav:tasks", url: "/tarefas", icon: ListChecks, moduleId: "tarefas", moduleKey: "tarefas" },
  { titleKey: "nav:send", url: "/send", icon: Sprout, moduleId: "send", moduleKey: "send" },
  { titleKey: "nav:promotions", url: "/promocoes", icon: Tag, moduleId: "promocoes", moduleKey: "promocoes" },
  { titleKey: "nav:ads", url: "/publicidade", icon: Megaphone, moduleId: "publicidade", moduleKey: "mercado_ads" },
  { titleKey: "nav:timeline", url: "/anuncios/linha-do-tempo", icon: History, moduleId: "linha-do-tempo", moduleKey: "linha_do_tempo" },
  { titleKey: "nav:post_sale", url: "/mensagens", icon: MessageSquareText, moduleId: "pos-venda", moduleKey: "pos_venda" },
  { titleKey: "nav:questions", url: "/perguntas", icon: MessageSquareText, moduleId: "perguntas", moduleKey: "perguntas" },
];

const analyticsNavItems: NavItem[] = [
  { titleKey: "nav:radiography", url: "/radiografia", icon: Activity, moduleId: "radiografia", moduleKey: "radiografia" },
  { titleKey: "nav:market", url: "/mercado", icon: Store, moduleId: "mercado", moduleKey: "mercado" },
  { titleKey: "nav:trends", url: "/tendencias", icon: TrendingUp, moduleId: "tendencias", moduleKey: "tendencias" },
  { titleKey: "nav:competitor", url: "/concorrencia", icon: Target, moduleId: "concorrencia", moduleKey: "concorrencia" },
  { titleKey: "nav:abc_analysis", url: "/abc-analysis", icon: BarChart3, moduleId: "abc", moduleKey: "abc" },
  { titleKey: "nav:costs", url: "/custos", icon: DollarSign, moduleId: "custos", moduleKey: "custos" },
];

const toolsNavItems: NavItem[] = [
  { titleKey: "nav:zpl_converter", url: "/zpl-converter", icon: Printer },
  { titleKey: "nav:blog", url: "/blog", icon: BookOpen, badgeKey: "nav:coming_soon" },
  { titleKey: "nav:reports", url: "/dashboard", icon: FileText, badgeKey: "nav:coming_soon" },
];

const configNavItems: NavItem[] = [
  { titleKey: "nav:settings", url: "/settings", icon: Settings },
];

const adminNavItems: NavItem[] = [
  { titleKey: "nav:admin_dashboard", url: "/admin", icon: LayoutDashboard },
  { titleKey: "nav:users", url: "/admin/usuarios", icon: Settings },
  { titleKey: "nav:plans", url: "/admin/planos", icon: Settings },
  { titleKey: "nav:payments", url: "/admin/pagamentos", icon: Settings },
  { titleKey: "nav:module_tags", url: "/admin/tags", icon: Tags },
  { titleKey: "nav:blog", url: "/admin/blog", icon: FileText },
  { titleKey: "nav:seo", url: "/admin/seo", icon: Settings },
  { titleKey: "nav:integrations", url: "/admin/integracoes", icon: Settings },
  { titleKey: "nav:settings", url: "/admin/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { state } = useSidebar();
  const { isAdmin } = useUserRole();
  const moduleTagsMap = useModuleTagsMap();
  const { hasModuleAccess, isCollaborator } = useCollaboratorAccess();
  const isCollapsed = state === "collapsed";

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info('[MOUNT] AppSidebar');
    return () => {
      // eslint-disable-next-line no-console
      console.info('[UNMOUNT] AppSidebar');
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info('[NAV] AppSidebar', location.pathname);
  }, [location.pathname]);
  
  // State for collapsible groups - use translation keys
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    main: true,
    analytics: true,
    tools: true,
    system: true,
    admin: true,
  });

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isActive = (url: string) => location.pathname === url || location.pathname.startsWith(url + '/');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: t('nav:logout_success'),
      description: t('nav:logout_description'),
    });
    navigate("/auth");
  };

  const NavGroup = ({ groupKey, labelKey, items, icon: GroupIcon }: { 
    groupKey: string;
    labelKey: string; 
    items: NavItem[]; 
    icon?: React.ElementType 
  }) => {
    const isOpen = openGroups[groupKey] ?? true;
    
    // Filter items based on collaborator access
    const filteredItems = items.filter(item => {
      if (!item.moduleKey) return true;
      return hasModuleAccess(item.moduleKey);
    });
    
    if (filteredItems.length === 0) return null;
    
    // When collapsed, show items directly without collapsible header
    if (isCollapsed) {
      return (
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => {
                const moduleTags = item.moduleId ? moduleTagsMap.get(item.moduleId) || [] : [];
                const title = t(item.titleKey);
                const badge = item.badgeKey ? t(item.badgeKey) : undefined;
                
                return (
                  <SidebarMenuItem key={item.titleKey}>
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
                        {title}
                        {badge && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {badge}
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
        <Collapsible open={isOpen} onOpenChange={() => toggleGroup(groupKey)}>
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent/50 rounded-md transition-colors flex items-center justify-between pr-2">
              <span className="flex items-center gap-2">
                {GroupIcon && <GroupIcon className="h-4 w-4" />}
                {t(labelKey)}
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
                {filteredItems.map((item) => {
                  const moduleTags = item.moduleId ? moduleTagsMap.get(item.moduleId) || [] : [];
                  const title = t(item.titleKey);
                  const badge = item.badgeKey ? t(item.badgeKey) : undefined;
                  
                  return (
                    <SidebarMenuItem key={item.titleKey}>
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
                          <span className="flex-1 truncate">{title}</span>
                          {badge && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {badge}
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
        <NavGroup groupKey="main" labelKey="nav:main_menu" items={mainNavItems} />
        <NavGroup groupKey="analytics" labelKey="nav:analytics" items={analyticsNavItems} />
        <NavGroup groupKey="tools" labelKey="nav:tools" items={toolsNavItems} />
        <NavGroup groupKey="system" labelKey="nav:system" items={configNavItems} />
        
        {/* Admin Section - Only visible to admins */}
        {isAdmin && (
          <NavGroup groupKey="admin" labelKey="nav:admin" items={adminNavItems} icon={Shield} />
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
                  {!isCollapsed && <span>{t('nav:logout')}</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right">{t('nav:logout')}</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
