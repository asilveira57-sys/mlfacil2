import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AccountSwitcher } from "./AccountSwitcher";
import { Separator } from "@/components/ui/separator";

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  headerContent?: ReactNode;
}

export function DashboardLayout({ 
  children, 
  title, 
  subtitle,
  headerContent 
}: DashboardLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1">
          {/* Header */}
          <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-6" />
            {title && (
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-semibold text-foreground truncate">{title}</h1>
                {subtitle && (
                  <p className="text-xs text-muted-foreground truncate hidden sm:block">{subtitle}</p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <AccountSwitcher />
              {headerContent}
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
