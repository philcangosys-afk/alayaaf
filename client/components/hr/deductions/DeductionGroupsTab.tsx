import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Loader2, Pencil, Plus, RefreshCw, Scale, Send } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import {
  deductionErrorText,
  loadGroupsAndReasons,
  loadMailboxEmployees,
  reasonsForGroup,
  saveReason,
  setGroupActive,
  type DeductionGroup,
  type DeductionReason,
} from "@/lib/deductionNotices";
import { useDeductionOrg } from "./deductionEmployees";
import SendDeductionDialog from "./SendDeductionDialog";

type ReasonDraft = { id: string | null; groupId: string; name: string; legalBasis: string; description: string; sortOrder: string; active: boolean };

/**
 * HR-28: المجموعات العشر وأسبابها. لكل مجموعة زر «إرسال إشعار خصم» يختار فيه المسؤول الأسباب والموظفين والواقعة والمبلغ.
 * إضافة الأسباب وتعديلها وإيقافها لمدير النظام ومن يدير الرواتب (تحميها سياسات قاعدة البيانات).
 */
export default function DeductionGroupsTab({ canManage, onSent }: { canManage: boolean; onSent: () => void }) {
  const { t, direction, formatNumber } = useI18n();
  const [groups, setGroups] = useState<DeductionGroup[]>([]);
  const [reasons, setReasons] = useState<DeductionReason[]>([]);
  const [mailbox, setMailbox] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sendGroup, setSendGroup] = useState<DeductionGroup | null>(null);
  const [draft, setDraft] = useState<ReasonDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const org = useDeductionOrg(reloadKey);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loadGroupsAndReasons();
      setGroups(result.groups);
      setReasons(result.reasons);
      if (canManage) {
        const boxes = await loadMailboxEmployees().catch(() => new Map<string, string>());
        setMailbox(new Set(boxes.keys()));
      }
    } catch (loadError) {
      setError(deductionErrorText(loadError, t("تعذر تحميل مجموعات الخصومات")));
    } finally {
      setLoading(false);
    }
  }, [canManage, t]);

  useEffect(() => { void load(); }, [load]);

  const groupById = useMemo(() => new Map(groups.map((group) => [group.code, group])), [groups]);

  const saveDraft = async () => {
    if (!draft) return;
    if (draft.name.trim().length < 2) {
      toast.error(t("اكتب اسم السبب"));
      return;
    }
    setSaving(true);
    try {
      await saveReason(draft.id, {
        groupId: draft.groupId,
        name: draft.name,
        legalBasis: draft.legalBasis,
        description: draft.description,
        sortOrder: Number(draft.sortOrder) || 100,
        active: draft.active,
      });
      toast.success(t(draft.id ? "تم تعديل السبب" : "تمت إضافة السبب"));
      setDraft(null);
      await load();
    } catch (saveError) {
      toast.error(deductionErrorText(saveError, t("تعذر حفظ السبب")));
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = async (group: DeductionGroup) => {
    const message = group.active
      ? t("إيقاف المجموعة يخفي زر الإرسال منها، ولا يغيّر الإشعارات المرسلة. متابعة؟")
      : t("تفعيل المجموعة؟");
    if (!window.confirm(message)) return;
    try {
      await setGroupActive(group.id, !group.active);
      await load();
    } catch (toggleError) {
      toast.error(deductionErrorText(toggleError, t("تعذر تغيير حالة المجموعة")));
    }
  };

  if (loading && groups.length === 0) {
    return <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />{t("جاري التحميل...")}</div>;
  }
  if (error) {
    return (
      <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p>{error}</p>
        <button type="button" onClick={() => void load()} className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold">{t("إعادة المحاولة")}</button>
      </div>
    );
  }

  const field = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-5" dir={direction}>
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
        <div className="mb-1 flex items-center gap-2 font-bold"><Scale className="h-4 w-4" />{t("قواعد الخصم بموافقة الموظف")}</div>
        <ul className="list-disc space-y-0.5 ps-5 text-xs">
          <li>{t("كل إشعار يبدأ من واقعة موثقة: تاريخها وتفاصيلها، والمرجع إن وُجد.")}</li>
          <li>{t("يصل الإشعار إلى بريد الموظف الداخلي، ويرد خلال 24 ساعة بـ «قبول» أو «التواصل مع الإدارة».")}</li>
          <li>{t("لا يدخل الخصم الراتب إلا بقبول الموظف الصريح؛ السكوت ليس قبولًا، وبعد 24 ساعة يظهر «انتهت مهلة الرد» لتتابع الإدارة.")}</li>
          <li>{t("كشف الرواتب يطبق حد نصف الأجر على مجموع الاستقطاعات (المادة 93)، وحد أجر 10 أيام للتلف (المادة 91)، و10% لاسترداد القروض (المادة 92).")}</li>
        </ul>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Layers className="h-5 w-5 text-[#004e89]" />{t("مجموعات الخصومات")} ({formatNumber(groups.length)})</h2>
        <button type="button" onClick={() => { setReloadKey((key) => key + 1); void load(); }} title={t("تحديث")} className="rounded-md border border-gray-300 p-2 text-slate-600 hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => {
          const own = reasons.filter((reason) => reason.groupId === group.id);
          const available = reasonsForGroup(group, groups, reasons);
          return (
            <article key={group.id} className={`flex flex-col rounded-xl border bg-white shadow-sm ${group.active ? "border-slate-200" : "border-dashed border-slate-300 opacity-70"}`}>
              <div className="flex items-start gap-3 border-b border-slate-100 p-4">
                <span dir="ltr" className="rounded-md bg-[#004e89]/10 px-2 py-1 font-mono text-xs font-bold text-[#004e89]">{group.code}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-slate-900">{t(group.name)}</h3>
                  {group.description && <p className="mt-1 text-xs leading-5 text-slate-600">{t(group.description)}</p>}
                  {group.includes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="text-[11px] text-slate-500">{t("يشمل أسباب")}:</span>
                      {group.includes.map((code) => (
                        <span key={code} title={t(groupById.get(code)?.name ?? "")} dir="ltr" className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{code}</span>
                      ))}
                    </div>
                  )}
                </div>
                {!group.active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600">{t("غير فعال")}</span>}
              </div>

              <ul className="flex-1 divide-y divide-slate-100 px-4">
                {own.length === 0 && <li className="py-3 text-xs text-slate-500">{t("لا توجد أسباب خاصة بهذه المجموعة")}</li>}
                {own.map((reason) => (
                  <li key={reason.id} className={`flex items-start gap-2 py-2 ${reason.active ? "" : "opacity-50"}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">{t(reason.name)}{!reason.active && <small className="ms-2 text-slate-500">({t("غير فعال")})</small>}</p>
                      {reason.legalBasis && <p className="text-[11px] text-slate-500">{t(reason.legalBasis)}</p>}
                    </div>
                    {canManage && (
                      <button type="button" title={t("تعديل")} onClick={() => setDraft({
                        id: reason.id, groupId: reason.groupId, name: reason.name, legalBasis: reason.legalBasis,
                        description: reason.description, sortOrder: String(reason.sortOrder), active: reason.active,
                      })} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3">
                {canManage && (
                  <button type="button" disabled={!group.active || available.length === 0} onClick={() => setSendGroup(group)}
                    className="flex items-center gap-1 rounded-md bg-[#004e89] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    <Send className="h-3.5 w-3.5" />{t("إرسال إشعار خصم")}
                  </button>
                )}
                {canManage && (
                  <button type="button" onClick={() => setDraft({ id: null, groupId: group.id, name: "", legalBasis: "", description: "", sortOrder: String((own.length + 1) * 10), active: true })}
                    className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                    <Plus className="h-3.5 w-3.5" />{t("إضافة سبب")}
                  </button>
                )}
                {canManage && (
                  <button type="button" onClick={() => void toggleGroup(group)} className="ms-auto text-xs text-slate-500 hover:text-slate-800">
                    {group.active ? t("إيقاف المجموعة") : t("تفعيل المجموعة")}
                  </button>
                )}
                {!canManage && <span className="text-xs text-slate-500">{t("الإرسال لمدير النظام أو من يدير الرواتب")}</span>}
              </div>
            </article>
          );
        })}
      </div>

      <SendDeductionDialog
        open={Boolean(sendGroup)}
        group={sendGroup}
        reasons={sendGroup ? reasonsForGroup(sendGroup, groups, reasons) : []}
        employees={org.employees}
        mailbox={mailbox}
        administrations={org.administrations}
        sections={org.sections}
        onClose={() => setSendGroup(null)}
        onSent={onSent}
      />

      <Dialog open={Boolean(draft)} onOpenChange={(next) => { if (!next && !saving) setDraft(null); }}>
        <DialogContent className="sm:max-w-[520px]" dir={direction}>
          <DialogHeader>
            <DialogTitle>{t(draft?.id ? "تعديل سبب" : "إضافة سبب")}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <label className="block space-y-1 text-sm">
                <span className="text-slate-700">{t("اسم السبب")} *</span>
                <input value={draft.name} maxLength={100} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={field} />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-slate-700">{t("السند النظامي")}</span>
                <input value={draft.legalBasis} maxLength={300} onChange={(event) => setDraft({ ...draft, legalBasis: event.target.value })} className={field} />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-slate-700">{t("الوصف")}</span>
                <textarea value={draft.description} maxLength={500} rows={2} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={field} />
              </label>
              <div className="flex items-center gap-4">
                <label className="flex-1 space-y-1 text-sm">
                  <span className="text-slate-700">{t("الترتيب")}</span>
                  <input type="number" dir="ltr" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })} className={field} />
                </label>
                <label className="mt-5 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
                  {t("فعال")}
                </label>
              </div>
              <p className="text-xs text-slate-500">{t("تعديل السبب لا يغيّر الإشعارات المرسلة؛ يحفظ كل إشعار اسم سببه وقت الإرسال.")}</p>
              <div className="flex justify-end gap-2">
                <button type="button" disabled={saving} onClick={() => setDraft(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm">{t("إلغاء")}</button>
                <button type="button" disabled={saving} onClick={() => void saveDraft()} className="flex items-center gap-1 rounded-md bg-[#004e89] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}{t("حفظ")}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
