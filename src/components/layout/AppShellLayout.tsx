import { ReactNode, createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AccountSwitcher } from "./AccountSwitcher";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Separator } from "@/components/ui/separator";
import { NotificationBell } from "@/components/notifications";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { useRefreshPolicy } from "@/contexts/RefreshPolicyContext";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FloatingSupportButton } from "@/components/support/FloatingSupportButton";
import { HeaderUtilities } from "@/components/utilities";

// Context for page-level header customization
interface PageHeaderContextType {
  title: string;
  subtitle?: string;
  headerContent?: ReactNode;
  setHeader: (title: string, subtitle?: string, headerContent?: ReactNode) => void;
}

const PageHeaderContext = createContext<PageHeaderContextType | null>(null);

export function usePageHeader() {
  const context = useContext(PageHeaderContext);
  if (!context) {
    throw new Error("usePageHeader must be used within AppShellLayout");
  }
  return context;
}

// Hook for pages to set their header - stable reference
export function useSetPageHeader(title: string, subtitle?: string, headerContent?: ReactNode) {
  const { setHeader } = usePageHeader();

  // Avoid setState during render (can create render loops).
  // Also avoid depending on inline JSX references for headerContent.
  const headerContentRef = useRef<ReactNode>(headerContent);
  headerContentRef.current = headerContent;

  useEffect(() => {
    setHeader(title, subtitle, headerContentRef.current);
  }, [title, subtitle, setHeader]);
}

export function AppShellLayout() {
  const { t } = useTranslation();
  const { sellerId } = useActiveAccount();
  const { manualRefresh, isRefreshing } = useRefreshPolicy();
  const location = useLocation();
  const [headerState, setHeaderState] = useState({
    title: "",
    subtitle: undefined as string | undefined,
    headerContent: undefined as ReactNode,
  });

  const setHeader = useCallback((title: string, subtitle?: string, headerContent?: ReactNode) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[HEADER] setHeader", { title, subtitle, hasHeaderContent: !!headerContent });
    }
    setHeaderState(prev => {
      // Only update if something changed
      if (prev.title === title && prev.subtitle === subtitle && prev.headerContent === headerContent) {
        return prev;
      }
      return { title, subtitle, headerContent };
    });
  }, []);

  const contextValue: PageHeaderContextType = {
    title: headerState.title,
    subtitle: headerState.subtitle,
    headerContent: headerState.headerContent,
    setHeader,
  };


  return (
    <PageHeaderContext.Provider value={contextValue}>
      <SidebarProvider defaultOpen={true}>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex flex-col flex-1">
            {/* Header */}
            <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="h-6" />
              {headerState.title && (
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-semibold text-foreground truncate">{headerState.title}</h1>
                  {headerState.subtitle && (
                    <p className="text-xs text-muted-foreground truncate hidden sm:block">{headerState.subtitle}</p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <HeaderUtilities />
                <Separator orientation="vertical" className="h-6 hidden sm:block" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={manualRefresh}
                      disabled={isRefreshing}
                      className="h-8 w-8"
                      aria-label={t('common:refresh_data')}
                    >
                      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('common:refresh_data')}</p>
                  </TooltipContent>
                </Tooltip>
                <LanguageSwitcher variant="compact" />
                <NotificationBell sellerId={sellerId} />
                <AccountSwitcher />
                {headerState.headerContent}
              </div>
            </header>

            {/* Main Content - Outlet renders the matched route */}
            <main className="flex-1 overflow-auto">
              <Outlet />
            </main>
          </SidebarInset>
          <FloatingSupportButton />
        </div>
      </SidebarProvider>
    </PageHeaderContext.Provider>
  );
}
