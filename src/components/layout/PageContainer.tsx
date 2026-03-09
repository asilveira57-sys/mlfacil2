import { ReactNode, useEffect, useRef } from "react";
import { usePageHeader } from "@/components/layout/AppShellLayout";
import { useLocation } from "react-router-dom";

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
  const { pathname } = useLocation();

  // Keep header in sync. We store headerContent in a ref to avoid running
  // the effect on every render (inline JSX = new reference each render).
  // However we also need to re-run when the content *meaningfully* changes
  // (e.g. workspace loads and the button appears). We use a simple boolean
  // flag to detect presence changes without causing infinite loops.
  const headerContentRef = useRef<ReactNode>(headerContent);
  headerContentRef.current = headerContent;
  const hasHeaderContent = !!headerContent;

  useEffect(() => {
    setHeader(title, subtitle, headerContentRef.current);
  }, [title, subtitle, setHeader, hasHeaderContent]);

  return (
    <div className={className}>
      {children}
    </div>
  );
}
