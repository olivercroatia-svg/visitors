import { useSearchParams } from 'react-router-dom';
import { BadgeCheck, Building2, Home, MapPin, Tag } from 'lucide-react';
import { ProfileSection } from './ProfileSection';
import { PremisesSection } from './PremisesSection';
import { ServicesSection } from './ServicesSection';
import { ObjectsSection } from '@/features/evisitor/ObjectsSection';
import { CredentialsSection } from '@/features/evisitor/CredentialsSection';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'obrt', label: 'Obrt', icon: Building2 },
  { key: 'prostori', label: 'Prostori', icon: MapPin },
  { key: 'usluge', label: 'Usluge', icon: Tag },
  { key: 'objekti', label: 'Objekti', icon: Home },
  { key: 'evisitor', label: 'eVisitor', icon: BadgeCheck },
] as const;

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const active = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab')! : 'obrt';

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-foreground">Postavke</h2>

      {/* Tab bar — scrollable on small screens */}
      <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setParams({ tab: t.key }, { replace: true })}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {active === 'obrt' && <ProfileSection />}
      {active === 'prostori' && <PremisesSection />}
      {active === 'usluge' && <ServicesSection />}
      {active === 'objekti' && <ObjectsSection />}
      {active === 'evisitor' && <CredentialsSection />}
    </div>
  );
}
