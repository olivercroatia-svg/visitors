import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AppSettings {
  pdvThresholdEur: number;
  warnLevels: number[];
  fiscalRetryDeadlineHours: number;
}

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: ['settings'],
    queryFn: () => api.get<AppSettings>('/meta/settings'),
    staleTime: 5 * 60_000,
  });
}
