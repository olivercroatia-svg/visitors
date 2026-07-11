import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface OnboardingStep {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  required: boolean;
  href: string;
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  canIssueInvoices: boolean;
  missingRequired: string[];
}

export function useOnboarding() {
  return useQuery<OnboardingStatus>({
    queryKey: ['onboarding'],
    queryFn: () => api.get('/profile/onboarding'),
    staleTime: 30_000,
  });
}
