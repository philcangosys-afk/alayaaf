import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "@/hooks/use-toast";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  FileText,
  Printer,
  Search,
  Users,
  WalletCards,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { fetchAllRows } from "@/lib/fetchAll";
import { monthRange, riyadhMonth, riyadhToday } from "@/lib/hrDates";
import { hrRequestErrorText } from "@/lib/hrErrors";
import { isEmployeeActive } from "@/lib/employeeStatus";
import { computePayroll, round2, type PayrollDay, type PayrollLine } from "@/lib/payrollCalc";
import { loadOrgEnglishNames } from "@/lib/orgNames";
import { localizePayrollNotes } from "@/lib/payrollNotesText";
import { PRINT_BRAND_CSS, printBrandHeaderHtml } from "@/lib/printBranding";

/**
 * تقرير الموظف الكامل: الحضور والراتب لشهر واحد بالقواعد نفسها التي يحسب بها كشف الرواتب
 * (جدول الدوام، العطل الرسمية، الإجازات المعتمدة، تاريخ التعيين، إعداد "الراتب المكتسب").
 * الأرقام من صف الرواتب المحفوظ إن وُجد مع حالته، وإلا تقديرية من الحساب الحالي وتُوسم بذلك.
 * لا يتضمن عبارات استلام أو إقرار: التقرير ليس مستند صرف.
 */
type Employee = {
  id: string;
  empId: string;
  name: string;
  jobTitle: string;
  department: string;
  administration: string;
  branch: string;
  active: boolean;
};

type Figures = {
  basic: number;
  allowances: number;
  gross: number;
  socialInsurance: number;
  expenseReduction: number;
  penalties: number;
  advances: number;
  other: number;
  deductions: number;
  net: number;
};

type DayCell = { day: number; date: string; kind: "present" | "late" | "absent" | "leave" | "unpaid" | "off" | "unrecorded" | "future" | "none"; label: string };

