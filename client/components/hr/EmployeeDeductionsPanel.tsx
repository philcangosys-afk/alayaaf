import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { hrRequestErrorText } from "@/lib/hrErrors";
import { riyadhMonth } from "@/lib/hrDates";
import { useI18n } from "@/i18n";

/**
 * الاقتطاعات الشهرية للموظف (HR-13، كما في سمارت): التأمين الطبي أو عقوبة جزاء أو غيرها،
 * بمبلغ ثابت أو نسبة من الراتب الأساسي، من شهر إلى شهر (أو مستمر). يخصمها كشف الراتب ضمن الاستقطاعات
 * لكل شهر يقع في فترتها (بحد المادة 93 مع السلف والجزاءات). لا تمس الراتب الإجمالي للموظف.
 * يسجّلها ويعدّلها ويحذفها مسؤول الرواتب، ولا أحد على نفسه (قاعدة البيانات تفرض ذلك).
 */
type DeductionRow = {
  id: string;
  type: string;
  calcType: "amount" | "percent";
  value: number;
  startMonth: string;
  endMonth: string;
  notes: string;
  createdBy: string;
  updatedBy: string;
};
type Draft = { id: string; type: string; calcType: "amount" | "percent"; value: string; startMonth: string; endMonth: string; notes: string };

// الجزاءات لا تُسجَّل هنا: لها صفحتها واعتمادها وحد المادة 72
const DEFAULT_TYPES = ["التأمين الطبي", "أخرى"];
const fieldClass = "w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none";
const labelClass = "space-y-1 text-xs font-medium text-slate-600";

