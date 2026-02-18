import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  LayoutDashboard, Megaphone, DollarSign, BarChart3, FileText, Tag,
  Settings, Activity, Target, Store, Package, Printer, ListChecks,
  LogOut, TrendingUp, ChevronDown, MessageSquareText, Shield, Tags,
  History, Sprout, BookOpen, Calculator, Percent, Truck, Bell, Star,
  Wrench, LucideIcon,
} from "lucide-react";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDynamicMenu, DynamicMenuItem } from "@/hooks/useDynamicMenu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

// Icon registry
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, Megaphone, DollarSign, BarChart3, FileText, Tag,
  Settings, Activity, Target, Store, Package, Printer, ListChecks,
  TrendingUp, MessageSquareText, Shield, Tags, History, Sprout,
  BookOpen, Calculator, Percent, Truck, Bell, Star, Wrench,
};

function getIcon(key: string): LucideIcon {
  return ICON_MAP[key] || Settings;
}

export function DynamicSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { state: sidebarState } = useSidebar();
  const isCollapsed = sidebarState === "collapsed";
  const { menuTree, isLoading } = useDynamicMenu();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [comingSoonDialog, setComingSoonDialog] = useState<string | null>(null);

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => ({ ...prev, [key]: prev[key] === false ? true : (prev[key] === undefined ? false : !prev[key]) }));
  };

  const isGroupOpen = (key: string) => openGroups[key] !== false;

  const isActive = (url: string | null) => {
    if (!url) return false;
    return location.pathname === url || location.pathname.startsWith(url + '/');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({ title: "Logout realizado", description: "Você foi desconectado com sucesso" });
    navigate("/auth");
  };

  const handleItemClick = (item: DynamicMenuItem, e: React.MouseEvent) => {
    if (item.status === 'coming_soon') {
      e.preventDefault();
      setComingSoonDialog(item.label);
    }
  };

  const renderStatusBadge = (status: string) => {
    if (status === 'beta') {
      return (
        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-accent text-accent-foreground">
          Beta
        </Badge>
      );
    }
    if (status === 'coming_soon') {
      return (
        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-muted text-muted-foreground">
          Em breve
        </Badge>
      );
    }
    return null;
  };

  // Render a leaf item (has route)
  const renderLeafItem = (item: DynamicMenuItem) => {
    const Icon = getIcon(item.icon_key);
    const active = isActive(item.route);

    if (isCollapsed) {
      return (
        <SidebarMenuItem key={item.id}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton
                asChild={item.status !== 'coming_soon'}
                isActive={active}
                className={cn(
                  "transition-colors",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                  item.status === 'coming_soon' && "opacity-60 cursor-default"
                )}
                onClick={item.status === 'coming_soon' ? (e: React.MouseEvent) => handleItemClick(item, e) : undefined}
              >
                {item.status === 'coming_soon' ? (
                  <div className="flex items-center gap-3 w-full">
                    <Icon className="h-4 w-4 shrink-0" />
                  </div>
                ) : (
                  <Link to={item.route!} className="flex items-center gap-3 w-full">
                    <Icon className="h-4 w-4 shrink-0" />
                  </Link>
                )}
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">
              {item.label}
              {renderStatusBadge(item.status)}
            </TooltipContent>
          </Tooltip>
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton
          asChild={item.status !== 'coming_soon'}
          isActive={active}
          className={cn(
            "transition-colors",
            active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
            item.status === 'coming_soon' && "opacity-60 cursor-default"
          )}
          onClick={item.status === 'coming_soon' ? (e: React.MouseEvent) => handleItemClick(item, e) : undefined}
        >
          {item.status === 'coming_soon' ? (
            <div className="flex items-center gap-3 w-full">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {renderStatusBadge(item.status)}
            </div>
          ) : (
            <Link to={item.route!} className="flex items-center gap-3 w-full">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {renderStatusBadge(item.status)}
            </Link>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  // Render a group with children
  const renderGroup = (item: DynamicMenuItem, depth: number = 0) => {
    const Icon = getIcon(item.icon_key);
    const isOpen = isGroupOpen(item.id);
    const hasLeafChildren = item.children.some(c => c.route);
    const hasGroupChildren = item.children.some(c => !c.route && c.children.length > 0);

    // Root-level groups (depth 0) use SidebarGroup with collapsible
    if (depth === 0) {
      if (isCollapsed) {
        // In collapsed mode, flatten and show only leaf items with tooltips
        const leafItems = collectLeafItems(item);
        if (leafItems.length === 0) return null;
        return (
          <SidebarGroup key={item.id}>
            <SidebarGroupContent>
              <SidebarMenu>
                {leafItems.map(renderLeafItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      }

      return (
        <SidebarGroup key={item.id}>
          <Collapsible open={isOpen} onOpenChange={() => toggleGroup(item.id)}>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent/50 rounded-md transition-colors flex items-center justify-between pr-2">
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {item.status === 'coming_soon' && renderStatusBadge(item.status)}
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
                  {item.children.map(child => {
                    if (child.route) return renderLeafItem(child);
                    if (child.children.length > 0) return renderGroup(child, depth + 1);
                    return null;
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      );
    }

    // Nested groups (depth > 0) use smaller collapsible sections
    return (
      <div key={item.id} className="mt-1">
        <Collapsible open={isGroupOpen(item.id)} onOpenChange={() => toggleGroup(item.id)}>
          <CollapsibleTrigger className="flex items-center gap-2 px-2 py-1 w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-sidebar-accent/30">
            <Icon className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">{item.label}</span>
            {item.status === 'coming_soon' && renderStatusBadge(item.status)}
            <ChevronDown className={cn(
              "h-3 w-3 transition-transform duration-200",
              isGroupOpen(item.id) && "rotate-180"
            )} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-2 border-l border-sidebar-border pl-2 mt-0.5">
              {item.children.map(child => {
                if (child.route) return renderLeafItem(child);
                if (child.children.length > 0) return renderGroup(child, depth + 1);
                return null;
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  };

  // Collect all leaf items from a tree (for collapsed mode)
  const collectLeafItems = (item: DynamicMenuItem): DynamicMenuItem[] => {
    const leaves: DynamicMenuItem[] = [];
    const traverse = (node: DynamicMenuItem) => {
      if (node.route) {
        leaves.push(node);
      } else {
        node.children.forEach(traverse);
      }
    };
    item.children.forEach(traverse);
    return leaves;
  };

  if (isLoading) {
    return (
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-primary-foreground" />
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-sidebar-foreground truncate">Mktpfacil</h2>
                <p className="text-[10px] text-sidebar-foreground/60 truncate">Analytics Pro</p>
              </div>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <div className="p-4 text-xs text-muted-foreground">Carregando menu...</div>
        </SidebarContent>
      </Sidebar>
    );
  }

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-primary-foreground" />
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-sidebar-foreground truncate">Mktpfacil</h2>
                <p className="text-[10px] text-sidebar-foreground/60 truncate">Analytics Pro</p>
              </div>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2">
          {menuTree.map(rootItem => renderGroup(rootItem, 0))}
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

      {/* Coming Soon Dialog */}
      <Dialog open={!!comingSoonDialog} onOpenChange={() => setComingSoonDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{comingSoonDialog}</DialogTitle>
            <DialogDescription>
              Este módulo está sendo desenvolvido e estará disponível em breve. Fique ligado nas novidades!
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