type EmployeeReport = {
  employee: Employee;
  days: DayCell[];
  counts: { present: number; late: number; absent: number; leave: number; unrecorded: number };
  figures: Figures | null;
  statusLabel: string;
  estimated: boolean;
  notes: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const ID_CHUNK = 100;
const chunk = <T,>(items: T[]) => Array.from({ length: Math.ceil(items.length / ID_CHUNK) }, (_, index) => items.slice(index * ID_CHUNK, (index + 1) * ID_CHUNK));

/** حالة صف الرواتب المحفوظ كما يفهمها القارئ */
const payrollStatusLabel = (status: string, accountingStatus: string) => {
  const value = status.trim();
  if (value === "مدفوع") return "مدفوع";
  if (value === "موقوف الصرف") return "مستحق (مرحّل) وموقوف الصرف";
  if (value === "مرحّل" || accountingStatus === "posted") return "مستحق (مرحّل محاسبيًا) ولم يُصرف بعد";
  if (value === "معتمد") return "معتمد ولم يُرحَّل بعد";
  if (value === "موقوف") return "موقوف بقرار الإدارة";
  if (value === "مرفوض") return "مرفوض (يُعاد حسابه)";
  return "معلق بانتظار اعتماد الإدارة";
};

const DAY_SYMBOLS: Record<DayCell["kind"], { symbol: string; color: string }> = {
  present: { symbol: "✓", color: "#16a34a" },
  late: { symbol: "✓", color: "#d97706" },
  absent: { symbol: "✕", color: "#ef4444" },
  leave: { symbol: "إ", color: "#0284c7" },
  unpaid: { symbol: "إ", color: "#be123c" },
  off: { symbol: "—", color: "#94a3b8" },
  unrecorded: { symbol: "؟", color: "#94a3b8" },
  future: { symbol: "○", color: "#cbd5e1" },
  none: { symbol: "·", color: "#cbd5e1" },
};
/** رموز الأيام ذات الحرف العربي في الواجهة الإنجليزية */
const DAY_SYMBOLS_EN: Partial<Record<DayCell["kind"], string>> = { leave: "L", unpaid: "L", unrecorded: "?" };

const dayCell = (day: PayrollDay, today: string): DayCell => {
  const number = Number(day.date.slice(8, 10));
  const base = { day: number, date: day.date };
  if (day.beforeHire) return { ...base, kind: "none", label: "قبل التعيين" };
  if (day.category === "present") return { ...base, kind: "present", label: day.status || "حاضر" };
  if (day.category === "late") return { ...base, kind: "late", label: day.status || "متأخر" };
  if (day.deductibleAbsence) return { ...base, kind: "absent", label: day.unrecorded ? "غائب (بلا تسجيل)" : "غائب" };
  if (day.leaveCut >= 1) return { ...base, kind: "unpaid", label: "إجازة بدون راتب" };
  if (day.category === "leave") return { ...base, kind: "leave", label: day.leaveCut > 0 ? "إجازة بأجر ناقص" : "إجازة" };
  if (day.category === "holiday") return { ...base, kind: "off", label: "عطلة رسمية" };
  if (day.category === "weekend") return { ...base, kind: "off", label: "راحة أسبوعية" };
  if (day.date > today) return { ...base, kind: "future", label: "قادم" };
  if (day.unrecorded) return { ...base, kind: "unrecorded", label: "بلا تسجيل (لم يُخصم)" };
  return { ...base, kind: "none", label: "—" };
};

const lineFigures = (line: PayrollLine): Figures => {
  const expenseReduction = round2(line.absenceDeduction + line.unpaidLeaveDeduction + line.allowanceDeductions);
  return {
    basic: line.basic,
    allowances: round2(line.allowances + line.overtime),
    gross: line.grossEarnings,
    socialInsurance: line.socialInsurance,
    expenseReduction,
    penalties: line.penalties,
    advances: line.loans,
    // الاقتطاعات الشهرية (HR-13) تُحفظ ضمن الاستقطاعات، فتظهر في «استقطاعات أخرى» كما في الصف المحفوظ
    other: line.fixedDeductions,
    deductions: line.totalDeductions,
    net: line.net,
  };
};

const rowFigures = (row: Record<string, unknown>): Figures => {
  const value = (key: string) => round2(Number(row[key]) || 0);
  const basic = value("basic_salary");
  const allowances = value("allowances");
  const deductions = value("deductions");
  const socialInsurance = value("social_insurance_deduction");
  const expenseReduction = value("expense_reduction");
  const penalties = value("penalty_deduction");
  const advances = value("advance_deduction");
  return {
    basic,
    allowances,
    gross: round2(basic + allowances),
    socialInsurance,
    expenseReduction,
    penalties,
    advances,
    other: round2(Math.max(0, deductions - socialInsurance - expenseReduction - penalties - advances)),
    deductions,
    net: value("net_salary"),
  };
};

const deductionLines = (figures: Figures) => [
  { label: "غياب وإجازات بدون راتب وبدلات مخصومة", value: figures.expenseReduction },
  { label: "حصة الموظف في التأمينات الاجتماعية", value: figures.socialInsurance },
  { label: "جزاءات", value: figures.penalties },
  { label: "قسط سلفة", value: figures.advances },
  { label: "استقطاعات أخرى", value: figures.other },
].filter((item) => item.value >= 0.01);

export default function HREmployeeFullReport() {
  const { t, direction, locale } = useI18n();
  // نفس منطق useI18n: ar-SA بالعربية و en-US بالإنجليزية (بدل ar-SA الثابت)
  const displayLocale = locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US";
  const money = (value: number) =>
    value.toLocaleString(displayLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatDate = (value: string) => {
    if (!value) return "-";
    // التاريخ بالإنجليزية بصيغة en-GB (يوم/شهر/سنة)
    return new Date(`${value}T00:00:00`).toLocaleDateString(locale === "ar" ? displayLocale : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<EmployeeReport[]>([]);
  const [reportWarnings, setReportWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("الكل");
  const [administration, setAdministration] = useState("الكل");
  const [showInactive, setShowInactive] = useState(false);
  const [month, setMonth] = useState(riyadhMonth());
  // شهر التقرير المعروض (قد يختلف عن الحقل إن غُيّر أثناء الإنشاء)، ورقم الطلب لتجاهل النتائج القديمة
  const [reportMonth, setReportMonth] = useState("");
  const generateSeq = useRef(0);
  // أسماء الهيكل والمسميات بالإنجليزية (تُحمّل في الواجهة الإنجليزية فقط)؛ القيم المحفوظة تبقى عربية
  const [orgEnglishNames, setOrgEnglishNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (locale !== "en") return;
    loadOrgEnglishNames().then(setOrgEnglishNames).catch(() => undefined);
  }, [locale]);
  const orgName = (name: string) => (locale === "en" ? orgEnglishNames.get(name.trim()) || t(name) : name);
  const symbolOf = (kind: DayCell["kind"]) => (locale === "en" && DAY_SYMBOLS_EN[kind]) || DAY_SYMBOLS[kind].symbol;
  const listSeparator = locale === "en" ? "; " : "؛ ";
  /** تحذير يبدأ بعدد ("3 موظف ...") يُترجم نصه دون العدد */
  const warningText = (warning: string) => {
    const match = /^(\d+) (.+)$/.exec(warning);
    return match ? `${match[1]} ${t(match[2])}` : t(warning);
  };

  useEffect(() => {
    const loadEmployees = async () => {
      setLoading(true);
      try {
        const rows = await fetchAllRows<Record<string, unknown>>((from, to) => supabase
          .from("employees")
          .select("id, emp_id, name, job_title, department, directorate, division, branch, status")
          .order("name")
          .order("id")
          .range(from, to));
        setEmployees(rows.map((row) => ({
          id: String(row.id ?? ""),
          empId: String(row.emp_id ?? "").trim(),
          name: String(row.name ?? "-"),
          jobTitle: String(row.job_title ?? "") || "غير محدد",
          department: String(row.department ?? "") || "غير محدد",
          administration: String(row.directorate ?? row.division ?? "") || "غير محدد",
          branch: String(row.branch ?? "") || "غير محدد",
          active: isEmployeeActive(row.status),
        })));
      } catch (error) {
        toast({ title: t("تعذر تحميل الموظفين"), description: hrRequestErrorText(error), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    void loadEmployees();
  }, [t]);

  const uniqueOptions = (values: string[]) =>
    Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "ar"));

  const departments = useMemo(() => uniqueOptions(employees.map((employee) => employee.department)), [employees]);
  const administrations = useMemo(() => uniqueOptions(employees.map((employee) => employee.administration)), [employees]);

  const filteredEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return employees.filter((employee) => {
      if (!showInactive && !employee.active) return false;
      if (department !== "الكل" && employee.department !== department) return false;
      if (administration !== "الكل" && employee.administration !== administration) return false;
      if (keyword && !employee.name.toLowerCase().includes(keyword) && !employee.empId.toLowerCase().includes(keyword)) return false;
      return true;
    });
  }, [employees, search, department, administration, showInactive]);

  const toggleEmployee = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setReports([]);
    generateSeq.current += 1;
    setGenerating(false);
  };

  const toggleFiltered = () => {
    const filteredIds = filteredEmployees.map((employee) => employee.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
    setSelectedIds((previous) => {
      const next = new Set(previous);
      filteredIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
    setReports([]);
    generateSeq.current += 1;
    setGenerating(false);
  };

  const selectedEmployees = employees.filter((employee) => selectedIds.has(employee.id));
  const range = /^\d{4}-\d{2}$/.test(reportMonth) ? monthRange(reportMonth) : { from: "", to: "" };

  const generateReport = async () => {
    if (selectedEmployees.length === 0) {
      toast({ title: t("اختر موظفاً واحداً على الأقل"), variant: "destructive" });
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      toast({ title: t("اختر شهراً للتقرير"), variant: "destructive" });
      return;
    }

    const seq = ++generateSeq.current;
    const targetMonth = month;
    setGenerating(true);
    try {
      const today = riyadhToday();
      // الحساب نفسه الذي يجريه كشف الرواتب (الحضور والإجازات والعطل والجداول والجزاءات والسلف)
      const computation = await computePayroll(selectedEmployees.map((employee) => employee.id), targetMonth);
      // صفوف الرواتب المحفوظة لهذا الشهر (بحالتها)
      const codes = [...new Set(selectedEmployees.map((employee) => employee.empId).filter(Boolean))];
      const savedRows: Record<string, unknown>[] = [];
      for (const part of chunk(codes)) {
        const rows = await fetchAllRows<Record<string, unknown>>((from, to) => supabase
          .from("payroll")
          .select("id, emp_id, emp_name, month, status, accounting_status, basic_salary, allowances, deductions, net_salary, social_insurance_deduction, penalty_deduction, advance_deduction, expense_reduction, notes")
          .eq("month", targetMonth)
          .in("emp_id", part)
          .order("id")
          .range(from, to));
        savedRows.push(...rows);
      }

      const generated: EmployeeReport[] = selectedEmployees.map((employee) => {
        const line = computation.lines.get(employee.id);
        // الرقم الوظيفي قد يتكرر: عند التكرار يُطابق الاسم أيضًا
        const sameCode = savedRows.filter((row) => String(row.emp_id ?? "").trim() === employee.empId);
        const saved = sameCode.length > 1 ? sameCode.find((row) => String(row.emp_name ?? "").trim() === employee.name.trim()) : sameCode[0];
        const days = (line?.days ?? []).map((day) => dayCell(day, today));
        const counts = {
          present: days.filter((day) => day.kind === "present").length,
          late: days.filter((day) => day.kind === "late").length,
          absent: days.filter((day) => day.kind === "absent").length,
          leave: days.filter((day) => day.kind === "leave" || day.kind === "unpaid").length,
          unrecorded: days.filter((day) => day.kind === "unrecorded").length,
        };
        if (computation.notStarted.has(employee.id)) {
          return { employee, days, counts, figures: null, statusLabel: "لم يبدأ خدمته في هذا الشهر", estimated: false, notes: t("تاريخ التعيين بعد نهاية الشهر") };
        }
        if (saved) {
          return {
            employee, days, counts,
            figures: rowFigures(saved),
            statusLabel: payrollStatusLabel(String(saved.status ?? ""), String(saved.accounting_status ?? "")),
            estimated: false,
            notes: localizePayrollNotes(String(saved.notes ?? "")),
          };
        }
        return {
          employee, days, counts,
          figures: line ? lineFigures(line) : null,
          statusLabel: "تقديري: لا يوجد صف رواتب محفوظ لهذا الشهر",
          estimated: true,
          notes: line ? (locale === "en" ? `Estimated calculation up to today — ${line.workDays} work days` : `حساب تقديري حتى تاريخ اليوم — ${line.workDays} يوم عمل`) : "",
        };
      });
      if (seq !== generateSeq.current) return;
      setReports(generated);
      setReportMonth(targetMonth);
      setReportWarnings([...computation.loadErrors.map((item) => `${t(item)}${listSeparator}${t("الأرقام التقديرية قد تكون ناقصة")}`), ...computation.warnings]);
    } catch (error) {
      if (seq === generateSeq.current) toast({ title: t("تعذر إنشاء التقرير"), description: hrRequestErrorText(error), variant: "destructive" });
    } finally {
      if (seq === generateSeq.current) setGenerating(false);
    }
  };

  const printReports = () => {
    if (reports.length === 0) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // نصوص الطباعة بلغة الواجهة: في الإنجليزية إنجليزية من اليسار إلى اليمين بأرقام إنجليزية
    const currency = escapeHtml(t("ر.س"));
    const pages = reports
      .map((report) => {
        const figures = report.figures;
        const deductionRows = figures
          ? deductionLines(figures).map((item) => `<tr><td>${escapeHtml(t(item.label))}</td><td>${money(item.value)} ${currency}</td></tr>`).join("") || `<tr><td colspan="2">${escapeHtml(t("لا توجد استقطاعات"))}</td></tr>`
          : `<tr><td colspan="2">${escapeHtml(t(report.statusLabel))}</td></tr>`;
        const attendanceHeaders = report.days
          .map((item) => `<th style="min-width:18px;padding:4px 1px;text-align:center"><b style="display:block;font-size:8px">${item.day}</b><small style="display:block;font-size:5px;font-weight:400">${escapeHtml(item.date.slice(5))}</small></th>`)
          .join("");
        const attendanceCells = report.days
          .map((item) => {
            const style = DAY_SYMBOLS[item.kind];
            return `<td title="${escapeHtml(`${formatDate(item.date)} - ${t(item.label)}`)}" style="padding:5px 1px;text-align:center;color:${style.color};font-size:11px;font-weight:800">${escapeHtml(symbolOf(item.kind))}</td>`;
          })
          .join("");
        const periodText = locale === "en"
          ? `For the period ${escapeHtml(formatDate(range.from))} to ${escapeHtml(formatDate(range.to))}`
          : `للفترة من ${escapeHtml(formatDate(range.from))} إلى ${escapeHtml(formatDate(range.to))}`;

        return `
        <section class="page">
          <div class="report-head">${printBrandHeaderHtml(`<div class="eyebrow">${escapeHtml(t("الموارد البشرية"))}</div><h1>${escapeHtml(t("تقرير الموظف الكامل"))}</h1><p>${periodText}</p>`, { company: t("شعار الشركة"), vision: t("رؤية المملكة 2030") })}</div>
          <div class="employee-card">
            <div class="avatar">${escapeHtml(report.employee.name.charAt(0))}</div>
            <div><h2>${escapeHtml(report.employee.name)}</h2><p>${escapeHtml(orgName(report.employee.jobTitle))}</p></div>
            <div class="identity"><span>${escapeHtml(t("رقم الموظف"))}</span><strong>${escapeHtml(report.employee.empId)}</strong></div>
          </div>
          <div class="meta-grid">
            <div><span>${escapeHtml(t("الإدارة"))}</span><strong>${escapeHtml(orgName(report.employee.administration))}</strong></div>
            <div><span>${escapeHtml(t("القسم"))}</span><strong>${escapeHtml(orgName(report.employee.department))}</strong></div>
            <div><span>${escapeHtml(t("الفرع"))}</span><strong>${escapeHtml(orgName(report.employee.branch))}</strong></div>
          </div>
          <div class="section-title"><h3>${escapeHtml(t("الحضور والانصراف"))}</h3><div class="stats"><b class="green">${escapeHtml(t("حضور"))} ${report.counts.present}</b><b class="amber">${escapeHtml(t("تأخير"))} ${report.counts.late}</b><b class="red">${escapeHtml(t("غياب"))} ${report.counts.absent}</b><b class="blue">${escapeHtml(t("إجازة"))} ${report.counts.leave}</b>${report.counts.unrecorded ? `<b class="grey">${escapeHtml(t("بلا تسجيل"))} ${report.counts.unrecorded}</b>` : ""}</div></div>
          <div style="overflow:hidden;border:1px solid #dbe4f0;border-radius:8px"><table style="width:100%;table-layout:fixed;margin:0"><thead><tr style="background:#1d4ed8;color:#fff"><th style="width:82px;padding:5px 3px;text-align:start">${escapeHtml(t("الموظف"))}</th>${attendanceHeaders}</tr></thead><tbody><tr><td style="padding:5px 3px;font-size:7px;font-weight:700;white-space:nowrap">${escapeHtml(report.employee.name)}</td>${attendanceCells}</tr></tbody></table></div>
          <p class="legend">${escapeHtml(t("✓ حضور (البرتقالي تأخير) · ✕ غياب مخصوم · إ إجازة (الأحمر بدون راتب) · — راحة أو عطلة · ؟ بلا تسجيل لم يُخصم · ○ قادم"))}</p>
          <div class="section-title"><h3>${escapeHtml(t("الراتب"))}</h3><span class="state ${report.estimated ? "est" : ""}">${escapeHtml(t(report.statusLabel))}</span></div>
          ${figures ? `<div class="finance-grid">
            <div><span>${escapeHtml(t("الراتب الأساسي المستحق"))}</span><strong>${money(figures.basic)} ${currency}</strong></div>
            <div><span>${escapeHtml(t("البدلات والإضافي"))}</span><strong>${money(figures.allowances)} ${currency}</strong></div>
            <div class="gross"><span>${escapeHtml(t("إجمالي الاستحقاق"))}</span><strong>${money(figures.gross)} ${currency}</strong></div>
            <div class="deduction"><span>${escapeHtml(t("إجمالي الاستقطاعات"))}</span><strong>− ${money(figures.deductions)} ${currency}</strong></div>
          </div>` : ""}
          <div class="section-title"><h3>${escapeHtml(t("تفصيل الاستقطاعات"))}</h3></div>
          <table class="deductions-table"><thead><tr><th>${escapeHtml(t("البند"))}</th><th>${escapeHtml(t("المبلغ"))}</th></tr></thead><tbody>${deductionRows}</tbody></table>
          ${report.notes ? `<div class="reason"><span>${escapeHtml(t("تفاصيل الحساب"))}</span><p>${escapeHtml(report.notes)}</p></div>` : ""}
          ${figures ? `<div class="net ${report.estimated ? "est" : ""}"><span>${escapeHtml(report.estimated ? t("صافي الراتب (تقديري)") : t("صافي الراتب"))}</span><strong>${money(figures.net)} ${currency}</strong></div>` : ""}
          <div class="signatures"><div>${escapeHtml(t("مسؤول الموارد البشرية"))}</div><div>${escapeHtml(t("المدير المالي"))}</div></div>
          <div class="footer">${escapeHtml(t("تاريخ إصدار التقرير"))}: ${escapeHtml(formatDate(riyadhToday()))} — ${escapeHtml(t("هذا التقرير للمعلومات وليس مستند صرف أو استلام"))}</div>
        </section>`;
      })
      .join("");

    printWindow.document
      .write(`<!doctype html><html dir="${direction}" lang="${locale}"><head><meta charset="utf-8"><title>${escapeHtml(t("تقرير الموظف الكامل"))}</title><style>
      @page{size:A4;margin:9mm}*{box-sizing:border-box}body{margin:0;background:#e2e8f0;color:#0f172a;font-family:Arial,"Tahoma",sans-serif}.page{width:210mm;min-height:277mm;margin:10px auto;background:#fff;padding:11mm;page-break-after:always;position:relative;overflow:hidden}.page:last-child{page-break-after:auto}.report-head{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #0f766e;padding-bottom:12px}.report-head .brand-head{flex:1;padding-bottom:0}${PRINT_BRAND_CSS}.report-head h1{font-size:25px;margin:3px 0}.report-head p{font-size:11px;color:#64748b;margin:0}.eyebrow{font-size:10px;font-weight:700;color:#0f766e;letter-spacing:1px}.brand{width:55px;height:55px;border-radius:18px;background:linear-gradient(135deg,#0f766e,#0ea5e9);display:grid;place-items:center;color:#fff;font-size:20px;font-weight:800}.employee-card{display:flex;align-items:center;gap:12px;margin:14px 0;background:linear-gradient(135deg,#f0fdfa,#eff6ff);border:1px solid #bae6d8;border-radius:14px;padding:12px}.avatar{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:#0f766e;color:#fff;font-size:20px;font-weight:800}.employee-card h2{margin:0 0 4px;font-size:18px}.employee-card p{margin:0;color:#64748b;font-size:11px}.identity{margin-inline-start:auto;text-align:center;background:#fff;border-radius:9px;padding:7px 15px;border:1px solid #dbeafe}.identity span,.meta-grid span,.finance-grid span,.reason span,.net span{display:block;color:#64748b;font-size:10px;margin-bottom:4px}.identity strong{font-size:14px;color:#0f766e}.meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.meta-grid div{border:1px solid #e2e8f0;border-radius:8px;padding:8px}.meta-grid strong{font-size:11px}.section-title{display:flex;justify-content:space-between;align-items:center;margin:15px 0 7px}.section-title h3{font-size:14px;margin:0;padding-inline-start:8px;border-inline-start:4px solid #0f766e}.stats{display:flex;gap:6px}.stats b{font-size:9px;border-radius:20px;padding:4px 8px}.green{color:#047857;background:#d1fae5}.red{color:#b91c1c;background:#fee2e2}.amber{color:#b45309;background:#fef3c7}.blue{color:#0369a1;background:#e0f2fe}.grey{color:#475569;background:#f1f5f9}.legend{font-size:8px;color:#64748b;margin:4px 0 0}.state{font-size:10px;font-weight:700;color:#0f766e;background:#f0fdfa;border:1px solid #99f6e4;border-radius:20px;padding:3px 10px}.state.est{color:#b45309;background:#fffbeb;border-color:#fde68a}table{width:100%;border-collapse:collapse;font-size:9px}th{background:#0f766e;color:#fff;padding:6px}td{border:1px solid #e2e8f0;text-align:center;padding:5px}.deductions-table{font-size:9px}.deductions-table td{padding:5px}.deductions-table td:nth-child(2){white-space:nowrap;font-weight:700;color:#be123c}.finance-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.finance-grid div{border:1px solid #e2e8f0;border-radius:9px;padding:9px}.finance-grid strong{font-size:11px}.finance-grid .gross{background:#eff6ff;border-color:#bfdbfe}.finance-grid .deduction{background:#fff1f2;border-color:#fecdd3}.deduction strong{color:#be123c}.reason{margin-top:8px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:9px;padding:8px}.reason p{font-size:9px;margin:0}.net{margin-top:9px;background:linear-gradient(135deg,#064e3b,#0f766e);color:#fff;border-radius:11px;padding:11px 15px;display:flex;align-items:center;justify-content:space-between}.net.est{background:linear-gradient(135deg,#92400e,#b45309)}.net span{color:#ecfeff;margin:0}.net strong{font-size:20px}.signatures{display:grid;grid-template-columns:repeat(2,1fr);gap:30px;margin-top:24px;text-align:center;color:#475569;font-size:10px}.signatures div{padding-top:16px;border-top:1px dashed #94a3b8}.footer{position:absolute;bottom:7mm;left:11mm;right:11mm;border-top:1px solid #e2e8f0;padding-top:5px;text-align:center;color:#94a3b8;font-size:8px}@media print{body{background:#fff}.page{margin:0;box-shadow:none}}
    </style></head><body>${pages}<script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };

  return (
    <Layout>
      <div className="space-y-6 p-1" dir={direction}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              onClick={() => navigate("/hr/dashboard")}
              className="mb-2 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
            >
              <ArrowRight className="h-4 w-4" /> {t("العودة إلى لوحة التحكم")}
            </button>
            <h1 className="text-3xl font-bold text-slate-900">{t("تقرير الموظف الكامل")}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {t("الحضور والراتب لشهر واحد بقواعد كشف الرواتب نفسها، جاهز للطباعة بمقاس A4")}
            </p>
          </div>
          {reports.length > 0 && (
            <button
              onClick={printReports}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white shadow-lg hover:bg-slate-800"
            >
              <Printer className="h-5 w-5" /> {t("طباعة التقرير")}
            </button>
          )}
        </div>

        <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
          <div className="bg-gradient-to-l from-emerald-700 via-teal-700 to-sky-700 px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/15 p-3">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t("إعداد التقرير")}</h2>
                <p className="text-sm text-emerald-50">{t("حدد الموظفين والفترة الزمنية ثم أنشئ التقرير")}</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">{t("رقم أو اسم الموظف")}</span>
              <div className="relative">
                <Search className="absolute start-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("مثال: 1001")}
                  className="h-10 w-full rounded-lg border border-slate-200 ps-9 pe-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">{t("الإدارة")}</span>
              <select
                value={administration}
                onChange={(event) => setAdministration(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="الكل">{t("كل الإدارات")}</option>
                {administrations.map((item) => (
                  <option key={item} value={item}>{orgName(item)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">{t("القسم")}</span>
              <select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="الكل">{t("كل الأقسام")}</option>
                {departments.map((item) => (
                  <option key={item} value={item}>{orgName(item)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4">
            <label className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-600">{t("شهر التقرير")}</span>
              <input
                type="month"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  setReports([]);
                  // نتيجة إنشاء جارٍ للشهر السابق تُتجاهل
                  generateSeq.current += 1;
                  setGenerating(false);
                }}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              />
            </label>
            <label className="flex h-10 items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
              {t("إظهار الموظفين غير الفعالين")}
            </label>
            <div className="ms-auto flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-600">
                {t("تم اختيار")} {selectedIds.size} {t("موظف")}
              </span>
              <button
                onClick={() => void generateReport()}
                disabled={generating || selectedIds.size === 0}
                className="flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-6 font-bold text-white shadow-md hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText className="h-5 w-5" />
                {generating ? t("جاري الإنشاء...") : t("إنشاء التقرير")}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" />
              <h2 className="font-bold text-slate-900">{t("اختيار الموظفين")}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{filteredEmployees.length}</span>
            </div>
            <button onClick={toggleFiltered} className="text-sm font-semibold text-emerald-700 hover:underline">
              {t("تحديد / إلغاء الكل")}
            </button>
          </div>
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">{t("جاري تحميل الموظفين...")}</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">{t("لا يوجد موظفون مطابقون للفلاتر")}</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredEmployees.map((employee) => {
                const active = selectedIds.has(employee.id);
                return (
                  <button
                    key={employee.id}
                    onClick={() => toggleEmployee(employee.id)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-start transition ${active ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500" : "border-slate-200 hover:border-emerald-300"}`}
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                      {active ? <Check className="h-5 w-5" /> : employee.name.charAt(0)}
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-sm text-slate-900">{employee.name}</strong>
                      <small className="block truncate text-slate-500">
                        #{employee.empId} · {orgName(employee.department)}{employee.active ? "" : ` · ${t("غير فعال")}`}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {reports.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <WalletCards className="h-5 w-5 text-sky-600" />
              <h2 className="text-xl font-bold">{t("معاينة التقرير")}</h2>
            </div>
            {reportWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {reportWarnings.map((warning) => <p key={warning}>{warningText(warning)}</p>)}
              </div>
            )}
            {reports.map((report) => {
              const figures = report.figures;
              return (
                <article key={report.employee.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center gap-4 bg-gradient-to-l from-slate-900 to-slate-700 p-5 text-white">
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-xl font-bold">
                      {report.employee.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">{report.employee.name}</h3>
                      <p className="text-xs text-slate-300">#{report.employee.empId} · {orgName(report.employee.jobTitle)}</p>
                    </div>
                    <div className="ms-auto flex flex-wrap gap-4 text-xs">
                      <span className="flex items-center gap-1"><Building2 className="h-4 w-4" />{orgName(report.employee.department)}</span>
                      <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />{formatDate(range.from)} — {formatDate(range.to)}</span>
                      <span className={`rounded-full px-3 py-1 font-semibold ${report.estimated ? "bg-amber-400 text-amber-950" : "bg-white/15"}`}>{t(report.statusLabel)}</span>
                    </div>
                  </div>
                  <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-6">
                    <div className="rounded-xl bg-emerald-50 p-3">
                      <span className="text-xs text-emerald-700">{t("أيام الحضور")}</span>
                      <strong className="mt-1 block text-xl text-emerald-800">{report.counts.present + report.counts.late}</strong>
                      {report.counts.late > 0 && <small className="text-amber-700">{t("منها تأخير")} {report.counts.late}</small>}
                    </div>
                    <div className="rounded-xl bg-rose-50 p-3">
                      <span className="text-xs text-rose-700">{t("أيام الغياب المخصومة")}</span>
                      <strong className="mt-1 block text-xl text-rose-800">{report.counts.absent}</strong>
                      {report.counts.unrecorded > 0 && <small className="text-slate-500">{t("بلا تسجيل لم يُخصم")} {report.counts.unrecorded}</small>}
                    </div>
                    <div className="rounded-xl bg-sky-50 p-3">
                      <span className="text-xs text-sky-700">{t("أيام الإجازة")}</span>
                      <strong className="mt-1 block text-xl text-sky-800">{report.counts.leave}</strong>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <span className="text-xs text-slate-600">{t("إجمالي الاستحقاق")}</span>
                      <strong className="mt-1 block text-lg text-slate-800">{figures ? money(figures.gross) : "—"}</strong>
                    </div>
                    <div className="rounded-xl bg-amber-50 p-3">
                      <span className="text-xs text-amber-700">{t("الاستقطاعات")}</span>
                      <strong className="mt-1 block text-lg text-amber-800">{figures ? money(figures.deductions) : "—"}</strong>
                    </div>
                    <div className={`rounded-xl p-3 text-white ${report.estimated ? "bg-amber-700" : "bg-slate-900"}`}>
                      <span className="text-xs text-slate-200">{report.estimated ? t("صافي الراتب (تقديري)") : t("صافي الراتب")}</span>
                      <strong className="mt-1 block text-lg">{figures ? money(figures.net) : "—"}</strong>
                    </div>
                  </div>
                  {figures && deductionLines(figures).length > 0 && (
                    <div className="border-t border-slate-100 px-5 py-4">
                      <h4 className="mb-2 font-bold text-slate-900">{t("تفصيل الاستقطاعات")}</h4>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {deductionLines(figures).map((item) => (
                          <div key={item.label} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                            <span className="text-slate-600">{t(item.label)}</span>
                            <strong className="text-rose-700">{money(item.value)} {t("ر.س")}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.notes && (
                    <div className="border-t border-slate-100 px-5 py-3 text-xs leading-6 text-slate-600">
                      <span className="font-semibold text-slate-800">{t("تفاصيل الحساب")}: </span>{report.notes}
                    </div>
                  )}
                  <div className="border-t border-slate-100 px-5 py-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-bold text-slate-900">{t("الحضور والانصراف للشهر الكامل")}</h4>
                      <div className="flex flex-wrap gap-3 text-xs font-semibold">
                        <span className="text-emerald-700">✓ {t("حضور")}</span>
                        <span className="text-amber-600">✓ {t("تأخير")}</span>
                        <span className="text-rose-600">✕ {t("غياب مخصوم")}</span>
                        <span className="text-sky-700">{symbolOf("leave")} {t("إجازة")}</span>
                        <span className="text-slate-400">— {t("راحة أو عطلة")}</span>
                        <span className="text-slate-400">{symbolOf("unrecorded")} {t("بلا تسجيل")}</span>
                        <span className="text-slate-300">○ {t("يوم قادم")}</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="min-w-max border-collapse text-center text-xs">
                        <thead className="bg-blue-700 text-white">
                          <tr>
                            <th className="sticky start-0 z-10 min-w-[170px] bg-blue-700 px-3 py-2 text-start">{t("الموظف")}</th>
                            {report.days.map((item) => (
                              <th key={item.date} className="min-w-[42px] px-1 py-1.5">
                                <span className="block text-sm font-bold">{item.day}</span>
                                <span className="block text-[9px] font-normal text-blue-100">{item.date.slice(5)}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-white">
                            <td className="sticky start-0 z-10 border-e border-slate-200 bg-white px-3 py-3 text-start font-bold text-slate-800">{report.employee.name}</td>
                            {report.days.map((item) => (
                              <td
                                key={item.date}
                                title={`${formatDate(item.date)} - ${t(item.label)}`}
                                className="border-r border-slate-100 px-1 py-2 text-lg font-bold"
                                style={{ color: DAY_SYMBOLS[item.kind].color }}
                              >
                                {symbolOf(item.kind)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </Layout>
  );
}
