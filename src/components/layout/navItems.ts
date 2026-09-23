import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Painel', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'planner', label: 'Agenda', icon: Calendar, href: '/planner' },
  { id: 'subjects', label: 'Disciplinas', icon: BookOpen, href: '/subjects' },
  { id: 'analytics', label: 'Análises', icon: BarChart3, href: '/analytics' },
  { id: 'settings', label: 'Ajustes', icon: Settings, href: '/settings' },
];
