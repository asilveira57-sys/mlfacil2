import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useUserAccessState } from '@/hooks/useUserAccessState';
import type { 
  UserStatus, 
  FeatureFlags, 
  UserAccessState, 
  SelectedPlan 
} from '@/types/user-access';

interface UserAccessContextValue {
  // Data
  status: UserStatus | null;
  state: UserAccessState | null;
  flags: FeatureFlags | null;
  selectedPlan: SelectedPlan | null;
  
  // Loading states
  loading: boolean;
  error: string | null;
  
  // Actions
  refetch: () => Promise<void>;
  selectPlan: (planId: string) => Promise<boolean>;
  updateOnboarding: (params: {
    status?: 'pending' | 'completed';
    objective?: string[];
    printMode?: string;
    labelSize?: string;
  }) => Promise<boolean>;
  
  // Quick checks
  isAuthenticated: boolean;
  requiresOnboarding: boolean;
  trialActive: boolean;
  trialExpired: boolean;
  requiresPayment: boolean;
  canImportSales: boolean;
  canPrintLabels: boolean;
  mlConnected: boolean;
  mlIsOwner: boolean;
  mlApiAccessAllowed: boolean;
  mlApiAccessReason: string | null;
  mlApiAccessMessage: string | null;
}

const UserAccessContext = createContext<UserAccessContextValue | undefined>(undefined);

interface UserAccessProviderProps {
  children: ReactNode;
}

export function UserAccessProvider({ children }: UserAccessProviderProps) {
  const accessState = useUserAccessState();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info('[MOUNT] UserAccessProvider');
    return () => {
      // eslint-disable-next-line no-console
      console.info('[UNMOUNT] UserAccessProvider');
    };
  }, []);

  return (
    <UserAccessContext.Provider value={accessState}>
      {children}
    </UserAccessContext.Provider>
  );
}

export function useUserAccess(): UserAccessContextValue {
  const context = useContext(UserAccessContext);
  
  if (context === undefined) {
    throw new Error('useUserAccess must be used within a UserAccessProvider');
  }
  
  return context;
}

// Convenience hook for checking specific permissions
export function useCanAccess(resource: 'print_labels' | 'import_sales' | 'reports' | 'integrations'): boolean {
  const { flags, loading } = useUserAccess();
  
  if (loading || !flags) return false;
  
  switch (resource) {
    case 'print_labels':
      return flags.can_print_labels;
    case 'import_sales':
      return flags.can_import_sales;
    case 'reports':
      return flags.can_access_reports;
    case 'integrations':
      return flags.can_manage_integrations;
    default:
      return false;
  }
}

// Hook for trial status
export function useTrialStatus() {
  const { flags, loading } = useUserAccess();
  
  if (loading || !flags) {
    return {
      isActive: false,
      isExpired: false,
      daysRemaining: 0,
      endDate: null,
      warnings: [],
    };
  }
  
  return {
    isActive: flags.trial_active,
    isExpired: flags.trial_expired,
    daysRemaining: flags.trial_days_remaining,
    endDate: flags.trial_end_at ? new Date(flags.trial_end_at) : null,
    warnings: flags.trial_warnings || [],
  };
}

// Hook for onboarding status
export function useOnboardingStatus() {
  const { flags, state, loading, updateOnboarding } = useUserAccess();
  
  return {
    loading,
    requiresOnboarding: flags?.requires_onboarding ?? false,
    isCompleted: flags?.onboarding_completed ?? false,
    objective: state?.onboarding_objective || null,
    complete: () => updateOnboarding({ status: 'completed' }),
    setObjective: (objective: string[]) => updateOnboarding({ objective }),
    setPreferences: (printMode: string, labelSize: string) => 
      updateOnboarding({ printMode, labelSize }),
  };
}
