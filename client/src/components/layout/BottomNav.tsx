import { NavLink, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { primaryNav } from './nav';
import { cn } from '@/lib/utils';

// Mobile bottom navigation with a center FAB for "Novi račun" — the primary
// action, kept in thumb reach.
export function BottomNav() {
  const navigate = useNavigate();
  const left = primaryNav.slice(0, 2);
  const right = primaryNav.slice(2);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden safe-b">
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-2">
        {left.map((item) => (
          <NavTab key={item.to} item={item} />
        ))}

        <div className="flex justify-center">
          <button
            onClick={() => navigate('/racuni/novi')}
            aria-label="Novi račun"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
          >
            <Plus className="h-7 w-7" />
          </button>
        </div>

        {right.map((item) => (
          <NavTab key={item.to} item={item} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({ item }: { item: (typeof primaryNav)[number] }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
          isActive ? 'text-primary' : 'text-muted-2 hover:text-foreground',
        )
      }
    >
      <Icon className="h-[22px] w-[22px]" strokeWidth={2} />
      {item.label}
    </NavLink>
  );
}
