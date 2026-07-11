import {
  LayoutDashboard,
  ReceiptText,
  ShieldCheck,
  BarChart3,
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
export const primaryNav: NavItem[] = [
  { to: '/', label: 'Početna', icon: LayoutDashboard },
  { to: '/racuni', label: 'Računi', icon: ReceiptText },
  { to: '/obveze', label: 'Obveze', icon: ShieldCheck },
  { to: '/vise', label: 'Više', icon: Settings },
];

// Full navigation used in the desktop sidebar and the mobile "Više" screen.
export const fullNav: NavItem[] = [
  { to: '/', label: 'Početna', icon: LayoutDashboard },
  { to: '/racuni', label: 'Računi', icon: ReceiptText },
  { to: '/gosti', label: 'Gosti', icon: Users },
  { to: '/obveze', label: 'Porezne obveze', icon: ShieldCheck },
  { to: '/kpr', label: 'Knjiga prometa', icon: BookText },
  { to: '/analitika', label: 'Analitika', icon: BarChart3 },
  { to: '/postavke', label: 'Postavke', icon: Settings },
];
