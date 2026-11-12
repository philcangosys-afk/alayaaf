import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { riyadhMonth, riyadhToday } from "@/lib/hrDates";
import { readUserSession } from "@/lib/authSession";
import { deductMonthRange, deductionErrorText, sendNotices, type DeductionGroup, type DeductionReason, type SendItem } from "@/lib/deductionNotices";
import { EMPTY_FILTERS, EmployeeFilters, matchesEmployeeFilters, type DeductionEmployee, type EmployeeFilterState, type OrgOption } from "./deductionEmployees";

type Line = {
  key: string;
  employeeId: string;
  reasonId: string;
  factDate: string;
  factDetails: string;
  factRef: string;
  amount: string;
  deductMonth: string;
};

/**
 * HR-28: إرسال إشعار خصم من مجموعة: تُختار الأسباب، ثم الموظفون، ثم لكل موظف وسبب: تاريخ الواقعة وتفاصيلها والمبلغ وشهر الخصم.
 * لا يُخصم شيء عند الإرسال؛ الخصم يدخل الراتب بقبول الموظف فقط.
 */
export default function SendDeductionDialog({
  open,
  group,
  reasons,
  employees,
  mailbox,
  administrations,
  sections,
  onClose,
  onSent,
}: {
  open: boolean;
  group: DeductionGroup | null;
  reasons: DeductionReason[];
  employees: DeductionEmployee[];
  mailbox: Set<string>;
  administrations: OrgOption[];
  sections: OrgOption[];
  onClose: () => void;
  onSent: () => void;
}) {
  const { t, direction, formatNumber } = useI18n();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reasonIds, setReasonIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<EmployeeFilterState>(EMPTY_FILTERS);
  const [lines, setLines] = useState<Line[]>([]);
  const [common, setCommon] = useState({ factDate: riyadhToday(), amount: "", deductMonth: riyadhMonth(), factDetails: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const session = readUserSession() as { empId?: unknown } | null;
  const ownEmpId = String(session?.empId ?? "").trim();

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setReasonIds([]);
    setEmployeeIds([]);
    setFilters(EMPTY_FILTERS);
    setLines([]);
    setCommon({ factDate: riyadhToday(), amount: "", deductMonth: riyadhMonth(), factDetails: "" });
    setError("");
  }, [open, group?.id]);

  const reasonById = useMemo(() => new Map(reasons.map((reason) => [reason.id, reason])), [reasons]);
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const candidates = useMemo(
    () => employees.filter((employee) => employee.active && matchesEmployeeFilters(employee, filters, administrations, sections)),
    [administrations, employees, filters, sections],
  );
  const selectable = candidates.filter((employee) => mailbox.has(employee.id) && employee.empId !== ownEmpId);
  const allSelected = selectable.length > 0 && selectable.every((employee) => employeeIds.includes(employee.id));

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

  const buildLines = () => {
    const next: Line[] = [];
    employeeIds.forEach((employeeId) => reasonIds.forEach((reasonId) => {
      const existing = lines.find((line) => line.employeeId === employeeId && line.reasonId === reasonId);
      next.push(existing ?? {
        key: `${employeeId}:${reasonId}`,
        employeeId,
        reasonId,
        factDate: common.factDate,
        factDetails: common.factDetails,
        factRef: "",
        amount: common.amount,
        deductMonth: common.deductMonth,
      });
    }));
    setLines(next);
    setStep(3);
  };

  const applyCommon = () => setLines((current) => current.map((line) => ({
    ...line,
    factDate: common.factDate || line.factDate,
    amount: common.amount || line.amount,
    deductMonth: common.deductMonth || line.deductMonth,
    factDetails: common.factDetails.trim() ? common.factDetails : line.factDetails,
  })));

  const updateLine = (key: string, patch: Partial<Line>) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const lineLabel = (line: Line) => `${employeeById.get(line.employeeId)?.name ?? ""} — ${t(reasonById.get(line.reasonId)?.name ?? "")}`;
  const monthRange = deductMonthRange(riyadhMonth());
  const today = riyadhToday();
  const invalid = lines.filter((line) =>
    !/^\d{4}-\d{2}-\d{2}$/.test(line.factDate) || line.factDate > today
    || !/^\d{4}-\d{2}$/.test(line.deductMonth) || line.deductMonth < monthRange.min || line.deductMonth > monthRange.max
    || !(Number(line.amount) > 0) || Number(line.amount) > 100000 || line.factDetails.trim().length < 5);

  const send = async () => {
    if (lines.length === 0 || invalid.length > 0) return;
    if (!window.confirm(`${t("إرسال")} ${formatNumber(lines.length)} ${t("إشعار خصم إلى بريد الموظفين؟ لا يُخصم أي مبلغ إلا بعد قبول الموظف")}`)) return;
    setSending(true);
    setError("");
    try {
      const items: SendItem[] = lines.map((line) => ({
        employee_id: line.employeeId,
        reason_id: line.reasonId,
        fact_date: line.factDate,
        fact_details: line.factDetails.trim(),
        fact_ref: line.factRef.trim() || undefined,
        amount: Math.round(Number(line.amount) * 100) / 100,
        deduct_month: line.deductMonth,
      }));
      const sent = await sendNotices(items);
      onSent();
      onClose();
      toast.success(`${t("أُرسل")} ${formatNumber(sent)} ${t("إشعار خصم إلى بريد الموظفين")}`);
    } catch (sendError) {
      setError(deductionErrorText(sendError, t("تعذر إرسال إشعارات الخصم"), lines.map(lineLabel)));
    } finally {
      setSending(false);
    }
  };

  if (!group) return null;
  const field = "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm";

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !sending) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[980px]" dir={direction}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#004e89]">
            <Send className="h-5 w-5" />
            {t("إرسال إشعار خصم")} — {t(group.name)}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 text-xs font-semibold">
          {[1, 2, 3].map((number) => (
            <span key={number} className={`rounded-full px-3 py-1 ${step === number ? "bg-[#004e89] text-white" : "bg-slate-100 text-slate-500"}`}>
              {formatNumber(number)}. {t(number === 1 ? "الأسباب" : number === 2 ? "الموظفون" : "الواقعة والمبلغ")}
            </span>
          ))}
        </div>

        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{t("لا يُخصم أي مبلغ عند الإرسال. يدخل الخصم الراتب فقط إذا ضغط الموظف «قبول» من بريده، ولا يُعد السكوت قبولًا.")}</p>
            <p>{t("الغياب المسجّل في الحضور والجزاءات المسجّلة تُخصم تلقائيًا من كشف الراتب؛ لا ترسل عنها إشعارًا حتى لا تُخصم مرتين.")}</p>
          </div>
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {step === 1 && (
          <div className="space-y-2">
            {reasons.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">{t("لا توجد أسباب فعالة في هذه المجموعة؛ أضف سببًا أولًا")}</p>
            ) : reasons.map((reason) => (
              <label key={reason.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${reasonIds.includes(reason.id) ? "border-[#004e89] bg-sky-50" : "border-slate-200"}`}>
                <input type="checkbox" className="mt-1" checked={reasonIds.includes(reason.id)} onChange={() => setReasonIds((current) => toggle(current, reason.id))} />
                <span>
                  <strong className="block text-sm text-slate-900">{t(reason.name)}</strong>
                  {reason.legalBasis && <small className="block text-slate-500">{t(reason.legalBasis)}</small>}
                </span>
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm">{t("إلغاء")}</button>
              <button type="button" disabled={reasonIds.length === 0} onClick={() => setStep(2)} className="rounded-md bg-[#004e89] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {t("التالي")} ({formatNumber(reasonIds.length)})
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <EmployeeFilters value={filters} onChange={setFilters} administrations={administrations} sections={sections} />
            <div className="flex items-center justify-between text-xs text-slate-600">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={allSelected} disabled={selectable.length === 0}
                  onChange={() => setEmployeeIds((current) => allSelected
                    ? current.filter((id) => !selectable.some((employee) => employee.id === id))
                    : [...new Set([...current, ...selectable.map((employee) => employee.id)])])} />
                {t("تحديد الظاهرين")} ({formatNumber(selectable.length)})
              </label>
              <span>{t("المحددون")}: {formatNumber(employeeIds.length)}</span>
            </div>
            <div className="max-h-[45vh] divide-y overflow-y-auto rounded-md border border-slate-200">
              {candidates.length === 0 && <p className="p-6 text-center text-sm text-slate-500">{t("لا يوجد موظفون مطابقون للفلاتر")}</p>}
              {candidates.map((employee) => {
                const noMailbox = !mailbox.has(employee.id);
                const own = employee.empId === ownEmpId;
                return (
                  <label key={employee.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${noMailbox || own ? "opacity-60" : "cursor-pointer hover:bg-slate-50"}`}>
                    <input type="checkbox" disabled={noMailbox || own} checked={employeeIds.includes(employee.id)} onChange={() => setEmployeeIds((current) => toggle(current, employee.id))} />
                    <span className="min-w-0 flex-1">
                      <strong className="text-slate-900">{employee.name}</strong>
                      <small className="ms-2 text-slate-500">#{employee.empId} · {employee.nationality ? t(employee.nationality) : t("غير محدد")}</small>
                    </span>
                    {noMailbox && <small className="text-amber-700">{t("لا بريد مولَّد")}</small>}
                    {own && <small className="text-slate-500">{t("سجلك")}</small>}
                  </label>
                );
              })}
            </div>
            <div className="flex justify-between gap-2 pt-1">
              <button type="button" onClick={() => setStep(1)} className="rounded-md border border-gray-300 px-4 py-2 text-sm">{t("السابق")}</button>
              <button type="button" disabled={employeeIds.length === 0} onClick={buildLines} className="rounded-md bg-[#004e89] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {t("التالي")} ({formatNumber(employeeIds.length * reasonIds.length)} {t("إشعار")})
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-5">
              <label className="space-y-1 text-xs text-slate-600">
                <span>{t("تاريخ الواقعة")}</span>
                <input type="date" value={common.factDate} max={riyadhToday()} onChange={(event) => setCommon({ ...common, factDate: event.target.value })} className={field} />
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                <span>{t("المبلغ")} ({t("ر.س")})</span>
                <input type="number" min="0.01" step="0.01" dir="ltr" value={common.amount} onChange={(event) => setCommon({ ...common, amount: event.target.value })} className={field} />
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                <span>{t("شهر الخصم")}</span>
                <input type="month" min={monthRange.min} max={monthRange.max} value={common.deductMonth} onChange={(event) => setCommon({ ...common, deductMonth: event.target.value })} className={field} />
              </label>
              <label className="space-y-1 text-xs text-slate-600 sm:col-span-2">
                <span>{t("تفاصيل الواقعة")}</span>
                <input value={common.factDetails} maxLength={1000} onChange={(event) => setCommon({ ...common, factDetails: event.target.value })} className={field} />
              </label>
              <div className="sm:col-span-5">
                <button type="button" onClick={applyCommon} className="rounded-md border border-[#004e89] px-3 py-1.5 text-xs font-semibold text-[#004e89] hover:bg-sky-50">
                  {t("تطبيق على كل الإشعارات")}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((line) => {
                const bad = invalid.includes(line);
                return (
                  <div key={line.key} className={`rounded-md border p-3 ${bad ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <strong className="text-sm text-slate-900">{lineLabel(line)}</strong>
                      <button type="button" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} title={t("حذف من الإرسال")} className="text-slate-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-6">
                      <label className="space-y-1 text-xs text-slate-600">
                        <span>{t("تاريخ الواقعة")}</span>
                        <input type="date" value={line.factDate} max={riyadhToday()} onChange={(event) => updateLine(line.key, { factDate: event.target.value })} className={field} />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        <span>{t("المبلغ")}</span>
                        <input type="number" min="0.01" step="0.01" dir="ltr" value={line.amount} onChange={(event) => updateLine(line.key, { amount: event.target.value })} className={field} />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        <span>{t("شهر الخصم")}</span>
                        <input type="month" min={monthRange.min} max={monthRange.max} value={line.deductMonth} onChange={(event) => updateLine(line.key, { deductMonth: event.target.value })} className={field} />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600 sm:col-span-2">
                        <span>{t("تفاصيل الواقعة")} *</span>
                        <input value={line.factDetails} maxLength={1000} onChange={(event) => updateLine(line.key, { factDetails: event.target.value })} placeholder={t("ماذا حدث، ومتى، وما الذي يثبته")} className={field} />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        <span>{t("المرجع (اختياري)")}</span>
                        <input value={line.factRef} maxLength={200} onChange={(event) => updateLine(line.key, { factRef: event.target.value })} placeholder={t("رقم محضر أو فاتورة")} className={field} />
                      </label>
                    </div>
                  </div>
                );
              })}
              {lines.length === 0 && <p className="py-6 text-center text-sm text-slate-500">{t("لا توجد إشعارات للإرسال")}</p>}
            </div>

            {invalid.length > 0 && (
              <p className="text-xs text-amber-800">
                {formatNumber(invalid.length)} {t("إشعار ينقصه تاريخ الواقعة أو تفاصيلها (5 أحرف على الأقل) أو المبلغ أو شهر الخصم")} — {t("شهر الخصم من الشهر الماضي حتى 12 شهرًا قادمًا")}
              </p>
            )}
            <p className="text-xs text-slate-600">
              {t("يصل كل إشعار إلى بريد الموظف وفيه: يرجى الرد خلال 24 ساعة بالقبول أو التواصل مع الإدارة")}
            </p>
            <div className="flex justify-between gap-2 pt-1">
              <button type="button" disabled={sending} onClick={() => setStep(2)} className="rounded-md border border-gray-300 px-4 py-2 text-sm">{t("السابق")}</button>
              <button type="button" disabled={sending || lines.length === 0 || invalid.length > 0} onClick={() => void send()}
                className="flex items-center gap-1 rounded-md bg-[#004e89] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {t("إرسال")} ({formatNumber(lines.length)})
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
