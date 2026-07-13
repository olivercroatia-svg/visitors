import {
  LayoutDashboard,
  ReceiptText,
  ShieldCheck,
  BarChart3,
  BedDouble,
  Users,
  Settings,
  BookText,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// Primary destinations shown in the mobile bottom bar (max 4 + center FAB).
// Boravci sits here rather than Obveze: in season a guest is checked in daily, from a
// phone, while Obveze is an occasional sit-down screen. Obveze stays in fullNav / "Više".
export const primaryNav: NavItem[] = [
  { to: '/', label: 'Početna', icon: LayoutDashboard },
  { to: '/racuni', label: 'Računi', icon: ReceiptText },
  { to: '/boravci', label: 'Boravci', icon: BedDouble },
  { to: '/vise', label: 'Više', icon: Settings },
];

// Full navigation used in the desktop sidebar and the mobile "Više" screen.
export const fullNav: NavItem[] = [
  { to: '/', label: 'Početna', icon: LayoutDashboard },
  { to: '/racuni', label: 'Računi', icon: ReceiptText },
  { to: '/boravci', label: 'Boravci', icon: BedDouble },
  { to: '/gosti', label: 'Gosti', icon: Users },
  { to: '/obveze', label: 'Porezne obveze', icon: ShieldCheck },
  { to: '/kpr', label: 'Knjiga prometa', icon: BookText },
  { to: '/analitika', label: 'Analitika', icon: BarChart3 },
  { to: '/postavke', label: 'Postavke', icon: Settings },
];
