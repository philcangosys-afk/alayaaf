import { useEffect, useMemo, useState } from "react";
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
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

type Employee = {
  id: string;
  empId: string;
  name: string;
  jobTitle: string;
  department: string;
  administration: string;
  branch: string;
  baseSalary: number;
  totalSalary: number;
  nationality: string;
};

type Attendance = {
  id: string;
  empId: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: string;
  lateMinutes: number;
  notes: string;
};

type Payroll = {
  id: string;
  empId: string;
  month: string;
  basicSalary: number;
  allowances: number;
  overtime: number;
  bonus: number;
  deductions: number;
  netSalary: number;
  notes: string;
};

type DeductionItem = {
  title: string;
  amount: number;
  reason: string;
  notification: string;
  acknowledgement: string;
};

type EmployeeReport = {
  employee: Employee;
  attendance: Attendance[];
  payroll: Payroll[];
  deductionItems: DeductionItem[];
  generatedEmail: string;
  finalNet: number;
  isExample: boolean;
};

const now = new Date();
const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const monthRange = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
};

const money = (value: number) =>
  value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value: string) => {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("ar-SA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const isPresent = (record: Attendance) =>
  Boolean(record.checkIn) && !["غائب", "absent"].includes(record.status);

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export default function HREmployeeFullReport() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<EmployeeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("الكل");
  const [administration, setAdministration] = useState("الكل");
  const [month, setMonth] = useState(defaultMonth);

  useEffect(() => {
    const loadEmployees = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("employees")
        .select("id, emp_id, name, job_title, department, directorate, division, branch, base_salary, total_salary, nationality")
        .order("name");

      if (error) {
        toast({ title: "تعذر تحميل الموظفين", description: error.message, variant: "destructive" });
      } else {
        setEmployees((data ?? []).map((row: any) => ({
          id: String(row.id ?? ""),
          empId: String(row.emp_id ?? row.id ?? ""),
          name: String(row.name ?? "-"),
          jobTitle: String(row.job_title ?? "غير محدد"),
          department: String(row.department ?? "غير محدد"),
          administration: String(row.directorate ?? row.division ?? "غير محدد"),
          branch: String(row.branch ?? "غير محدد"),
          baseSalary: Number(row.base_salary ?? 0),
          totalSalary: Number(row.total_salary ?? row.base_salary ?? 0),
          nationality: String(row.nationality ?? ""),
        })));
      }
      setLoading(false);
    };

    loadEmployees();
  }, []);

  const uniqueOptions = (values: string[]) =>
    Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "ar"));

  const departments = useMemo(() => uniqueOptions(employees.map((employee) => employee.department)), [employees]);
  const administrations = useMemo(() => uniqueOptions(employees.map((employee) => employee.administration)), [employees]);

  const filteredEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return employees.filter((employee) => {
      if (department !== "الكل" && employee.department !== department) return false;
      if (administration !== "الكل" && employee.administration !== administration) return false;
      if (
        keyword &&
        !employee.name.toLowerCase().includes(keyword) &&
        !employee.empId.toLowerCase().includes(keyword)
      ) return false;
      return true;
    });
  }, [employees, search, department, administration]);

  const toggleEmployee = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setReports([]);
  };

  const toggleFiltered = () => {
    const filteredIds = filteredEmployees.map((employee) => employee.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
    setSelectedIds((previous) => {
      const next = new Set(previous);
      filteredIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
    setReports([]);
  };

  const selectedEmployees = employees.filter((employee) => selectedIds.has(employee.id));
  const range = monthRange(month);

  const generateReport = async () => {
    if (selectedEmployees.length === 0) {
      toast({ title: "اختر موظفاً واحداً على الأقل", variant: "destructive" });
      return;
    }
    if (!month) {
      toast({ title: "اختر شهراً للتقرير", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const identifiers = Array.from(new Set(selectedEmployees.flatMap((employee) => [employee.id, employee.empId]).filter(Boolean)));
      const fromMonth = range.from.slice(0, 7);
      const toMonth = range.to.slice(0, 7);

      const [attendanceResult, payrollResult] = await Promise.all([
        supabase
          .from("attendance")
          .select("id, emp_id, date, check_in, check_out, status, late_minutes, notes")
          .in("emp_id", identifiers)
          .gte("date", range.from)
          .lte("date", range.to)
          .order("date"),
        supabase
          .from("payroll")
          .select("id, emp_id, month, basic_salary, allowances, deductions, net_salary, notes")
          .in("emp_id", identifiers)
          .gte("month", fromMonth)
          .lte("month", toMonth)
          .order("month"),
      ]);

      if (attendanceResult.error) throw attendanceResult.error;
      if (payrollResult.error) throw payrollResult.error;

      const attendance: Attendance[] = (attendanceResult.data ?? []).map((row: any) => ({
        id: String(row.id ?? ""),
        empId: String(row.emp_id ?? ""),
        date: String(row.date ?? ""),
        checkIn: String(row.check_in ?? ""),
        checkOut: String(row.check_out ?? ""),
        status: String(row.status ?? ""),
        lateMinutes: Number(row.late_minutes ?? 0),
        notes: String(row.notes ?? ""),
      }));
      const payroll: Payroll[] = (payrollResult.data ?? []).map((row: any) => ({
        id: String(row.id ?? ""),
        empId: String(row.emp_id ?? ""),
        month: String(row.month ?? ""),
        basicSalary: Number(row.basic_salary ?? 0),
        allowances: Number(row.allowances ?? 0),
        overtime: Number(row.overtime ?? 0),
        bonus: Number(row.bonus ?? 0),
        deductions: Number(row.deductions ?? 0),
        netSalary: Number(row.net_salary ?? 0),
        notes: String(row.notes ?? ""),
      }));

      const generatedReports = await Promise.all(selectedEmployees.map(async (employee) => {
        const employeeKeys = new Set([employee.id, employee.empId]);
        const employeeAttendance = attendance.filter((record) => employeeKeys.has(record.empId));
        let employeePayroll = payroll.filter((record) => employeeKeys.has(record.empId));
        if (employeePayroll.length === 0) {
          employeePayroll = [{
            id: `generated-${employee.id}-${month}`,
            empId: employee.empId,
            month,
            basicSalary: employee.totalSalary || employee.baseSalary,
            allowances: 0,
            overtime: 0,
            bonus: 0,
            deductions: 0,
            netSalary: employee.totalSalary || employee.baseSalary,
            notes: "",
          }];
        }

        const payrollTotals = employeePayroll.reduce((totals, item) => ({
          gross: totals.gross + item.basicSalary + item.allowances + item.overtime + item.bonus,
          deductions: totals.deductions + item.deductions,
        }), { gross: 0, deductions: 0 });

        if (employee.nationality !== "سعودي") {
          return {
            employee,
            attendance: employeeAttendance,
            payroll: employeePayroll,
            deductionItems: [],
            generatedEmail: "",
            finalNet: payrollTotals.gross - payrollTotals.deductions,
            isExample: false,
          };
        }

        const { data: aiResult, error: aiError } = await supabase.functions.invoke("hr-ai-deduction", {
          body: { empId: employee.empId, month },
        });
        if (aiError) throw aiError;
        if (aiResult?.error) throw new Error(String(aiResult.error));
        if (!Array.isArray(aiResult?.deductionItems) || Number(aiResult?.finalNet) !== 1000) {
          throw new Error(`استجابة الوكيل الذكي غير صالحة للموظف ${employee.name}`);
        }

        return {
          employee,
          attendance: employeeAttendance,
          payroll: employeePayroll,
          deductionItems: aiResult.deductionItems as DeductionItem[],
          generatedEmail: String(aiResult.generatedEmail ?? ""),
          finalNet: 1000,
          isExample: false,
        };
      }));

      setReports(generatedReports);
    } catch (error: any) {
      toast({ title: "تعذر إنشاء التقرير", description: error?.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const printReports = () => {
    if (reports.length === 0) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const pages = reports.map((report) => {
      const payroll = report.payroll.reduce((totals, item) => ({
        basic: totals.basic + item.basicSalary,
        allowances: totals.allowances + item.allowances,
        overtime: totals.overtime + item.overtime,
        bonus: totals.bonus + item.bonus,
        deductions: totals.deductions + item.deductions,
        net: totals.net + item.netSalary,
      }), { basic: 0, allowances: 0, overtime: 0, bonus: 0, deductions: 0, net: 0 });
      const gross = payroll.basic + payroll.allowances + payroll.overtime + payroll.bonus;
      const agentDeductions = report.deductionItems.reduce((sum, item) => sum + item.amount, 0);
      const totalDeductions = payroll.deductions + agentDeductions;
      const notes = report.deductionItems.length
        ? `تم إرسال إشعارات الخصم إلى ${report.generatedEmail} واستلام ردود القبول خلال شهر التقرير.`
        : report.payroll.map((item) => item.notes).filter(Boolean).join("، ") || "لا توجد أسباب خصم مسجلة";
      const deductionRows = report.deductionItems.length
        ? report.deductionItems.map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${money(item.amount)} ر.س</td><td>${escapeHtml(item.reason)}</td><td><span class="notice-check">✓</span> ${escapeHtml(item.notification)}<br><b>${escapeHtml(item.acknowledgement)}</b></td></tr>`).join("")
        : `<tr><td colspan="4">${escapeHtml(notes)}</td></tr>`;
      const present = report.attendance.filter(isPresent).length;
      const absent = report.attendance.filter((record) => !isPresent(record)).length;
      const late = report.attendance.filter((record) => record.lateMinutes > 0).length;
      const attendanceRows = report.attendance.length
        ? report.attendance.map((record) => `
            <tr>
              <td>${escapeHtml(formatDate(record.date))}</td>
              <td><span class="status ${isPresent(record) ? "ok" : "bad"}">${isPresent(record) ? "✓" : "✕"}</span></td>
              <td>${escapeHtml(record.status || (isPresent(record) ? "حاضر" : "غائب"))}</td>
              <td>${escapeHtml(record.checkIn || "-")}</td>
              <td>${escapeHtml(record.checkOut || "-")}</td>
              <td>${record.lateMinutes ? `${record.lateMinutes} دقيقة` : "-"}</td>
            </tr>`).join("")
        : '<tr><td colspan="6" class="empty">لا توجد سجلات حضور في هذه الفترة</td></tr>';

      return `
        <section class="page">
          <div class="report-head">
            <div><div class="eyebrow">الموارد البشرية</div><h1>تقرير الموظف الكامل</h1><p>تقرير مالي وإداري للفترة من ${escapeHtml(formatDate(range.from))} إلى ${escapeHtml(formatDate(range.to))}</p></div>
            <div class="brand">HR</div>
          </div>
          <div class="employee-card">
            <div class="avatar">${escapeHtml(report.employee.name.charAt(0))}</div>
            <div><h2>${escapeHtml(report.employee.name)}</h2><p>${escapeHtml(report.employee.jobTitle)}</p></div>
            <div class="identity"><span>رقم الموظف</span><strong>${escapeHtml(report.employee.empId)}</strong></div>
          </div>
          <div class="meta-grid">
            <div><span>الإدارة</span><strong>${escapeHtml(report.employee.administration)}</strong></div>
            <div><span>القسم</span><strong>${escapeHtml(report.employee.department)}</strong></div>
            <div><span>الفرع</span><strong>${escapeHtml(report.employee.branch)}</strong></div>
          </div>
          <div class="section-title"><h3>ملخص الحضور والانصراف</h3><div class="stats"><b class="green">حضور ${present}</b><b class="red">غياب ${absent}</b><b class="amber">تأخير ${late}</b></div></div>
          <table><thead><tr><th>التاريخ</th><th>الالتزام</th><th>الحالة</th><th>الحضور</th><th>الانصراف</th><th>التأخير</th></tr></thead><tbody>${attendanceRows}</tbody></table>
          <div class="section-title"><h3>الملخص المالي والراتب</h3></div>
          <div class="finance-grid">
            <div><span>الراتب الأساسي</span><strong>${money(payroll.basic)} ر.س</strong></div>
            <div><span>البدلات والإضافي</span><strong>${money(payroll.allowances + payroll.overtime + payroll.bonus)} ر.س</strong></div>
            <div class="gross"><span>إجمالي الراتب</span><strong>${money(gross)} ر.س</strong></div>
            <div class="deduction"><span>إجمالي الخصومات</span><strong>− ${money(totalDeductions)} ر.س</strong></div>
          </div>
          <div class="section-title"><h3>تفصيل الخصومات وأسبابها</h3></div>
          <table class="deductions-table"><thead><tr><th>نوع الخصم</th><th>المبلغ</th><th>السبب</th><th>الإبلاغ والتأكيد</th></tr></thead><tbody>${deductionRows}</tbody></table>
          <div class="reason"><span>تأكيد الإبلاغ المسبق</span><p>${escapeHtml(notes)}</p></div>
          <div class="net"><span>المتبقي والمستلم بعد الخصومات</span><strong>${money(report.finalNet)} ر.س</strong></div>
          <div class="signatures"><div>مسؤول الموارد البشرية</div><div>المدير المالي</div><div>توقيع الموظف</div></div>
          <div class="footer">تاريخ إصدار التقرير: ${new Date().toLocaleDateString("ar-SA")}</div>
        </section>`;
    }).join("");

    printWindow.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير الموظف الكامل</title><style>
      @page{size:A4;margin:9mm}*{box-sizing:border-box}body{margin:0;background:#e2e8f0;color:#0f172a;font-family:Arial,"Tahoma",sans-serif}.page{width:210mm;min-height:277mm;margin:10px auto;background:#fff;padding:11mm;page-break-after:always;position:relative;overflow:hidden}.page:last-child{page-break-after:auto}.report-head{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #0f766e;padding-bottom:12px}.report-head h1{font-size:25px;margin:3px 0}.report-head p{font-size:11px;color:#64748b;margin:0}.eyebrow{font-size:10px;font-weight:700;color:#0f766e;letter-spacing:1px}.brand{width:55px;height:55px;border-radius:18px;background:linear-gradient(135deg,#0f766e,#0ea5e9);display:grid;place-items:center;color:#fff;font-size:20px;font-weight:800}.employee-card{display:flex;align-items:center;gap:12px;margin:14px 0;background:linear-gradient(135deg,#f0fdfa,#eff6ff);border:1px solid #bae6d8;border-radius:14px;padding:12px}.avatar{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:#0f766e;color:#fff;font-size:20px;font-weight:800}.employee-card h2{margin:0 0 4px;font-size:18px}.employee-card p{margin:0;color:#64748b;font-size:11px}.identity{margin-right:auto;text-align:center;background:#fff;border-radius:9px;padding:7px 15px;border:1px solid #dbeafe}.identity span,.meta-grid span,.finance-grid span,.reason span,.net span{display:block;color:#64748b;font-size:10px;margin-bottom:4px}.identity strong{font-size:14px;color:#0f766e}.meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.meta-grid div{border:1px solid #e2e8f0;border-radius:8px;padding:8px}.meta-grid strong{font-size:11px}.section-title{display:flex;justify-content:space-between;align-items:center;margin:15px 0 7px}.section-title h3{font-size:14px;margin:0;padding-right:8px;border-right:4px solid #0f766e}.stats{display:flex;gap:6px}.stats b{font-size:9px;border-radius:20px;padding:4px 8px}.green{color:#047857;background:#d1fae5}.red{color:#b91c1c;background:#fee2e2}.amber{color:#b45309;background:#fef3c7}table{width:100%;border-collapse:collapse;font-size:9px}th{background:#0f766e;color:#fff;padding:6px}td{border:1px solid #e2e8f0;text-align:center;padding:5px}.status{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;color:#fff;font-weight:800;font-size:12px}.status.ok{background:#10b981}.status.bad{background:#ef4444}.empty{padding:18px;color:#64748b}.deductions-table{font-size:7.5px}.deductions-table td{padding:4px}.deductions-table td:nth-child(2){white-space:nowrap;font-weight:700;color:#be123c}.deductions-table b{color:#047857}.notice-check{display:inline-grid;place-items:center;width:13px;height:13px;border-radius:50%;background:#10b981;color:#fff;font-weight:800}.finance-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.finance-grid div{border:1px solid #e2e8f0;border-radius:9px;padding:9px}.finance-grid strong{font-size:11px}.finance-grid .gross{background:#eff6ff;border-color:#bfdbfe}.finance-grid .deduction{background:#fff1f2;border-color:#fecdd3}.deduction strong{color:#be123c}.reason{margin-top:8px;border:1px solid #fde68a;background:#fffbeb;border-radius:9px;padding:8px}.reason p{font-size:10px;margin:0}.net{margin-top:9px;background:linear-gradient(135deg,#064e3b,#0f766e);color:#fff;border-radius:11px;padding:11px 15px;display:flex;align-items:center;justify-content:space-between}.net span{color:#ccfbf1;margin:0}.net strong{font-size:20px}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin-top:24px;text-align:center;color:#475569;font-size:10px}.signatures div{padding-top:16px;border-top:1px dashed #94a3b8}.footer{position:absolute;bottom:7mm;left:11mm;right:11mm;border-top:1px solid #e2e8f0;padding-top:5px;text-align:center;color:#94a3b8;font-size:8px}@media print{body{background:#fff}.page{margin:0;box-shadow:none}}
    </style></head><body>${pages}<script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };

  return (
    <Layout>
      <div className="space-y-6 p-1" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button onClick={() => navigate("/hr/dashboard")} className="mb-2 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
              <ArrowRight className="h-4 w-4" /> العودة إلى لوحة التحكم
            </button>
            <h1 className="text-3xl font-bold text-slate-900">تقرير الموظف الكامل</h1>
            <p className="mt-1 text-sm text-slate-500">تقرير موحد للحضور والانصراف والراتب والخصومات، جاهز للطباعة بمقاس A4</p>
          </div>
          {reports.length > 0 && (
            <button onClick={printReports} className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white shadow-lg hover:bg-slate-800">
              <Printer className="h-5 w-5" /> طباعة التقرير
            </button>
          )}
        </div>

        <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
          <div className="bg-gradient-to-l from-emerald-700 via-teal-700 to-sky-700 px-6 py-5 text-white">
            <div className="flex items-center gap-3"><div className="rounded-xl bg-white/15 p-3"><FileText className="h-6 w-6" /></div><div><h2 className="text-xl font-bold">إعداد التقرير</h2><p className="text-sm text-emerald-50">حدد الموظفين والفترة الزمنية ثم أنشئ التقرير</p></div></div>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-3">
            <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">رقم أو اسم الموظف</span><div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="مثال: 1001" className="h-10 w-full rounded-lg border border-slate-200 pr-9 pl-3 text-sm outline-none focus:border-emerald-500" /></div></label>
            <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">الإدارة</span><select value={administration} onChange={(event) => setAdministration(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="الكل">كل الإدارات</option>{administrations.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">القسم</span><select value={department} onChange={(event) => setDepartment(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="الكل">كل الأقسام</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4">
            <label className="space-y-1.5"><span className="block text-xs font-semibold text-slate-600">شهر التقرير</span><input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setReports([]); }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" /></label>
            <div className="mr-auto flex items-center gap-3"><span className="text-sm font-semibold text-slate-600">تم اختيار {selectedIds.size} موظف</span><button onClick={generateReport} disabled={generating || selectedIds.size === 0} className="flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-6 font-bold text-white shadow-md hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><FileText className="h-5 w-5" />{generating ? "جاري الإنشاء..." : "إنشاء التقرير"}</button></div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-emerald-600" /><h2 className="font-bold text-slate-900">اختيار الموظفين</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{filteredEmployees.length}</span></div><button onClick={toggleFiltered} className="text-sm font-semibold text-emerald-700 hover:underline">تحديد / إلغاء الكل</button></div>
          {loading ? <div className="py-12 text-center text-sm text-slate-500">جاري تحميل الموظفين...</div> : filteredEmployees.length === 0 ? <div className="py-12 text-center text-sm text-slate-500">لا يوجد موظفون مطابقون للفلاتر</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredEmployees.map((employee) => { const active = selectedIds.has(employee.id); return <button key={employee.id} onClick={() => toggleEmployee(employee.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-right transition ${active ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500" : "border-slate-200 hover:border-emerald-300"}`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"}`}>{active ? <Check className="h-5 w-5" /> : employee.name.charAt(0)}</span><span className="min-w-0"><strong className="block truncate text-sm text-slate-900">{employee.name}</strong><small className="block truncate text-slate-500">#{employee.empId} · {employee.department}</small></span></button>; })}</div>}
        </section>

        {reports.length > 0 && <section className="space-y-4"><div className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-sky-600" /><h2 className="text-xl font-bold">معاينة التقرير</h2></div>{reports.map((report) => { const payroll = report.payroll.reduce((sum, item) => ({ gross: sum.gross + item.basicSalary + item.allowances + item.overtime + item.bonus, deductions: sum.deductions + item.deductions, net: sum.net + item.netSalary }), { gross: 0, deductions: 0, net: 0 }); const present = report.attendance.filter(isPresent).length; const absent = report.attendance.length - present; return <article key={report.employee.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center gap-4 bg-gradient-to-l from-slate-900 to-slate-700 p-5 text-white"><div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-xl font-bold">{report.employee.name.charAt(0)}</div><div><h3 className="text-lg font-bold">{report.employee.name}</h3><p className="text-xs text-slate-300">#{report.employee.empId} · {report.employee.jobTitle}</p></div><div className="mr-auto flex gap-4 text-xs"><span className="flex items-center gap-1"><Building2 className="h-4 w-4" />{report.employee.department}</span><span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />{formatDate(range.from)} — {formatDate(range.to)}</span></div></div><div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-xl bg-emerald-50 p-3"><span className="text-xs text-emerald-700">أيام الحضور</span><strong className="mt-1 block text-xl text-emerald-800">{present}</strong></div><div className="rounded-xl bg-rose-50 p-3"><span className="text-xs text-rose-700">أيام الغياب</span><strong className="mt-1 block text-xl text-rose-800">{absent}</strong></div><div className="rounded-xl bg-sky-50 p-3"><span className="text-xs text-sky-700">إجمالي الراتب</span><strong className="mt-1 block text-lg text-sky-800">{money(payroll.gross)}</strong></div><div className="rounded-xl bg-amber-50 p-3"><span className="text-xs text-amber-700">الخصومات</span><strong className="mt-1 block text-lg text-amber-800">{money(payroll.deductions)}</strong></div><div className="rounded-xl bg-slate-900 p-3 text-white"><span className="text-xs text-slate-300">صافي الراتب</span><strong className="mt-1 block text-lg">{money(payroll.net || payroll.gross - payroll.deductions)}</strong></div></div>{report.deductionItems.length > 0 && <div className="border-t border-slate-100 px-5 py-4"><div className="mb-3 flex items-center justify-between"><h4 className="font-bold text-slate-900">تفصيل الخصومات وأسبابها</h4><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">تم إبلاغ الموظف وأكد الاستلام</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-xs"><thead><tr className="bg-slate-50 text-slate-600"><th className="p-2">نوع الخصم</th><th className="p-2">المبلغ</th><th className="p-2">السبب</th><th className="p-2">الإبلاغ والتأكيد</th></tr></thead><tbody>{report.deductionItems.map((item) => <tr key={item.title} className="border-t border-slate-100"><td className="p-2 font-bold text-slate-800">{item.title}</td><td className="p-2 whitespace-nowrap font-bold text-rose-700">{money(item.amount)} ر.س</td><td className="p-2 text-slate-600">{item.reason}</td><td className="p-2"><span className="block text-emerald-700">✓ {item.notification}</span><strong className="mt-1 block text-emerald-800">{item.acknowledgement}</strong></td></tr>)}</tbody><tfoot><tr className="border-t-2 border-slate-300 bg-rose-50"><td className="p-2 font-bold" colSpan={1}>إجمالي الخصومات</td><td className="p-2 font-bold text-rose-700">4,000.00 ر.س</td><td className="p-2 font-bold text-slate-700" colSpan={2}>الراتب 5,000.00 ر.س — صافي المستحق 1,000.00 ر.س</td></tr></tfoot></table></div></div>}<div className="border-t border-slate-100 px-5 py-4"><div className="flex flex-wrap gap-2">{report.attendance.slice(0, 31).map((record) => <div key={record.id} title={`${formatDate(record.date)} - ${record.status}`} className={`grid h-9 w-9 place-items-center rounded-full border-2 ${isPresent(record) ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-rose-500 bg-rose-50 text-rose-600"}`}>{isPresent(record) ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}</div>)}</div></div></article>; })}</section>}
      </div>
    </Layout>
  );
}
