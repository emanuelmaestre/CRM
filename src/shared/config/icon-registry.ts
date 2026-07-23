import {
  AlertTriangle,
  BarChart2,
  Bell,
  Brain,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  ExternalLink,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Plug,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const iconRegistry = {
  AlertTriangle,
  BarChart2,
  Bell,
  Brain,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  ExternalLink,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Plug,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
  Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof iconRegistry;

export function getIcon(name: string): LucideIcon {
  const icon = iconRegistry[name as IconName];
  if (!icon) throw new Error(`Ícone não registrado no JSON: ${name}`);
  return icon;
}
