import { ReactNode, useEffect, useRef, useState, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  FileText,
  ShoppingCart,
  Users,
  CreditCard,
  ShieldCheck,
  Bot,
  Menu,
  X,
  Settings,
  ChevronDown,
  LogOut,
  Bell,
  Search,
  Crown,
  Receipt,
  ArrowRight,
  LayoutDashboard,
  UserCheck,
  UserX,
  Users2,
  Clock,
  Wallet,
  BadgeDollarSign,
  Award,
  FileBarChart,
  Cog,
  ScrollText,
  Send,
  Inbox,
  MailCheck,
  Handshake,
  Plus,
  Network,
  Coins,
  Scale,
  MapPin,
  Wrench,
  Boxes,
  Truck,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  readUserSession,
  checkPerm,
  canManagePerm,
  permissionForMainPath,
  permissionForMainSubPath,
  permissionForHRPath,
} from "@/lib/authSession";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import ReadOnlyBoundary from "@/components/permissions/ReadOnlyBoundary";
import { useI18n } from "@/i18n";
import { COMPANY_PROFILE } from "@/lib/companyProfile";
import QuickActionsBar from "@/components/QuickActionsBar";

interface LayoutProps {
  children: ReactNode;
  subMenu?: { title: string; items: { label: string; href?: string }[] } | null;
}

/* ── Main navigation sub-menus (excluding HR) ── */
const navSubMenus: Record<
  string,
  { label: string; href: string; isHeader?: boolean }[]
> = {
  "/sales": [
    { label: "عروض الأسعار", href: "/sales/quotations" },
    { label: "أوامر البيع", href: "/sales/orders" },
    { label: "فواتير المبيعات", href: "/sales/invoices" },
    { label: "إشعار دائن", href: "/sales/credit-note" },
    { label: "إشعار تسليم", href: "/inventory/delivery-notes" },
  ],
  "/purchases": [
    { label: "فواتير المشتريات", href: "/purchases/invoices" },
    { label: "طلبات إشعار دائن", href: "/purchases/debit-notes" },
    { label: "إشعارات دائنة", href: "/purchases/credit-notes" },
    { label: "البيانات الجمركية", href: "/purchases/customs-declarations" },
    { label: "أوامر الشراء", href: "/purchases/orders" },
    { label: "تقارير المشتريات الشاملة", href: "/purchases/reports" },
  ],
  "/inventory": [
    { label: "المنتجات والخدمات", href: "/inventory/products" },
    { label: "سندات استلام المخزون", href: "/inventory/receipts" },
    { label: "سندات الصرف وإشعارات التسليم", href: "/inventory/issues" },
    { label: "التحويل بين المستودعات", href: "/inventory/transfers" },
    { label: "عمليات جرد المخزون", href: "/inventory/counts" },
    { label: "تسويات المخزون", href: "/inventory/adjustments" },
    { label: "أوامر التصنيع", href: "/inventory/manufacturing" },
    { label: "أوامر التركيب", href: "/inventory/assembly" },
    { label: "الأرصدة الافتتاحية", href: "/inventory/opening-balances" },
    { label: "المستودعات", href: "/inventory/warehouses" },
    { label: "تقارير المخزون", href: "/inventory/reports" },
  ],
  "/fleet": [
    { label: "لوحة الأسطول والتقارير", href: "/fleet" },
    { label: "السيارات والمركبات", href: "/fleet/vehicles" },
    { label: "السائقون", href: "/fleet/drivers" },
    { label: "صيانة المركبات", href: "/fleet/maintenance" },
    { label: "التأمين والفحص", href: "/fleet/insurance" },
    { label: "سجل الحركة والرحلات", href: "/fleet/trips" },
    { label: "الوقود", href: "/fleet/fuel" },
  ],
  "/crm": [
    { label: "العملاء", href: "/crm/customers" },
    { label: "الموردين", href: "/crm/vendors" },
    { label: "التقارير", href: "/crm/reports" },
  ],
  "/expenses": [
    { label: "الحسابات البنكية", href: "/expenses/bank-accounts" },
    { label: "القيود اليدوية", href: "/expenses/manual-journals" },
    { label: "إعادة التصنيف الجماعي", href: "/expenses/reclassification" },
    { label: "شجرة الحسابات", href: "/expenses" },
    { label: "الأصول الثابتة", href: "/expenses/fixed-assets" },
    { label: "التقارير", href: "/expenses/reports" },
    { label: "مساحة عمل المحاسب", href: "/expenses/accountant" },
    { label: "حساب الضرائب", href: "/expenses/tax" },
    { label: "تقارير ضريبية", href: "/expenses/tax-reports" },
    { label: "إعدادات المحاسبة", href: "/expenses/settings" },
  ],
  "/ai": [{ label: "المساعد الذكي", href: "/ai/assistant" }],
};

/* ── HR nav item types ── */
type HRNavItem = {
  icon: typeof LayoutDashboard;
  label: string;
  href: string;
  isHeader?: boolean;
  hasChildren?: boolean;
  children?: { icon: typeof LayoutDashboard; label: string; href: string }[];
};

