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

  // Avoid header update loops:
  // Many pages pass inline JSX (new reference each render). If we depend on
  // `headerContent`, the effect runs every render, causing AppShell re-renders
  // that look like a "refresh".
  const headerContentRef = useRef<ReactNode>(headerContent);
  headerContentRef.current = headerContent;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info("[MOUNT] PageContainer", { title, pathname });
    return () => {
      // eslint-disable-next-line no-console
      console.info("[UNMOUNT] PageContainer", { title, pathname });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setHeader(title, subtitle, headerContentRef.current);
  }, [title, subtitle, setHeader]);

  return (
    <div className={className}>
      {children}
    </div>
  );
}
