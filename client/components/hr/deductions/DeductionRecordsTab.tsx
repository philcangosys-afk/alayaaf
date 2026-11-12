import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, History, Loader2, Mails, Pencil, Printer, RefreshCw, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { readUserSession } from "@/lib/authSession";
import { PRINT_BRAND_CSS, printBrandHeaderHtml } from "@/lib/printBranding";
import { riyadhToday } from "@/lib/hrDates";
import {
  NOTICE_STATUSES,
  NOTICE_STATUS_STYLE,
  deductionErrorText,
  displayStatus,
  loadNotices,
  type DeductionNotice,
  type NoticeDisplayStatus,
} from "@/lib/deductionNotices";
import { EMPTY_FILTERS, EmployeeFilters, matchesEmployeeFilters, useDeductionOrg, type DeductionEmployee, type EmployeeFilterState } from "./deductionEmployees";
import { EditNoticeDialog, NoticeEventsDialog, RemoveNoticeDialog } from "./NoticeDialogs";

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

type EmployeeRecord = { employeeId: string; employee?: DeductionEmployee; name: string; empId: string; notices: DeductionNotice[] };

/**
 * HR-28 «سجلات الإيميلات»: سجل لكل موظف بإشعارات الخصم المرسلة إلى بريده وحالة كل إشعار،
 * مع التعديل وإزالة الخصم بسبب، وسجل ما حدث لكل إشعار. الكتابة كلها بدوال الخادم.
 */