/* ── HR-specific navigation items ── */
const hrNavItems: HRNavItem[] = [
  { icon: LayoutDashboard, label: "لوحة التحكم", href: "/hr/dashboard" },
  {
    icon: Users2,
    label: "الموظفون",
    href: "/hr/employees",
    hasChildren: true,
    children: [
      { icon: Users2, label: "الموظفون", href: "/hr/employees" },
      { icon: UserCheck, label: "الموظفون الأساسيون", href: "/hr/employees/basic" },
      {
        icon: Handshake,
        label: "الموظفون المتعاونون",
        href: "/hr/employees/cooperative",
      },
      {
        icon: UserX,
        label: "الموظفون غير الفعالين",
        href: "/hr/employees/inactive",
      },
      { icon: ScrollText, label: "سجلات المستخدمين", href: "/hr/user-logs" },
    ],
  },
  {
    icon: Send,
    label: "الطلبات",
    href: "/hr/requests",
    hasChildren: true,
    children: [
      { icon: Send, label: "إرسال الطلبات", href: "/hr/requests/send" },
      { icon: Inbox, label: "الطلبات الواردة", href: "/hr/requests/incoming" },
      { icon: MailCheck, label: "الطلبات المرسلة", href: "/hr/requests/sent" },
      {
        icon: Settings,
        label: "إعداد حقول الطلبات",
        href: "/hr/requests/form-settings",
      },
    ],
  },
  {
    icon: Clock,
    label: "حساب الدوام",
    href: "/hr/attendance",
    hasChildren: true,
    children: [
      { icon: Clock, label: "حساب الدوام", href: "/hr/attendance/calculate" },
      { icon: CheckCircle2, label: "الساعات الإضافية", href: "/hr/attendance/overtime" },
      {
        icon: FileBarChart,
        label: "الحضور والغياب للموظفين",
        href: "/hr/attendance/monthly",
      },
      {
        icon: FileText,
        label: "تقرير الحضور والانصراف",
        href: "/hr/attendance/report",
      },
      {
        icon: Users,
        label: "التحضير الفردي والجماعي",
        href: "/hr/attendance/individual-group",
      },
      {
        icon: Settings,
        label: "إعداد فترات الدوام",
        href: "/hr/attendance/schedules",
      },
    ],
  },
  {
    icon: Wallet,
    label: "حساب الراتب",
    href: "/hr/payroll",
    hasChildren: true,
    children: [
      { icon: Wallet, label: "كشف الرواتب", href: "/hr/payroll/statement" },
      { icon: ScrollText, label: "ارشيف الرواتب", href: "/hr/payroll/archive" },
      {
        icon: FileText,
        label: "البيانات المالية للموظفين",
        href: "/hr/payroll/financial-data",
      },
      { icon: BadgeDollarSign, label: "سلف الموظفين", href: "/hr/payroll/advances" },
      {
        icon: Receipt,
        label: "ترحيل حساب الراتب إلى النظام المحاسبي",
        href: "/hr/payroll/transfer",
      },
      {
        icon: Settings,
        label: "إعدادات حساب الراتب",
        href: "/hr/payroll/settings",
      },
    ],
  },
  { icon: FileBarChart, label: "تقارير الموارد البشرية", href: "/hr/reports" },
  {
    icon: ShieldCheck,
    label: "المساءلات والإنذارات",
    href: "/hr/penalties",
    hasChildren: true,
    children: [
      {
        icon: ShieldCheck,
        label: "المساءلات",
        href: "/hr/penalties/investigations",
      },
      {
        icon: ScrollText,
        label: "أرشيف الجزاءات",
        href: "/hr/penalties/archive",
      },
      { icon: FileText, label: "الإنذارات", href: "/hr/penalties/warnings" },
      { icon: Settings, label: "أنواع المخالفات", href: "/hr/penalties/types" },
      { icon: Users, label: "مجموعات المخالفات", href: "/hr/penalties/groups" },
      {
        icon: Receipt,
        label: "القرارات النهائية",
        href: "/hr/penalties/decisions",
      },
      { icon: Cog, label: "إعدادات", href: "/hr/penalties/settings" },
    ],
  },
  {
    icon: Clock,
    label: "الإجازات",
    href: "/hr/leaves",
    hasChildren: true,
    children: [
      { icon: Users, label: "إجازات الموظفين", href: "/hr/leaves/employees" },
      { icon: FileText, label: "تصنيف الإجازات", href: "/hr/leaves/types" },
      {
        icon: ShieldCheck,
        label: "ارصدة الإجازة السنوية",
        href: "/hr/leaves/annual-balance",
      },
      {
        icon: ScrollText,
        label: "أرصدة الاجازات الأخرى",
        href: "/hr/leaves/other-balance",
      },
      { icon: FileBarChart, label: "مخطط الإجازات", href: "/hr/leaves/chart" },
      {
        icon: Clock,
        label: "العُطل والاجازات الرسمية",
        href: "/hr/leaves/holidays",
      },
    ],
  },
  {
    icon: UserX,
    label: "إنهاء الخدمة",
    href: "/hr/termination",
    hasChildren: true,
    children: [
      {
        icon: Receipt,
        label: "تقرير المستحقات",
        href: "/hr/termination/dues-report",
      },
      {
        icon: UserX,
        label: "إنهاء خدمة الموظفين",
        href: "/hr/termination/employees",
      },
      {
        icon: FileText,
        label: "مخالصة الذمة للموظفين",
        href: "/hr/termination/clearance",
      },
      {
        icon: ScrollText,
        label: "إخلاء الطرف",
        href: "/hr/termination/evacuation",
      },
      {
        icon: FileBarChart,
        label: "أسباب إنهاء الخدمة",
        href: "/hr/termination/reasons",
      },
      { icon: Settings, label: "إعدادات", href: "/hr/termination/settings" },
      {
        icon: Users2,
        label: "إعداد نموذج مقابلة إنهاء الخدمة",
        href: "/hr/termination/interview-setup",
      },
    ],
  },
  {
    icon: ShieldCheck,
    label: "التأمينات",
    href: "/hr/insurance",
    hasChildren: true,
    children: [
      {
        icon: ShieldCheck,
        label: "التأمينات الاجتماعية",
        href: "/hr/insurance/social",
      },
      {
        icon: FileText,
        label: "قائمة التأمينات الاجتماعية",
        href: "/hr/insurance/list",
      },
      { icon: Receipt, label: "التأمين الطبي", href: "/hr/insurance/medical" },
    ],
  },
  {
    icon: Handshake,
    label: "الموافقات",
    href: "/hr/approvals",
    hasChildren: true,
    children: [
      {
        icon: FileText,
        label: "قائمة سلسلة الموافقات",
        href: "/hr/approvals/list",
      },
      { icon: Plus, label: "إضافة سلسلة موافقات", href: "/hr/approvals/add" },
      {
        icon: ShieldCheck,
        label: "سياسات الموافقات والتوقيع الالكتروني",
        href: "/hr/approvals/policies",
      },
    ],
  },
  {
    icon: Coins,
    label: "تهيئة المعلومات المالية",
    href: "/hr/financial-setup",
    hasChildren: true,
    children: [
      {
        icon: Coins,
        label: "أنواع البدلات",
        href: "/hr/financial-setup/allowances",
      },
      {
        icon: Clock,
        label: "أنواع الساعات الإضافية",
        href: "/hr/financial-setup/overtime",
      },
      {
        icon: Receipt,
        label: "أنواع الاقتطاعات المالية",
        href: "/hr/financial-setup/deductions",
      },
      {
        icon: Award,
        label: "أنواع الامتيازات المالية",
        href: "/hr/financial-setup/privileges",
      },
      {
        icon: BadgeDollarSign,
        label: "أنواع السلف",
        href: "/hr/financial-setup/loans",
      },
      {
        icon: Users,
        label: "فئات الموظفين",
        href: "/hr/financial-setup/employee-categories",
      },
      {
        icon: Settings,
        label: "إعدادات الحسابات للنظام المحاسبي",
        href: "/hr/financial-setup/account-settings",
      },
    ],
  },
  {
    icon: Scale,
    label: "التعاقب الوظيفي",
    href: "/hr/succession",
    hasChildren: true,
    children: [
      { icon: Users, label: "المناصب", href: "/hr/succession/positions" },
      {
        icon: Users2,
        label: "الموظفين المرشحين",
        href: "/hr/succession/candidates",
      },
      {
        icon: FileText,
        label: "الخطط التطويرية للتعاقب الوظيفي",
        href: "/hr/succession/development-plans",
      },
      {
        icon: FileBarChart,
        label: "تقرير متابعة الخطط التطويرية للتعاقب",
        href: "/hr/succession/tracking-report",
      },
    ],
  },
  { icon: Award, label: "شهادات الخبرة", href: "/hr/certificates" },
  { icon: Cog, label: "إعدادات الموارد البشرية", href: "/hr/settings" },
  {
    icon: Network,
    label: "إعدادات الهيكل التنظيمي للشركة",
    href: "/hr/organization",
    hasChildren: true,
    children: [
      {
        icon: Network,
        label: "شجرة الهيكل التنظيمي",
        href: "/hr/organization/tree",
      },
      { icon: Users2, label: "الفروع", href: "/hr/organization/branches" },
      {
        icon: LayoutDashboard,
        label: "الإدارات",
        href: "/hr/organization/departments",
      },
      {
        icon: LayoutDashboard,
        label: "الأقسام",
        href: "/hr/organization/sections",
      },
      {
        icon: LayoutDashboard,
        label: "الوحدات",
        href: "/hr/organization/units",
      },
      {
        icon: LayoutDashboard,
        label: "الشعب",
        href: "/hr/organization/subunits",
      },
      {
        icon: LayoutDashboard,
        label: "الوظائف",
        href: "/hr/organization/jobs",
      },
      {
        icon: MapPin,
        label: "مواقع العمل",
        href: "/hr/organization/work-locations",
      },
      {
        icon: Clock,
        label: "جداول العمل",
        href: "/hr/organization/work-schedules",
      },
    ],
  },
  {
    icon: ShieldCheck,
    label: "صلاحيات الموظفين",
    href: "/hr/permissions",
    hasChildren: true,
    children: [
      {
        icon: ShieldCheck,
        label: "قائمة أدوار المستخدمين",
        href: "/hr/permissions/roles",
      },
      { icon: Plus, label: "إضافة دور جديد", href: "/hr/permissions/add-role" },
    ],
  },
  {
    icon: Wrench,
    label: "الخصومات والإيميلات",
    href: "/hr/deductions-emails",
    hasChildren: false,
  },
];

