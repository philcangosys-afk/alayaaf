import { useEffect, useState } from "react";
import { History, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { riyadhMonth, riyadhToday } from "@/lib/hrDates";
import {
  EVENT_LABELS,
  deductMonthRange,
  deductionErrorText,
  loadNoticeEvents,
  removeNotice,
  updateNotice,
  type DeductionNotice,
  type NoticeEvent,
} from "@/lib/deductionNotices";

const field = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500";

/** رأس الإشعار: الموظف والسبب والمبلغ */
function NoticeHead({ notice }: { notice: DeductionNotice }) {
  const { t, formatNumber } = useI18n();
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
      <p className="font-semibold text-slate-900">{notice.empName} <small className="text-slate-500">#{notice.empId}</small></p>
      <p className="text-slate-700"><span dir="ltr">{notice.noticeNo}</span> — {t(notice.reasonName)}</p>
      <p className="text-xs text-slate-500">
        {formatNumber(notice.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t("ر.س")} · {t("شهر الخصم")} <span dir="ltr">{notice.deductMonth}</span>
      </p>
    </div>
  );
}

/**
 * تعديل الإشعار: قبل القبول كل الحقول، ويُعاد إرسال الإشعار بمهلة 24 ساعة جديدة.
 * بعد القبول: تخفيض المبلغ أو تغيير شهر الخصم فقط (لمصلحة الموظف)، والزيادة إشعار جديد.
 */
export function EditNoticeDialog({ notice, onClose, onSaved }: { notice: DeductionNotice | null; onClose: () => void; onSaved: () => void }) {
  const { t, direction } = useI18n();
  const [form, setForm] = useState({ amount: "", deductMonth: "", factDate: "", factDetails: "", factRef: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!notice) return;
    setForm({
      amount: String(notice.amount),
      deductMonth: notice.deductMonth,
      factDate: notice.factDate,
      factDetails: notice.factDetails,
      factRef: notice.factRef,
      note: "",
    });
    setError("");
  }, [notice]);

  if (!notice) return null;
  const accepted = notice.status === "مقبول";

  const save = async () => {
    const changes: Record<string, unknown> = {};
    const amount = Math.round(Number(form.amount) * 100) / 100;
    if (!(amount > 0)) {
      setError(t("المبلغ أكبر من صفر ولا يتجاوز 100000"));
      return;
    }
    if (accepted && amount > notice.amount) {
      setError(t("بعد قبول الموظف يُخفَّض المبلغ أو يُغيَّر شهر الخصم فقط؛ للزيادة أو لواقعة أخرى أرسل إشعارًا جديدًا"));
      return;
    }
    if (amount !== notice.amount) changes.amount = amount;
    if (form.deductMonth !== notice.deductMonth) changes.deduct_month = form.deductMonth;
    if (!accepted) {
      if (form.factDate !== notice.factDate) changes.fact_date = form.factDate;
      if (form.factDetails.trim() !== notice.factDetails) changes.fact_details = form.factDetails.trim();
      if (form.factRef.trim() !== notice.factRef) changes.fact_ref = form.factRef.trim();
    }
    if (Object.keys(changes).length === 0) {
      setError(t("لم تغيّر شيئًا"));
      return;
    }
    if (form.note.trim()) changes.note = form.note.trim();
    const confirmText = accepted
      ? t("يُعدَّل الاقتطاع في الراتب ويُبلَّغ الموظف بالتعديل. متابعة؟")
      : t("يُعاد إرسال الإشعار المعدَّل إلى بريد الموظف بمهلة رد 24 ساعة جديدة. متابعة؟");
    if (!window.confirm(confirmText)) return;
    setSaving(true);
    setError("");
    try {
      await updateNotice(notice.id, changes);
      toast.success(t("تم تعديل الإشعار وإبلاغ الموظف"));
      onSaved();
      onClose();
    } catch (saveError) {
      setError(deductionErrorText(saveError, t("تعذر تعديل الإشعار")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-[560px]" dir={direction}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" />{t("تعديل إشعار الخصم")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <NoticeHead notice={notice} />
          {accepted && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
              {t("قبل الموظف هذا الخصم: يُخفَّض المبلغ أو يُغيَّر شهر الخصم فقط. للزيادة أو لواقعة أخرى أرسل إشعارًا جديدًا.")}
            </p>
          )}
          {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">{t("المبلغ")} ({t("ر.س")})</span>
              <input type="number" min="0.01" step="0.01" max={accepted ? notice.amount : undefined} dir="ltr" value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })} className={field} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">{t("شهر الخصم")}</span>
              <input type="month" min={deductMonthRange(riyadhMonth()).min} max={deductMonthRange(riyadhMonth()).max} value={form.deductMonth} onChange={(event) => setForm({ ...form, deductMonth: event.target.value })} className={field} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">{t("تاريخ الواقعة")}</span>
              <input type="date" disabled={accepted} max={riyadhToday()} value={form.factDate} onChange={(event) => setForm({ ...form, factDate: event.target.value })} className={field} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">{t("المرجع (اختياري)")}</span>
              <input disabled={accepted} maxLength={200} value={form.factRef} onChange={(event) => setForm({ ...form, factRef: event.target.value })} className={field} />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">{t("تفاصيل الواقعة")}</span>
            <textarea disabled={accepted} rows={3} maxLength={1000} value={form.factDetails} onChange={(event) => setForm({ ...form, factDetails: event.target.value })} className={field} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">{t("ملاحظة للموظف (اختياري)")}</span>
            <input maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className={field} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm">{t("إلغاء")}</button>
            <button type="button" disabled={saving} onClick={() => void save()} className="flex items-center gap-1 rounded-md bg-[#004e89] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}{t("حفظ التعديل")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** إزالة الخصم بسبب مكتوب: يُحذف الاقتطاع من الراتب إن كان مقبولًا، ويُبلَّغ الموظف */
export function RemoveNoticeDialog({ notice, onClose, onRemoved }: { notice: DeductionNotice | null; onClose: () => void; onRemoved: () => void }) {
  const { t, direction } = useI18n();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setReason("");
    setError("");
  }, [notice?.id]);

  if (!notice) return null;

  const remove = async () => {
    if (reason.trim().length < 5) {
      setError(t("اكتب سبب إزالة الخصم (5 أحرف على الأقل)"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await removeNotice(notice.id, reason.trim());
      toast.success(t("أُزيل الخصم وأُبلغ الموظف"));
      onRemoved();
      onClose();
    } catch (removeError) {
      setError(deductionErrorText(removeError, t("تعذر إزالة الخصم")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-[520px]" dir={direction}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700"><Trash2 className="h-4 w-4" />{t("إزالة الخصم")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <NoticeHead notice={notice} />
          <p className="text-xs leading-5 text-slate-600">
            {notice.status === "مقبول"
              ? t("يُحذف الاقتطاع من راتب شهر الخصم، ويبقى الإشعار في السجل بحالة «أُزيل» مع السبب، ويُبلَّغ الموظف.")
              : t("يُلغى الإشعار ولا يُخصم شيء، ويبقى في السجل بحالة «أُزيل» مع السبب، ويُبلَّغ الموظف.")}
          </p>
          {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">{t("سبب الإزالة")} *</span>
            <textarea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className={field} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm">{t("إلغاء")}</button>
            <button type="button" disabled={saving} onClick={() => void remove()} className="flex items-center gap-1 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}{t("إزالة الخصم")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** سجل ما حدث للإشعار */
export function NoticeEventsDialog({ notice, onClose }: { notice: DeductionNotice | null; onClose: () => void }) {
  const { t, direction, formatDate, formatNumber } = useI18n();
  const [events, setEvents] = useState<NoticeEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!notice) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    loadNoticeEvents(notice.id)
      .then((rows) => { if (!cancelled) setEvents(rows); })
      .catch((loadError) => { if (!cancelled) setError(deductionErrorText(loadError, t("تعذر تحميل السجل"))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [notice, t]);

  if (!notice) return null;
  const money = (value: unknown) => formatNumber(Number(value) || 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const detailText = (event: NoticeEvent) => {
    const details = event.details;
    if (event.event === "send") return `${money(details.amount)} ${t("ر.س")} · ${t("شهر الخصم")} ${String(details.deduct_month ?? "")}`;
    if (event.event === "edit") {
      const before = (details.before ?? {}) as Record<string, unknown>;
      const after = (details.after ?? {}) as Record<string, unknown>;
      const parts = [
        before.amount !== after.amount ? `${t("المبلغ")}: ${money(before.amount)} ← ${money(after.amount)}` : "",
        before.deduct_month !== after.deduct_month ? `${t("شهر الخصم")}: ${String(before.deduct_month ?? "")} ← ${String(after.deduct_month ?? "")}` : "",
        before.fact_date !== after.fact_date ? `${t("تاريخ الواقعة")}: ${String(before.fact_date ?? "")} ← ${String(after.fact_date ?? "")}` : "",
        details.note ? `${t("ملاحظة")}: ${String(details.note)}` : "",
      ].filter(Boolean);
      return parts.join(" · ") || t("تعديل التفاصيل");
    }
    if (event.event === "remove") return `${t("السبب")}: ${String(details.reason ?? "")}`;
    return "";
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]" dir={direction}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" />{t("سجل الإشعار")}</DialogTitle>
        </DialogHeader>
        <NoticeHead notice={notice} />
        <div className="rounded-md border border-slate-200 p-3 text-xs leading-5 text-slate-700">
          <p><strong>{t("تاريخ الواقعة")}:</strong> <span dir="ltr">{notice.factDate}</span></p>
          <p><strong>{t("تفاصيل الواقعة")}:</strong> {notice.factDetails}</p>
          {notice.factRef && <p><strong>{t("المرجع")}:</strong> {notice.factRef}</p>}
          <p><strong>{t("البريد")}:</strong> <span dir="ltr">{notice.toEmail}</span></p>
          {notice.removalReason && <p className="text-red-700"><strong>{t("سبب الإزالة")}:</strong> {notice.removalReason}</p>}
        </div>
        {loading && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{t("جاري التحميل...")}</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <ol className="space-y-2 border-s-2 border-slate-200 ps-4">
          {events.map((event) => (
            <li key={event.id} className="relative">
              <span className="absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[#004e89]" />
              <p className="text-sm font-semibold text-slate-900">{t(EVENT_LABELS[event.event] ?? event.event)}</p>
              <p className="text-xs text-slate-500">
                {formatDate(event.happenedAt, { dateStyle: "medium", timeStyle: "short" })}{event.actorName ? ` · ${event.actorName}` : ""}
              </p>
              {detailText(event) && <p className="text-xs text-slate-700">{detailText(event)}</p>}
            </li>
          ))}
          {!loading && events.length === 0 && !error && <li className="text-sm text-slate-500">{t("لا توجد أحداث")}</li>}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