export default function DeductionRecordsTab({ canManage, reloadKey }: { canManage: boolean; reloadKey: number }) {
  const { t, direction, locale, formatDate, formatNumber } = useI18n();
  const [notices, setNotices] = useState<DeductionNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<EmployeeFilterState>(EMPTY_FILTERS);
  const [status, setStatus] = useState<"" | "follow-up" | NoticeDisplayStatus>("");
  const [month, setMonth] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<DeductionNotice | null>(null);
  const [removing, setRemoving] = useState<DeductionNotice | null>(null);
  const [history, setHistory] = useState<DeductionNotice | null>(null);
  const [localReload, setLocalReload] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const org = useDeductionOrg(reloadKey);
  const session = readUserSession();
  const ownEmpId = String(session?.empId ?? "").trim();

  // «انتهت مهلة الرد» تتغير مع الوقت: تُحدَّث كل دقيقة
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setNotices(await loadNotices());
      setNow(Date.now());
    } catch (loadError) {
      setError(deductionErrorText(loadError, t("تعذر تحميل سجلات الإيميلات")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load, reloadKey, localReload]);

  const money = (value: number) => formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateTime = (value: string) => (value ? formatDate(value, { dateStyle: "medium", timeStyle: "short" }) : "—");
  const employeeById = useMemo(() => new Map(org.employees.map((employee) => [employee.id, employee])), [org.employees]);

  const filtered = useMemo(() => notices.filter((notice) => {
    const shown = displayStatus(notice, now);
    if (status === "follow-up" && shown !== "انتهت مهلة الرد" && shown !== "طلب تواصل") return false;
    if (status && status !== "follow-up" && shown !== status) return false;
    if (month && notice.deductMonth !== month) return false;
    const employee = employeeById.get(notice.employeeId);
    if (!employee) {
      if (filters.nationality || filters.administration || filters.section) return false;
      const keyword = filters.search.trim().toLowerCase();
      return !keyword || [notice.empName, notice.empId, notice.noticeNo].some((value) => value.toLowerCase().includes(keyword));
    }
    return matchesEmployeeFilters(employee, filters, org.administrations, org.sections, [notice.noticeNo, notice.toEmail]);
  }), [employeeById, filters, month, notices, now, org.administrations, org.sections, status]);

  const records = useMemo(() => {
    const map = new Map<string, EmployeeRecord>();
    filtered.forEach((notice) => {
      const current = map.get(notice.employeeId) ?? {
        employeeId: notice.employeeId,
        employee: employeeById.get(notice.employeeId),
        name: employeeById.get(notice.employeeId)?.name || notice.empName,
        empId: employeeById.get(notice.employeeId)?.empId || notice.empId,
        notices: [],
      };
      current.notices.push(notice);
      map.set(notice.employeeId, current);
    });
    return [...map.values()].sort((a, b) => a.empId.localeCompare(b.empId, "en", { numeric: true }) || a.name.localeCompare(b.name));
  }, [employeeById, filtered]);

  const counts = useMemo(() => {
    const result = new Map<NoticeDisplayStatus, number>();
    filtered.forEach((notice) => {
      const shown = displayStatus(notice, now);
      result.set(shown, (result.get(shown) ?? 0) + 1);
    });
    return result;
  }, [filtered, now]);
  const acceptedTotal = filtered.filter((notice) => notice.status === "مقبول").reduce((sum, notice) => sum + notice.amount, 0);

  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const refresh = () => setLocalReload((key) => key + 1);

  const print = () => {
    if (records.length === 0) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const currency = escapeHtml(t("ر.س"));
    const body = records.map((record) => {
      const rows = record.notices.map((notice) => `<tr>
        <td dir="ltr">${escapeHtml(notice.noticeNo)}</td>
        <td>${escapeHtml(t(notice.reasonName))}<small>${escapeHtml(notice.factDetails)}</small></td>
        <td dir="ltr">${escapeHtml(notice.factDate)}</td>
        <td>${money(notice.amount)} ${currency}</td>
        <td dir="ltr">${escapeHtml(notice.deductMonth)}</td>
        <td>${escapeHtml(t(displayStatus(notice, now)))}${notice.removalReason ? `<small>${escapeHtml(notice.removalReason)}</small>` : ""}</td>
        <td>${escapeHtml(dateTime(notice.sentAt))}</td>
        <td>${escapeHtml(notice.respondedAt ? dateTime(notice.respondedAt) : "—")}</td>
      </tr>`).join("");
      const accepted = record.notices.filter((notice) => notice.status === "مقبول").reduce((sum, notice) => sum + notice.amount, 0);
      return `<section><h2>${escapeHtml(record.name)} <span>#${escapeHtml(record.empId)}</span></h2>
        <table><thead><tr><th>${escapeHtml(t("رقم الإشعار"))}</th><th>${escapeHtml(t("السبب والواقعة"))}</th><th>${escapeHtml(t("تاريخ الواقعة"))}</th><th>${escapeHtml(t("المبلغ"))}</th><th>${escapeHtml(t("شهر الخصم"))}</th><th>${escapeHtml(t("الحالة"))}</th><th>${escapeHtml(t("أُرسل"))}</th><th>${escapeHtml(t("الرد"))}</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="total">${escapeHtml(t("المقبول"))}: ${money(accepted)} ${currency}</p></section>`;
    }).join("");
    win.document.write(`<!doctype html><html dir="${direction}" lang="${locale}"><head><meta charset="utf-8"><title>${escapeHtml(t("سجلات الإيميلات"))}</title><style>
      @page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#0f172a;margin:0;padding:8mm}${PRINT_BRAND_CSS}
      h1{font-size:20px;margin:4px 0}h2{font-size:14px;margin:14px 0 6px}h2 span{color:#64748b;font-weight:400}table{width:100%;border-collapse:collapse;font-size:10px}
      th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:start;vertical-align:top}th{background:#004e89;color:#fff}small{display:block;color:#64748b;font-size:9px}
      section{page-break-inside:avoid}.total{font-size:11px;font-weight:700;margin:4px 0 0}.foot{margin-top:14px;font-size:9px;color:#64748b}
    </style></head><body>${printBrandHeaderHtml(`<h1>${escapeHtml(t("سجلات الإيميلات"))}</h1><p>${escapeHtml(t("إشعارات الخصم بموافقة الموظف"))}</p>`, { company: t("شعار الشركة"), vision: t("رؤية المملكة 2030") })}
      ${body}<p class="foot">${escapeHtml(t("تاريخ الطباعة"))}: <span dir="ltr">${escapeHtml(riyadhToday())}</span> — ${escapeHtml(t("لا يدخل الراتب إلا ما قبله الموظف صراحة"))}</p>
      <script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  if (error) {
    return (
      <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p>{error}</p>
        <button type="button" onClick={refresh} className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold">{t("إعادة المحاولة")}</button>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir={direction}>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {NOTICE_STATUSES.map((item) => (
          <button key={item} type="button" onClick={() => setStatus(status === item ? "" : item)}
            className={`rounded-lg border p-3 text-start ${NOTICE_STATUS_STYLE[item]} ${status === item ? "ring-2 ring-offset-1 ring-[#004e89]" : ""}`}>
            <span className="block text-xs">{t(item)}</span>
            <strong className="text-lg">{formatNumber(counts.get(item) ?? 0)}</strong>
          </button>
        ))}
        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          <span className="block text-xs text-emerald-700">{t("مجموع المقبول")}</span>
          <strong className="text-lg text-emerald-800">{money(acceptedTotal)}</strong> <small className="text-emerald-700">{t("ر.س")}</small>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[280px] flex-[3]">
          <EmployeeFilters value={filters} onChange={setFilters} administrations={org.administrations} sections={org.sections}
            placeholder={t("بحث بالاسم أو الرقم الوظيفي أو رقم الإشعار...")} />
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" aria-label={t("الحالة")}>
          <option value="">{t("كل الحالات")}</option>
          <option value="follow-up">{t("بحاجة لمتابعة")}</option>
          {NOTICE_STATUSES.map((item) => <option key={item} value={item}>{t(item)}</option>)}
        </select>
        <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} aria-label={t("شهر الخصم")} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
        {month && <button type="button" onClick={() => setMonth("")} className="text-xs text-slate-500 hover:text-slate-800">{t("كل الأشهر")}</button>}
        <button type="button" onClick={refresh} title={t("تحديث")} className="rounded-md border border-gray-300 p-2 text-slate-600 hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button type="button" onClick={print} disabled={records.length === 0} className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Printer className="h-4 w-4" />{t("طباعة")}
        </button>
      </div>

      {loading && notices.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />{t("جاري التحميل...")}</div>
      ) : records.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 py-14 text-center text-sm text-slate-500">
          <Mails className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          {notices.length === 0 ? t("لم يُرسل أي إشعار خصم بعد") : t("لا توجد إشعارات مطابقة للفلاتر")}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">{formatNumber(records.length)} {t("موظف")} · {formatNumber(filtered.length)} {t("إشعار")}</p>
          {records.map((record) => {
            const open = expanded.has(record.employeeId);
            const accepted = record.notices.filter((notice) => notice.status === "مقبول").reduce((sum, notice) => sum + notice.amount, 0);
            const followUp = record.notices.filter((notice) => ["انتهت مهلة الرد", "طلب تواصل"].includes(displayStatus(notice, now))).length;
            const own = record.empId === ownEmpId;
            return (
              <div key={record.employeeId} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <button type="button" onClick={() => toggle(record.employeeId)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-start hover:bg-slate-50">
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
                  <span className="min-w-0 flex-1">
                    <strong className="text-slate-900">{record.name}</strong>
                    <small className="ms-2 text-slate-500">#{record.empId}{record.employee?.nationality ? ` · ${t(record.employee.nationality)}` : ""}</small>
                  </span>
                  <span className="text-xs text-slate-600">{formatNumber(record.notices.length)} {t("إشعار")}</span>
                  {followUp > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{formatNumber(followUp)} {t("بحاجة لمتابعة")}</span>}
                  <span className="text-xs font-semibold text-emerald-700">{t("المقبول")}: {money(accepted)} {t("ر.س")}</span>
                </button>
                {open && (
                  <div className="overflow-x-auto border-t border-slate-100">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-start">{t("رقم الإشعار")}</th>
                          <th className="px-3 py-2 text-start">{t("السبب والواقعة")}</th>
                          <th className="px-3 py-2 text-start">{t("المبلغ")}</th>
                          <th className="px-3 py-2 text-start">{t("شهر الخصم")}</th>
                          <th className="px-3 py-2 text-start">{t("الحالة")}</th>
                          <th className="px-3 py-2 text-start">{t("أُرسل")}</th>
                          <th className="px-3 py-2 text-start">{t("الإجراءات")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {record.notices.map((notice) => {
                          const shown = displayStatus(notice, now);
                          const editable = canManage && !own && notice.status !== "أُزيل";
                          return (
                            <tr key={notice.id} className="align-top">
                              <td className="px-3 py-2 font-mono text-xs" dir="ltr">{notice.noticeNo}</td>
                              <td className="max-w-[360px] px-3 py-2">
                                <p className="font-medium text-slate-900">{t(notice.reasonName)}</p>
                                <p className="text-xs text-slate-500">{t(notice.groupName)} · {t("تاريخ الواقعة")} <span dir="ltr">{notice.factDate}</span></p>
                                <p className="mt-1 line-clamp-2 text-xs text-slate-600" title={notice.factDetails}>{notice.factDetails}</p>
                                {notice.removalReason && <p className="mt-1 text-xs text-red-700">{t("سبب الإزالة")}: {notice.removalReason}</p>}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 font-semibold">{money(notice.amount)} <small className="font-normal text-slate-500">{t("ر.س")}</small></td>
                              <td className="px-3 py-2" dir="ltr">{notice.deductMonth}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${NOTICE_STATUS_STYLE[shown]}`}>{t(shown)}</span>
                                {notice.respondedAt && <p className="mt-1 text-[11px] text-slate-500">{dateTime(notice.respondedAt)}</p>}
                                {shown === "انتهت مهلة الرد" && <p className="mt-1 text-[11px] text-amber-700">{t("لم يرد؛ لا يُخصم. تواصل مع الموظف")}</p>}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                                {dateTime(notice.sentAt)}
                                {notice.sentByName && <p className="text-slate-400">{notice.sentByName}</p>}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => setHistory(notice)} title={t("سجل الإشعار")} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><History className="h-4 w-4" /></button>
                                  {editable && <button type="button" onClick={() => setEditing(notice)} title={t("تعديل")} className="rounded p-1.5 text-sky-700 hover:bg-sky-50"><Pencil className="h-4 w-4" /></button>}
                                  {editable && (
                                    <button type="button" onClick={() => setRemoving(notice)} className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
                                      <Trash2 className="h-3.5 w-3.5" />{t("إزالة الخصم")}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && <EditNoticeDialog notice={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {removing && <RemoveNoticeDialog notice={removing} onClose={() => setRemoving(null)} onRemoved={refresh} />}
      {history && <NoticeEventsDialog notice={history} onClose={() => setHistory(null)} />}
    </div>
  );
}