function getActiveHRParent(pathname: string) {
  return (
    hrNavItems.find(
      (item) =>
        item.hasChildren &&
        item.children?.some((child) => child.href === pathname),
    )?.href ?? null
  );
}

/* ── Per-item accent colors for active state ── */
const itemColors: Record<
  string,
  {
    icon: string;
    active: string;
    glow: string;
    dot: string;
    text: string;
    subBg: string;
    border: string;
  }
> = {
  "/": {
    icon: "from-sky-400 to-blue-600",
    active: "bg-sky-500/15 border-sky-500/25",
    glow: "shadow-sky-500/20",
    dot: "bg-sky-400",
    text: "text-sky-300",
    subBg: "bg-sky-500/[0.06]",
    border: "border-sky-400/20",
  },
  "/sales": {
    icon: "from-blue-400 to-indigo-600",
    active: "bg-blue-500/15 border-blue-500/25",
    glow: "shadow-blue-500/20",
    dot: "bg-blue-400",
    text: "text-blue-300",
    subBg: "bg-blue-500/[0.06]",
    border: "border-blue-400/20",
  },
  "/purchases": {
    icon: "from-violet-400 to-purple-600",
    active: "bg-violet-500/15 border-violet-500/25",
    glow: "shadow-violet-500/20",
    dot: "bg-violet-400",
    text: "text-violet-300",
    subBg: "bg-violet-500/[0.06]",
    border: "border-violet-400/20",
  },
  "/hr": {
    icon: "from-emerald-400 to-teal-600",
    active: "bg-emerald-500/15 border-emerald-500/25",
    glow: "shadow-emerald-500/20",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    subBg: "bg-emerald-500/[0.06]",
    border: "border-emerald-400/20",
  },
  "/crm": {
    icon: "from-amber-400 to-orange-600",
    active: "bg-amber-500/15 border-amber-500/25",
    glow: "shadow-amber-500/20",
    dot: "bg-amber-400",
    text: "text-amber-300",
    subBg: "bg-amber-500/[0.06]",
    border: "border-amber-400/20",
  },
  "/expenses": {
    icon: "from-green-400 to-emerald-600",
    active: "bg-green-500/15 border-green-500/25",
    glow: "shadow-green-500/20",
    dot: "bg-green-400",
    text: "text-green-300",
    subBg: "bg-green-500/[0.06]",
    border: "border-green-400/20",
  },
  "/users": {
    icon: "from-cyan-400 to-teal-600",
    active: "bg-cyan-500/15 border-cyan-500/25",
    glow: "shadow-cyan-500/20",
    dot: "bg-cyan-400",
    text: "text-cyan-300",
    subBg: "bg-cyan-500/[0.06]",
    border: "border-cyan-400/20",
  },
  "/ai": {
    icon: "from-fuchsia-400 to-purple-600",
    active: "bg-fuchsia-500/15 border-fuchsia-500/25",
    glow: "shadow-fuchsia-500/20",
    dot: "bg-fuchsia-400",
    text: "text-fuchsia-300",
    subBg: "bg-fuchsia-500/[0.06]",
    border: "border-fuchsia-400/20",
  },
  "/settings": {
    icon: "from-slate-400 to-gray-600",
    active: "bg-slate-500/15 border-slate-500/25",
    glow: "shadow-slate-500/20",
    dot: "bg-slate-400",
    text: "text-slate-300",
    subBg: "bg-slate-500/[0.06]",
    border: "border-slate-400/20",
  },
};

