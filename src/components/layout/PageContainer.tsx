import { ReactNode, useEffect } from "react";
import { usePageHeader } from "@/components/layout/AppShellLayout";

interface PageContainerProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  headerContent?: ReactNode;
  className?: string;
}

/**
 * Simple container for pages rendered inside AppShellLayout.
 * Sets the page header and wraps children.
 */
export function PageContainer({ 
  children, 
  title = "", 
  subtitle,
  headerContent,
  className = ""
}: PageContainerProps) {
  const { setHeader } = usePageHeader();

  useEffect(() => {
    setHeader(title, subtitle, headerContent);
  }, [title, subtitle, headerContent, setHeader]);

  return (
    <div className={className}>
      {children}
    </div>
  );
}