export default function EmployeeDeductionsPanel({ employeeId, baseSalary, canManage, isOwn, active, onCountChange }: {
  employeeId: string;
  baseSalary: number;
  canManage: boolean;
  isOwn: boolean;
  active: boolean;
  onCountChange?: (count: number) => void;
}) {
  const { t, formatNumber } = useI18n();
  const [rows, setRows] = useState<DeductionRow[]>([]);
  const [types, setTypes] = useState<string[]>(DEFAULT_TYPES);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  // HR-28: اقتطاعات من إشعار خصم وافق عليه الموظف؛ تُعدَّل وتُزال من «الخصومات والإيميلات» فقط
  const [linked, setLinked] = useState<Map<string, string>>(new Map());
  const loadSeq = useRef(0);
  const currentMonth = riyadhMonth();
  const money = (value: number) => `${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t("ر.س")}`;

  const load = async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    const [deductionResult, typeResult] = await Promise.all([
      supabase.from("hr_deductions").select("*").eq("employee_id", employeeId).order("start_month", { ascending: false }).order("id"),
      supabase.from("hr_config_items").select("name_ar, status").eq("config_type", "deduction"),
    ]);
    if (seq !== loadSeq.current) return;
    setLoading(false);
    if (deductionResult.error) {
      const code = String((deductionResult.error as { code?: string }).code ?? "");
      setUnavailable(["42P01", "PGRST205"].includes(code));
      setRows([]);
      onCountChange?.(0);
      if (!["42P01", "PGRST205"].includes(code)) setError(hrRequestErrorText(deductionResult.error, t("تعذر تحميل الاقتطاعات")));
      return;
    }
    setUnavailable(false);
    const list = ((deductionResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id ?? ""),
      type: String(row.deduction_type ?? ""),
      calcType: (row.calc_type === "percent" ? "percent" : "amount") as "amount" | "percent",
      value: Number(row.value) || 0,
      startMonth: String(row.start_month ?? ""),
      endMonth: String(row.end_month ?? ""),
      notes: String(row.notes ?? ""),
      createdBy: String(row.created_by_name ?? ""),
      updatedBy: String(row.updated_by_name ?? ""),
    }));
    setRows(list);
    onCountChange?.(list.length);
    const linkedIds = new Map<string, string>();
    if (list.length > 0) {
      // قبل تحديث قاعدة البيانات (HR-28) أو بلا صلاحية قراءة الإشعارات: لا شيء مرتبط ظاهر، وقاعدة البيانات تمنع التعديل على أي حال
      const { data: noticeRows } = await supabase
        .from("hr_deduction_notices")
        .select("deduction_id, notice_no")
        .in("deduction_id", list.map((row) => row.id))
        .eq("status", "مقبول");
      ((noticeRows ?? []) as Record<string, unknown>[]).forEach((row) => linkedIds.set(String(row.deduction_id ?? ""), String(row.notice_no ?? "")));
    }
    if (seq !== loadSeq.current) return;
    setLinked(linkedIds);
    // أنواع الاقتطاعات المعرّفة في «أنواع الاقتطاعات المالية»، وإلا الأنواع الافتراضية
    const configured = ((typeResult.data ?? []) as Record<string, unknown>[])
      .filter((row) => !["غير فعال", "inactive", "موقوف"].includes(String(row.status ?? "").trim()))
      .map((row) => String(row.name_ar ?? "").trim())
      .filter(Boolean);
    setTypes([...new Set([...configured, ...DEFAULT_TYPES])]);
  };

  useEffect(() => {
    setDraft(null); setError(""); setMessage("");
    void load();
  }, [employeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = (row: DeductionRow) => {
    if (row.endMonth && row.endMonth < currentMonth) return { label: "منتهٍ", className: "bg-slate-100 text-slate-600" };
    if (row.startMonth > currentMonth) return { label: "يبدأ لاحقًا", className: "bg-sky-50 text-sky-700" };
    return { label: "ساري", className: "bg-emerald-50 text-emerald-700" };
  };
  const monthlyAmount = (row: { calcType: "amount" | "percent"; value: number }) =>
    row.calcType === "percent" ? Math.round(baseSalary * row.value) / 100 : row.value;

  const save = async () => {
    if (!draft || busy) return;
    const value = Math.round(Number(draft.value) * 100) / 100;
    if (!draft.type.trim()) { setError(t("اختر نوع الاقتطاع")); return; }
    if (!(value > 0) || (draft.calcType === "percent" && value > 100)) { setError(t(draft.calcType === "percent" ? "النسبة من 1 إلى 100" : "أدخل مبلغًا أكبر من صفر")); return; }
    if (!/^\d{4}-\d{2}$/.test(draft.startMonth)) { setError(t("اختر شهر البداية")); return; }
    if (draft.endMonth && draft.endMonth < draft.startMonth) { setError(t("شهر النهاية لا يسبق شهر البداية")); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = {
        deduction_type: draft.type.trim(),
        calc_type: draft.calcType,
        value,
        start_month: draft.startMonth,
        end_month: draft.endMonth || null,
        notes: draft.notes.trim() || null,
      };
      const result = draft.id
        ? await supabase.from("hr_deductions").update(payload).eq("id", draft.id).select("id")
        : await supabase.from("hr_deductions").insert({ ...payload, employee_id: employeeId }).select("id");
      if (result.error) throw result.error;
      if (!(result.data ?? []).length) throw new Error(t("لم يُحفظ شيء: لا تملك صلاحية الاقتطاعات"));
      setMessage(t(draft.id ? "حُفظ تعديل الاقتطاع" : "سُجّل الاقتطاع؛ يخصمه كشف الراتب لكل شهر في فترته"));
      setDraft(null);
      await load();
    } catch (saveError) {
      setError(hrRequestErrorText(saveError, t("تعذر حفظ الاقتطاع")));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: DeductionRow) => {
    if (busy || !window.confirm(`${t("حذف الاقتطاع")} «${row.type}»؟ ${t("لا يتغير ما خُصم في أشهر رواتبها معتمدة")}`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { data, error: deleteError } = await supabase.from("hr_deductions").delete().eq("id", row.id).select("id");
      if (deleteError) throw deleteError;
      setMessage((data ?? []).length ? t("حُذف الاقتطاع") : t("لم يُحذف شيء: لا تملك صلاحية الاقتطاعات"));
      await load();
    } catch (deleteError) {
      setError(hrRequestErrorText(deleteError, t("تعذر الحذف")));
    } finally {
      setBusy(false);
    }
  };

  const canEdit = canManage && !isOwn && !unavailable;
  // ملاحظة اقتطاع الإشعار (HR-28) محفوظة بالعربية: «إشعار DN-… (بموافقة الموظف): الواقعة»
  const noteText = (notes: string) => {
    const match = /^إشعار (DN-\d+) \(بموافقة الموظف\): ([\s\S]*)$/.exec(notes);
    return match ? `${t("إشعار خصم")} ${match[1]} (${t("بموافقة الموظف")}): ${match[2]}` : notes;
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{t("الاقتطاع الشهري (تأمين طبي، عقوبة جزاء، أخرى) بمبلغ ثابت أو نسبة من الراتب الأساسي، من شهر إلى شهر أو مستمر. يخصمه كشف الراتب ضمن الاستقطاعات لكل شهر في فترته، ولا يغيّر الراتب الإجمالي. ما خُصم في شهر رواتبه معتمدة لا يتغير بالتعديل أو الحذف.")}</p>
      {unavailable && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{t("الاقتطاعات الشهرية تحتاج تحديث قاعدة البيانات (HR-13)")}</p>}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
      {message && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">{message}</p>}
      {canEdit && active && !draft && (
        <button type="button" data-readonly-exempt onClick={() => { setDraft({ id: "", type: types[0] ?? "", calcType: "amount", value: "", startMonth: currentMonth, endMonth: "", notes: "" }); setError(""); setMessage(""); }}
          className="flex items-center gap-1 rounded-md bg-[#004e89] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#003d6b]">
          <Plus className="h-4 w-4" />{t("إضافة اقتطاع")}
        </button>
      )}
      {canEdit && draft && (
        <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>
            <span className="block">{t("اسم الاقتطاع")}</span>
            <input list="deduction-types" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} className={fieldClass} />
            <datalist id="deduction-types">{types.map((type) => <option key={type} value={type} />)}</datalist>
          </label>
          <label className={labelClass}>
            <span className="block">{t("نوع الاقتطاع")}</span>
            <select value={draft.calcType} onChange={(event) => setDraft({ ...draft, calcType: event.target.value === "percent" ? "percent" : "amount" })} className={fieldClass}>
              <option value="amount">{t("مبلغ")}</option>
              <option value="percent">{t("نسبة مئوية من الأساسي")}</option>
            </select>
          </label>
          <label className={labelClass}>
            <span className="block">{t(draft.calcType === "percent" ? "النسبة %" : "المبلغ الشهري")}</span>
            <input type="number" min="0" step="0.01" max={draft.calcType === "percent" ? 100 : undefined} value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} className={fieldClass} />
            {draft.calcType === "percent" && Number(draft.value) > 0 && <span className="block text-[11px] text-slate-500">≈ {money(monthlyAmount({ calcType: "percent", value: Number(draft.value) }))} {t("شهريًا")}</span>}
          </label>
          <label className={labelClass}>
            <span className="block">{t("ملاحظات")}</span>
            <input value={draft.notes} maxLength={500} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className={fieldClass} />
          </label>
          <label className={labelClass}>
            <span className="block">{t("من شهر")}</span>
            <input type="month" value={draft.startMonth} onChange={(event) => setDraft({ ...draft, startMonth: event.target.value })} className={fieldClass} />
          </label>
          <label className={labelClass}>
            <span className="block">{t("إلى شهر (اختياري)")}</span>
            <input type="month" value={draft.endMonth} min={draft.startMonth || undefined} onChange={(event) => setDraft({ ...draft, endMonth: event.target.value })} className={fieldClass} />
          </label>
          <div className="flex items-end gap-2">
            <button type="button" data-readonly-exempt disabled={busy} onClick={() => void save()} className="rounded-md bg-[#004e89] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{t("حفظ")}</button>
            <button type="button" data-readonly-exempt disabled={busy} onClick={() => setDraft(null)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm">{t("إلغاء")}</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[#075f94] text-white">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{t("اسم الاقتطاع")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("نوع الاقتطاع")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("قيمة الاقتطاع")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("من شهر")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("إلى شهر")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("الحالة")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("ملاحظات")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("أنشئ بواسطة")}</th>
              {canEdit && <th className="px-3 py-2 text-center font-medium">{t("الإجراءات")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={canEdit ? 9 : 8} className="py-6 text-center text-gray-400">{t("جاري التحميل...")}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={canEdit ? 9 : 8} className="py-6 text-center text-gray-400">{t("لا توجد اقتطاعات")}</td></tr>
            ) : rows.map((row) => {
              const state = status(row);
              return (
                <tr key={row.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2 font-medium">{t(row.type)}</td>
                  <td className="px-3 py-2">{t(row.calcType === "percent" ? "نسبة مئوية" : "مبلغ")}</td>
                  <td className="px-3 py-2 text-rose-700">
                    −{row.calcType === "percent" ? `${formatNumber(row.value)}%` : money(row.value)}
                    {row.calcType === "percent" && <span className="block text-[11px] text-slate-500">≈ {money(monthlyAmount(row))}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{row.startMonth}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.endMonth || t("مستمر")}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${state.className}`}>{t(state.label)}</span></td>
                  <td className="max-w-48 px-3 py-2 text-gray-600">{noteText(row.notes) || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{row.createdBy || "—"}{row.updatedBy ? ` (${t("عدّله")} ${row.updatedBy})` : ""}</td>
                  {canEdit && linked.has(row.id) && (
                    <td className="px-3 py-2 text-center text-[11px] text-slate-500" title={t("يُعدَّل أو يُزال من «الخصومات والإيميلات» ← «سجلات الإيميلات»")}>
                      {t("بموافقة الموظف")} <span dir="ltr">{linked.get(row.id)}</span>
                    </td>
                  )}
                  {canEdit && !linked.has(row.id) && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-2">
                        <button type="button" data-readonly-exempt disabled={busy} onClick={() => { setDraft({ id: row.id, type: row.type, calcType: row.calcType, value: String(row.value), startMonth: row.startMonth, endMonth: row.endMonth, notes: row.notes }); setError(""); setMessage(""); }} className="text-[#004e89] hover:text-[#003d6b] disabled:opacity-50" title={t("تعديل")}><Pencil className="h-4 w-4" /></button>
                        <button type="button" data-readonly-exempt disabled={busy} onClick={() => void remove(row)} className="text-rose-600 hover:text-rose-800 disabled:opacity-50" title={t("حذف")}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!canManage && <p className="text-xs text-slate-500">{t("إضافة الاقتطاعات وتعديلها تتطلب صلاحية إدارة الرواتب")}</p>}
    </div>
  );
}