// Store sidebar scroll positions globally so they survive re-renders
const sidebarScrollPositions: Record<string, number> = {
  hr: 0,
  main: 0,
};

/* ═══════════════════════════════════════════════════════
   HR Sidebar Component
   ═══════════════════════════════════════════════════════ */
function HRSidebar({
  sidebarOpen,
  setSidebarOpen,
  expandedMenus,
  setExpandedMenus,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  expandedMenus: Set<string>;
  setExpandedMenus: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);
  const userSession = readUserSession();
  const { permissions: livePerms } = useRolePermissions();
  const { t } = useI18n();
  const allowedHRItems = useMemo(() => {
    return hrNavItems
      .filter((item) => {
        if (item.isHeader) return true;
        if (item.hasChildren && item.children) {
          return item.children.some((c) =>
            checkPerm(livePerms, ...permissionForHRPath(c.href)),
          );
        }
        return checkPerm(livePerms, ...permissionForHRPath(item.href));
      })
      .map((item) =>
        item.hasChildren && item.children
          ? {
              ...item,
              children: item.children.filter((c) =>
                checkPerm(livePerms, ...permissionForHRPath(c.href)),
              ),
            }
          : item,
      );
  }, [livePerms]);

  // Restore scroll position on mount
  useEffect(() => {
    if (navRef.current) {
      navRef.current.scrollTop = sidebarScrollPositions.hr;
    }
  }, []);

  // Save scroll position when navigating or scrolling
  const handleScroll = () => {
    if (navRef.current) {
      sidebarScrollPositions.hr = navRef.current.scrollTop;
    }
  };

  const navigateKeepingScroll = (href: string) => {
    if (navRef.current) {
      sidebarScrollPositions.hr = navRef.current.scrollTop;
    }
    navigate(href);
  };

  const lastAutoExpandedPath = useRef<string | null>(null);

  // Auto-expand the active parent WITHOUT closing any other open menus
  useEffect(() => {
    let activeParentHref: string | null = null;
    for (const item of hrNavItems) {
      if (item.hasChildren && item.children) {
        if (item.children.some((c) => location.pathname === c.href)) {
          activeParentHref = item.href;
          break;
        }
      }
    }
    if (
      activeParentHref &&
      lastAutoExpandedPath.current !== location.pathname
    ) {
      lastAutoExpandedPath.current = location.pathname;
      setExpandedMenus((prev) => {
        if (prev.has(activeParentHref!)) return prev;
        const next = new Set(prev);
        next.add(activeParentHref!);
        return next;
      });
    }
  }, [location.pathname, setExpandedMenus]);

  return (
    <aside
      className={cn(
        "relative flex flex-col flex-shrink-0 h-full transition-all duration-300 overflow-hidden",
        sidebarOpen ? "w-[270px]" : "w-[72px]",
      )}
      style={{
        background:
          "linear-gradient(180deg, #052e16 0%, #14332a 40%, #0c2a1e 100%)",
      }}
    >
      {/* Decorative ambient lights */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full bg-emerald-500/[0.10] blur-[80px]" />
      <div className="pointer-events-none absolute top-1/3 -right-20 h-40 w-40 rounded-full bg-teal-500/[0.08] blur-[60px]" />
      <div className="pointer-events-none absolute bottom-20 -left-16 h-36 w-36 rounded-full bg-green-500/[0.06] blur-[60px]" />

      {/* ── Logo / Title area ── */}
      <div className="relative z-10 px-4 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-green-600 text-white font-extrabold text-sm shadow-xl shadow-emerald-500/30">
              <Users className="h-5 w-5" />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/20 to-transparent opacity-60" />
            </div>
            {sidebarOpen && (
              <div className="flex flex-col">
                <span className="text-[14px] font-extrabold text-white tracking-tight leading-tight">
                  {t("الموارد البشرية")}
                </span>
                <span className="text-[10px] font-medium text-emerald-300/60 tracking-wide">
                  {t("نظام الموارد البشرية")}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-xl p-2 text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all duration-200"
          >
            {sidebarOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="relative z-10 mx-4 h-px bg-gradient-to-l from-transparent via-emerald-400/[0.15] to-transparent" />

      {/* ── Back to main menu button ── */}
      <div className="relative z-10 px-3 pt-3 pb-1">
        <button
          onClick={() => navigate("/")}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
            "text-emerald-300/70 hover:text-white hover:bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-400/30",
          )}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 flex-shrink-0">
            <ArrowRight className="h-4 w-4" />
          </div>
          {sidebarOpen && <span>{t("العودة للقائمة الرئيسية")}</span>}
        </button>
      </div>

      {/* Divider */}
      <div className="relative z-10 mx-4 mt-2 h-px bg-gradient-to-l from-transparent via-emerald-400/[0.10] to-transparent" />

      {/* ── HR Navigation ── */}
      <nav
        ref={navRef}
        onScroll={handleScroll}
        className="main-sidebar-nav relative z-10 flex flex-col gap-0.5 px-3 py-3 flex-1 overflow-y-auto"
      >
        {sidebarOpen && (
          <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-300/25">
            {t("أقسام الموارد البشرية")}
          </p>
        )}
        {allowedHRItems.map((item, index) => {
          if (item.isHeader) {
            if (!sidebarOpen) return null;
            return (
              <div key={`header-${index}`} className="px-3 pt-4 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/30">
                  {t(item.label)}
                </span>
              </div>
            );
          }

          const Icon = item.icon;
          const isToolsIcon = item.href === "/hr/deductions-emails";
          const isExpanded = expandedMenus.has(item.href);
          const hasChildActive =
            item.hasChildren &&
            item.children?.some((c) => location.pathname === c.href);
          const isItemActive = item.hasChildren
            ? hasChildActive
            : location.pathname === item.href;

          return (
            <div key={item.href}>
              <div
                className={cn(
                  "group w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 border border-transparent",
                  isItemActive
                    ? "text-white bg-emerald-500/15 border-emerald-500/25"
                    : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]",
                )}
              >
                {/* Icon + Label: clicking expands or navigates */}
                <button
                  onClick={() => {
                    if (item.hasChildren) {
                      setExpandedMenus((prev) => {
                        if (prev.has(item.href)) return prev;
                        const next = new Set(prev);
                        next.add(item.href);
                        return next;
                      });
                    } else {
                      navigateKeepingScroll(item.href);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-3 min-w-0",
                    isToolsIcon ? "flex-none" : "flex-1",
                  )}
                  title={t(item.label)}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300 flex-shrink-0",
                      isItemActive
                        ? "bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-500/20"
                        : "bg-white/[0.04] text-white/40 group-hover:bg-white/[0.08] group-hover:text-white/70",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  {sidebarOpen && !isToolsIcon && (
                    <span
                      className={cn(
                        "flex-1 text-start truncate",
                        isItemActive && "font-semibold",
                      )}
                    >
                      {t(item.label)}
                    </span>
                  )}
                </button>

                {/* Chevron: ONLY this toggles open/close */}
                {sidebarOpen && item.hasChildren ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedMenus((prev) => {
                        const next = new Set(prev);
                        isExpanded
                          ? next.delete(item.href)
                          : next.add(item.href);
                        return next;
                      });
                    }}
                    className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-300 text-white/25",
                        isExpanded && "rotate-180 text-white/50",
                      )}
                    />
                  </button>
                ) : sidebarOpen && isItemActive && !isToolsIcon ? (
                  <span className="h-1 w-5 rounded-full bg-gradient-to-l from-emerald-400 to-teal-500 opacity-60 flex-shrink-0" />
                ) : null}
              </div>

              {/* Children sub-menu */}
              {item.hasChildren &&
                isExpanded &&
                sidebarOpen &&
                item.children && (
                  <div className="mt-1.5 me-4 ms-2 rounded-xl p-1.5 space-y-0.5 animate-fade-in border bg-emerald-500/[0.06] border-emerald-400/15">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      const isChildActive = location.pathname === child.href;
                      return (
                        <button
                          key={child.href}
                          onClick={() => navigateKeepingScroll(child.href)}
                          className={cn(
                            "w-full text-start flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium rounded-lg transition-all duration-200",
                            isChildActive
                              ? "text-white bg-emerald-500/15 border border-emerald-500/25"
                              : "text-emerald-300 opacity-60 hover:opacity-100 hover:bg-white/[0.05] border border-transparent",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full flex-shrink-0 transition-all duration-200",
                              isChildActive
                                ? "h-2 w-2 bg-emerald-400 shadow-sm shadow-emerald-500/20"
                                : "bg-emerald-400 opacity-40",
                            )}
                          />
                          <span>{t(child.label)}</span>
                          {isChildActive && (
                            <span className="ms-auto h-1 w-5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 opacity-60" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="relative z-10 mx-4 h-px bg-gradient-to-l from-transparent via-emerald-400/[0.08] to-transparent" />

      {/* ── Bottom user area ── */}
      <div className="relative z-10 p-3">
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-300",
            "bg-gradient-to-l from-emerald-500/[0.06] to-emerald-500/[0.02] border border-emerald-500/[0.10]",
            !sidebarOpen && "justify-center px-0",
          )}
        >
          <div className="relative flex-shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-[12px] font-bold text-white shadow-md shadow-emerald-500/20">
              {t("م")}
            </div>
            <span className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-[#0c2a1e] bg-emerald-400" />
          </div>
          {sidebarOpen && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-white/90 truncate">
                  {userSession?.name || t("مدير النظام")}
                </p>
                <p className="text-[10px] text-emerald-300/30 truncate">
                  {userSession?.role ? t(userSession.role) : ""}
                </p>
              </div>
              <button
                onClick={async () => {
                  localStorage.removeItem("user_session");
                  const { supabase: sb } = await import("@/lib/supabaseClient");
                  await sb.auth.signOut();
                  navigate("/login");
                }}
                className="rounded-lg p-1.5 text-white/20 hover:text-red-400 hover:bg-white/[0.06] transition-all"
                title={t("تسجيل الخروج")}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Sidebar Component
   ═══════════════════════════════════════════════════════ */
function MainSidebar({
  sidebarOpen,
  setSidebarOpen,
  expandedMenu,
  setExpandedMenu,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  expandedMenu: string | null;
  setExpandedMenu: (v: string | null) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);
  const userSession = readUserSession();
  const { permissions: livePerms } = useRolePermissions();
  const { t } = useI18n();

  // Restore scroll position on mount
  useEffect(() => {
    if (navRef.current) {
      navRef.current.scrollTop = sidebarScrollPositions.main;
    }
  }, []);

  // Save scroll position when navigating or scrolling
  const handleScroll = () => {
    if (navRef.current) {
      sidebarScrollPositions.main = navRef.current.scrollTop;
    }
  };

  const activeSubmenuParent = Object.entries(navSubMenus).find(([, subItems]) =>
    subItems.some((subItem) => subItem.href === location.pathname),
  )?.[0];

  const isActive = (path: string) =>
    activeSubmenuParent
      ? path === activeSubmenuParent
      : location.pathname === path ||
        (path !== "/" && location.pathname.startsWith(path));

  const allNavItems = [
    { icon: BarChart3, label: "لوحة التحكم", href: "/" },
    { icon: FileText, label: "المبيعات", href: "/sales", hasSubmenu: true },
    {
      icon: ShoppingCart,
      label: "المشتريات",
      href: "/purchases",
      hasSubmenu: true,
    },
    { icon: Users, label: "الموارد البشرية", href: "/hr" },
    {
      icon: CreditCard,
      label: "العملاء والموردين",
      href: "/crm",
      hasSubmenu: true,
    },
    {
      icon: Receipt,
      label: "المحاسبة والمالية",
      href: "/expenses",
      hasSubmenu: true,
    },
    { icon: Boxes, label: "المخزون", href: "/inventory", hasSubmenu: true },
    { icon: Truck, label: "الأسطول والسيارات", href: "/fleet", hasSubmenu: true },
    { icon: Bot, label: "الذكاء الاصطناعي", href: "/ai", hasSubmenu: true },
    { icon: Settings, label: "الإعدادات", href: "/settings" },
  ];
  const navItems = useMemo(() => {
    return allNavItems.filter((item) => {
      const key = permissionForMainPath(item.href);
      return key === null || checkPerm(livePerms, key);
    });
  }, [livePerms]);

  const lastAutoExpandedPath = useRef<string | null>(null);

  useEffect(() => {
    let activeParentHref: string | null = activeSubmenuParent ?? null;

    if (!activeParentHref) {
      navItems.forEach((item) => {
        if (
          location.pathname.startsWith(item.href) &&
          item.href !== "/" &&
          item.hasSubmenu
        ) {
          activeParentHref = item.href;
        }
      });
    }

    if (
      activeParentHref &&
      lastAutoExpandedPath.current !== location.pathname
    ) {
      lastAutoExpandedPath.current = location.pathname;
      setExpandedMenu(activeParentHref);
    }
  }, [location.pathname, activeSubmenuParent, setExpandedMenu]);

  return (
    <aside
      className={cn(
        "relative flex flex-col flex-shrink-0 h-full transition-all duration-300 overflow-hidden",
        sidebarOpen ? "w-[270px]" : "w-[72px]",
      )}
      style={{
        background:
          "linear-gradient(180deg, #0f172a 0%, #1a1f3a 40%, #15203a 100%)",
      }}
    >
      {/* Decorative ambient lights */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full bg-blue-500/[0.08] blur-[80px]" />
      <div className="pointer-events-none absolute top-1/3 -right-20 h-40 w-40 rounded-full bg-violet-500/[0.06] blur-[60px]" />
      <div className="pointer-events-none absolute bottom-20 -left-16 h-36 w-36 rounded-full bg-cyan-500/[0.05] blur-[60px]" />

      {/* ── Logo area ── */}
      <div
        className={cn("relative z-10 pt-5 pb-4", sidebarOpen ? "px-4" : "px-2")}
      >
        <div
          className={cn(
            "flex items-center",
            sidebarOpen ? "justify-between" : "flex-col gap-2",
          )}
        >
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 text-white font-extrabold text-sm shadow-xl shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-all duration-300 group-hover:scale-105">
              <Crown className="h-5 w-5" />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/20 to-transparent opacity-60" />
            </div>
            {sidebarOpen && (
              <div className="flex flex-col">
                <span className="text-[14px] font-extrabold text-white tracking-tight leading-tight">
                  {t(COMPANY_PROFILE.programNameAr)}
                </span>
                <span className="text-[10px] font-medium text-blue-300/60 tracking-wide">
                  {t(COMPANY_PROFILE.companyNameAr)}
                </span>
              </div>
            )}
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn(
              "rounded-xl p-2 transition-all duration-200",
              sidebarOpen
                ? "text-white/30 hover:text-white/70 hover:bg-white/[0.06]"
                : "bg-white/10 text-white hover:bg-white/20",
            )}
            title={sidebarOpen ? t("تصغير القائمة") : t("توسيع القائمة")}
          >
            {sidebarOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="relative z-10 mx-4 h-px bg-gradient-to-l from-transparent via-white/[0.08] to-transparent" />

      {/* ── Navigation ── */}
      <nav
        ref={navRef}
        onScroll={handleScroll}
        className="main-sidebar-nav relative z-10 flex flex-col gap-1 px-3 py-4 flex-1 overflow-y-auto"
      >
        {sidebarOpen && (
          <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">
            {t("القائمة الرئيسية")}
          </p>
        )}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isItemActive = isActive(item.href);
          const isExpanded = expandedMenu === item.href && item.hasSubmenu;
          const subItems = navSubMenus[item.href]?.filter(
            (subItem) =>
              subItem.isHeader ||
              checkPerm(livePerms, ...permissionForMainSubPath(subItem.href)),
          );
          const colors = itemColors[item.href] || itemColors["/"];

          // HR item navigates to /hr/dashboard directly
          const isHR = item.href === "/hr";

          const btnContent = (
            <>
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 flex-shrink-0",
                  isItemActive
                    ? cn(
                        "bg-gradient-to-br text-white shadow-lg",
                        colors.icon,
                        colors.glow,
                      )
                    : "bg-white/[0.04] text-white/40 group-hover:bg-white/[0.08] group-hover:text-white/70",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </div>
              {sidebarOpen && (
                <>
                  <span
                    className={cn(
                      "flex-1 text-start transition-colors duration-200",
                      isItemActive ? "text-white font-semibold" : "",
                    )}
                  >
                    {t(item.label)}
                  </span>
                  {item.hasSubmenu && (
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-300 text-white/25",
                        isExpanded && "rotate-180 text-white/50",
                      )}
                    />
                  )}
                </>
              )}
            </>
          );

          const baseClass = cn(
            "group w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 border border-transparent",
            isItemActive
              ? cn("text-white", colors.active)
              : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]",
          );

          return (
            <div key={item.href}>
              {isHR ? (
                // HR navigates to its own sidebar
                <button
                  onClick={() => navigate("/hr/dashboard")}
                  className={baseClass}
                  title={t(item.label)}
                >
                  {btnContent}
                </button>
              ) : item.hasSubmenu ? (
                <button
                  onClick={() =>
                    setExpandedMenu(
                      expandedMenu === item.href ? null : item.href,
                    )
                  }
                  className={baseClass}
                  title={t(item.label)}
                >
                  {btnContent}
                </button>
              ) : (
                <Link
                  to={item.href}
                  className={baseClass}
                  title={t(item.label)}
                >
                  {btnContent}
                </Link>
              )}

              {/* Submenu */}
              {isExpanded && sidebarOpen && subItems && (
                <div
                  className={cn(
                    "mt-1.5 me-4 ms-2 rounded-xl p-1.5 space-y-0.5 animate-fade-in border",
                    colors.subBg,
                    colors.border,
                  )}
                >
                  {subItems.map((subItem, index) => {
                    if (subItem.isHeader) {
                      return (
                        <div key={index} className="px-3 pt-3 pb-1">
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase tracking-widest opacity-40",
                              colors.text,
                            )}
                          >
                            {t(subItem.label)}
                          </span>
                        </div>
                      );
                    }
                    const isSubActive = location.pathname === subItem.href;
                    return (
                      <button
                        key={index}
                        onClick={() => navigate(subItem.href)}
                        className={cn(
                          "w-full text-start flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium rounded-lg transition-all duration-200",
                          isSubActive
                            ? cn("text-white", colors.active)
                            : cn(
                                "hover:bg-white/[0.05]",
                                colors.text,
                                "opacity-60 hover:opacity-100",
                              ),
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full flex-shrink-0 transition-all duration-200",
                            isSubActive
                              ? cn("h-2 w-2 shadow-sm", colors.dot, colors.glow)
                              : cn(colors.dot, "opacity-40"),
                          )}
                        />
                        <span>{t(subItem.label)}</span>
                        {isSubActive && (
                          <span
                            className={cn(
                              "ms-auto h-1 w-5 rounded-full bg-gradient-to-r opacity-60",
                              colors.icon,
                            )}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="relative z-10 mx-4 h-px bg-gradient-to-l from-transparent via-white/[0.06] to-transparent" />

      {/* ── Bottom user area ── */}
      <div className="relative z-10 p-3">
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-300",
            "bg-gradient-to-l from-white/[0.04] to-white/[0.02] border border-white/[0.06]",
            !sidebarOpen && "justify-center px-0",
          )}
        >
          <div className="relative flex-shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-[12px] font-bold text-white shadow-md shadow-blue-500/20">
              {t("م")}
            </div>
            <span className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-[#1a1f3a] bg-emerald-400" />
          </div>
          {sidebarOpen && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-white/90 truncate">
                  {userSession?.name || t("مدير النظام")}
                </p>
                <p className="text-[10px] text-white/30 truncate">
                  {userSession?.role ? t(userSession.role) : ""}
                </p>
              </div>
              <button
                onClick={async () => {
                  localStorage.removeItem("user_session");
                  const { supabase: sb } = await import("@/lib/supabaseClient");
                  await sb.auth.signOut();
                  navigate("/login");
                }}
                className="rounded-lg p-1.5 text-white/20 hover:text-red-400 hover:bg-white/[0.06] transition-all"
                title={t("تسجيل الخروج")}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════
   Layout Component
   ═══════════════════════════════════════════════════════ */
export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { permissions: livePerms } = useRolePermissions();
  const { t, direction, formatDate } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedHRMenus, setExpandedHRMenus] = useState<Set<string>>(() => {
    const parent = getActiveHRParent(location.pathname);
    return parent ? new Set([parent]) : new Set();
  });
  const [expandedMainMenu, setExpandedMainMenu] = useState<string | null>(null);

  const isHRSection = location.pathname.startsWith("/hr");

  useEffect(() => {
    setSidebarOpen(true);
  }, [location.pathname]);

  useEffect(() => {
    const cleanupMarker = "preproduction-test-cache-cleared-v1";
    if (localStorage.getItem(cleanupMarker)) return;

    const invoiceCachePrefixes = [
      "sales-invoice-items-",
      "sales-invoice-address-",
      "sales-invoice-notes-",
    ];
    for (const key of Object.keys(localStorage)) {
      if (invoiceCachePrefixes.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }
    localStorage.removeItem("sales-delivery-notes");
    localStorage.setItem(cleanupMarker, new Date().toISOString());
  }, []);

  const currentPermissionKeys = isHRSection
    ? permissionForHRPath(location.pathname)
    : permissionForMainSubPath(location.pathname);
  const readOnly =
    checkPerm(livePerms, ...currentPermissionKeys) &&
    !canManagePerm(livePerms, ...currentPermissionKeys);

  return (
    <div
      className="flex h-screen overflow-hidden bg-background"
      dir={direction}
    >
      {/* ── Sidebar — switches between main and HR ── */}
      {isHRSection ? (
        <HRSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          expandedMenus={expandedHRMenus}
          setExpandedMenus={setExpandedHRMenus}
        />
      ) : (
        <MainSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          expandedMenu={expandedMainMenu}
          setExpandedMenu={setExpandedMainMenu}
        />
      )}

      {/* ── Main Content ── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-40 h-[68px] flex items-center justify-between px-8 bg-white/80 backdrop-blur-xl border-b border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-4">
            <h1 className="text-[16px] font-extrabold text-foreground">
              {t(COMPANY_PROFILE.programNameAr)}
            </h1>
            <span className="hidden sm:inline-block h-5 w-px bg-border/60" />
            <span className="hidden sm:inline-block text-[11px] text-muted-foreground font-bold">
              {isHRSection
                ? t("نظام الموارد البشرية")
                : t(COMPANY_PROFILE.programNameAr)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2 text-[11px] text-muted-foreground hover:bg-muted/60 transition-colors">
              <Search className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t("بحث...")}</span>
            </button>
            <button className="relative rounded-xl p-2.5 text-muted-foreground hover:bg-muted/50 transition-colors">
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 animate-pulse-soft" />
            </button>
            <div className="hidden lg:flex items-center gap-2 rounded-xl bg-muted/30 px-3.5 py-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                {formatDate(new Date(), {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
        </header>

        <QuickActionsBar />

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4">
          <ReadOnlyBoundary readOnly={readOnly}>{children}</ReadOnlyBoundary>
        </div>
      </main>
    </div>
  );
}
