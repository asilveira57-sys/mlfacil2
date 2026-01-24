import { useUserRole } from '@/hooks/useUserRole';
import { Skeleton } from '@/components/ui/skeleton';

interface AdminOnlyProps {
  children: React.ReactNode;
  /** Optional fallback to show while loading. Defaults to nothing. */
  loadingFallback?: React.ReactNode;
  /** If true, shows a skeleton while loading. */
  showSkeleton?: boolean;
  /** Height of skeleton if showSkeleton is true */
  skeletonHeight?: string;
}

/**
 * Component that only renders children if the current user is an admin.
 * For use in UI elements like cards/buttons that should be hidden from sellers.
 * Does NOT redirect - just hides content silently.
 */
export function AdminOnly({ 
  children, 
  loadingFallback = null,
  showSkeleton = false,
  skeletonHeight = '120px'
}: AdminOnlyProps) {
  const { isAdmin, loading } = useUserRole();

  if (loading) {
    if (showSkeleton) {
      return <Skeleton className="w-full" style={{ height: skeletonHeight }} />;
    }
    return <>{loadingFallback}</>;
  }

  if (!isAdmin) {
    return null;
  }

  return <>{children}</>;
}
