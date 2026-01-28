import { useEffect, ReactNode } from "react";
import { usePageHeader as usePageHeaderContext } from "@/components/layout/AppShellLayout";

/**
 * Hook for pages to set their header title, subtitle, and optional right-side content.
 * Call this at the top of your page component.
 * 
 * @example
 * useSetPageHeader("Dashboard", "Visão geral das suas vendas");
 * 
 * @example with header content
 * useSetPageHeader("Vendas", "Gerenciar pedidos", <Button>Atualizar</Button>);
 */
export function useSetPageHeader(
  title: string, 
  subtitle?: string, 
  headerContent?: ReactNode
) {
  const { setHeader } = usePageHeaderContext();

  useEffect(() => {
    setHeader(title, subtitle, headerContent);
  }, [title, subtitle, headerContent, setHeader]);
}

// Re-export the context hook for components that need to read header state
export { usePageHeader } from "@/components/layout/AppShellLayout";
