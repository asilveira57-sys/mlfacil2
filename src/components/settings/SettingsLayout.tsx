import { useState, useMemo, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import {
  User, Shield, Activity, Wrench, Globe, Bell, Clock,
  Users, Palette, LayoutTemplate, ShieldCheck, FileCheck,
  Download, Key, Webhook, FileText, CreditCard, Receipt,
  History, Building2, MessageSquare, BookOpen, Headphones,
  Settings, Sun, Image, Star, LucideIcon, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageContainer } from "@/components/layout/PageContainer";
import { useConfigMenu, ConfigMenuGroup, ConfigMenuItem } from "@/hooks/useConfigMenu";

// Existing components mapped by slug
import SettingsProfile from "@/components/settings/SettingsProfile";
import SettingsBilling from "@/components/settings/SettingsBilling";
import SettingsCompanies from "@/components/settings/SettingsCompanies";
import SettingsPlan from "@/components/settings/SettingsPlan";
import SettingsCustomization from "@/components/settings/SettingsCustomization";
import { CollaboratorsCard } from "@/components/settings/collaborators";
import { SettingsLanguage } from "@/components/settings/SettingsLanguage";
import { SettingsUtilities } from "@/components/settings/SettingsUtilities";
import { SettingsSupport } from "@/components/settings/SettingsSupport";
import { SettingsTemplates } from "@/components/settings/SettingsTemplates";
import { SettingsPrivacy } from "@/components/settings/SettingsPrivacy";
import { SettingsAccessProfiles } from "@/components/settings/SettingsAccessProfiles";
import { SettingsDailyMessage } from "@/components/settings/SettingsDailyMessage";

// Icon registry
const ICON_MAP: Record<string, LucideIcon> = {
  User, Shield, Activity, Wrench, Globe, Bell, Clock,
  Users, Palette, LayoutTemplate, ShieldCheck, FileCheck,
  Download, Key, Webhook, FileText, CreditCard, Receipt,
  History, Building2, MessageSquare, BookOpen, Headphones,
  Settings, Sun, Image, Star,
};

function getIcon(key: string): LucideIcon {
  return ICON_MAP[key] || Settings;
}

// Map slugs to existing components
const COMPONENT_MAP: Record<string, React.ComponentType> = {
  'perfil': SettingsProfile,
  'idioma': SettingsLanguage,
  'colaboradores': CollaboratorsCard,
  'perfis-acesso': SettingsAccessProfiles,
  'personalizacao': SettingsCustomization,
  'cores': SettingsCustomization,
  'aparencia': SettingsTemplates,
  'tema': SettingsTemplates,
  'privacidade-lgpd': SettingsPrivacy,
  'consentimentos': SettingsPrivacy,
  'utilidades': SettingsUtilities,
  'plano': SettingsPlan,
  'faturamento': SettingsBilling,
  'empresas-contas': SettingsCompanies,
  'abrir-chamado': SettingsSupport,
  'mensagem-do-dia': SettingsDailyMessage,
};

function PlaceholderContent({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-64 border border-dashed border-border rounded-lg bg-muted/30">
      <div className="text-center space-y-2">
        <Settings className="h-10 w-10 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground font-medium">{name}</p>
        <p className="text-xs text-muted-foreground/70">Em breve</p>
      </div>
    </div>
  );
}

export function SettingsLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSlug = searchParams.get('section') || 'perfil';
  const { menuGroups, isLoading } = useConfigMenu();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const setActiveSlug = (slug: string) => {
    setSearchParams({ section: slug }, { replace: true });
  };

  const isGroupOpen = (id: string) => openGroups[id] !== false;
  const toggleGroup = (id: string) => {
    setOpenGroups(prev => ({ ...prev, [id]: !isGroupOpen(id) }));
  };

  // Find active item name
  const activeItemName = useMemo(() => {
    for (const group of menuGroups) {
      for (const item of group.items) {
        if (item.slug === activeSlug) return item.name;
        for (const child of item.children) {
          if (child.slug === activeSlug) return child.name;
          for (const sub of child.children) {
            if (sub.slug === activeSlug) return sub.name;
          }
        }
      }
    }
    return 'Configurações';
  }, [menuGroups, activeSlug]);

  const ActiveComponent = COMPONENT_MAP[activeSlug];

  const renderMenuItem = (item: ConfigMenuItem, depth: number = 0) => {
    const Icon = getIcon(item.icon);
    const hasChildren = item.children.length > 0;
    const isActive = item.slug === activeSlug;

    if (hasChildren) {
      const isOpen = isGroupOpen(item.id);
      return (
        <div key={item.id}>
          <Collapsible open={isOpen} onOpenChange={() => toggleGroup(item.id)}>
            <CollapsibleTrigger className={cn(
              "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors",
              "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
              depth > 0 && "pl-8 text-xs"
            )}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left truncate">{item.name}</span>
              <ChevronDown className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                isOpen && "rotate-180"
              )} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className={cn("ml-4 border-l border-border pl-1 mt-0.5 space-y-0.5", depth > 0 && "ml-6")}>
                {item.children.map(child => renderMenuItem(child, depth + 1))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      );
    }

    return (
      <button
        key={item.id}
        onClick={() => setActiveSlug(item.slug)}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors text-left",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          depth > 0 && "pl-8 text-xs",
          depth > 1 && "pl-12 text-xs"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{item.name}</span>
      </button>
    );
  };

  const renderGroup = (group: ConfigMenuGroup) => {
    const Icon = getIcon(group.icon);
    const isOpen = isGroupOpen(group.id);

    return (
      <div key={group.id} className="mb-1">
        <Collapsible open={isOpen !== false} onOpenChange={() => toggleGroup(group.id)}>
          <CollapsibleTrigger className={cn(
            "flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-accent/30"
          )}>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">{group.name}</span>
            <ChevronDown className={cn(
              "h-3 w-3 transition-transform duration-200",
              (isOpen !== false) && "rotate-180"
            )} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-0.5 space-y-0.5 pl-1">
              {group.items.map(item => renderMenuItem(item))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  };

  return (
    <PageContainer title="Configurações" subtitle="Gerencie sua conta e preferências">
      <div className="flex gap-6 max-w-7xl mx-auto px-4 py-6">
        {/* Vertical sidebar menu */}
        <aside className="w-64 shrink-0 hidden md:block">
          <div className="sticky top-20">
            <ScrollArea className="h-[calc(100vh-10rem)]">
              <nav className="space-y-1 pr-2">
                {isLoading ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">Carregando menu...</div>
                ) : (
                  menuGroups.map(renderGroup)
                )}
              </nav>
            </ScrollArea>
          </div>
        </aside>

        {/* Content area */}
        <main className="flex-1 min-w-0">
          {ActiveComponent ? (
            <ActiveComponent />
          ) : (
            <PlaceholderContent name={activeItemName} />
          )}
        </main>
      </div>
    </PageContainer>
  );
}
