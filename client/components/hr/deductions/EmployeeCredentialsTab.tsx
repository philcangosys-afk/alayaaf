import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, Loader2, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useI18n } from "@/i18n";
import { isSaudiNationality } from "@/lib/hrStatus";
import { EMPTY_FILTERS, EmployeeFilters, matchesEmployeeFilters, useDeductionOrg, type DeductionEmployee, type EmployeeFilterState } from "./deductionEmployees";

/**
 * توليد البريد الداخلي للموظف وكلمة مروره (دالة الخادم manage-employee-credentials):
 * يُحفظ البريد مربوطًا بملف الموظف، وكلمة المرور مشفّرة، ولا تُعرض كلمات المرور المحفوظة إلا لمدير النظام.
 * التوليد للموظفين السعوديين، كما تشترط دالة الخادم.
 */
type Credential = { id: string; empId: string; empName: string; email: string; password: string; createdAt: string };

const SAUDI = "سعودي";

// رسالة الخطأ من دالة الخادم: من جسم الرد إن وُجد، ومن الاستجابة نفسها إن كانت Response فقط
const functionErrorText = async (data: unknown, error: unknown, fallback: string) => {
  const body = data as { error?: unknown } | null;
  if (body?.error) return String(body.error);
  const context = (error as { context?: unknown } | null)?.context as { clone?: () => Response; json?: () => Promise<unknown> } | undefined;
  if (context && typeof context.json === "function") {
    try {
      const parsed = (typeof context.clone === "function" ? await context.clone().json() : await context.json()) as { error?: unknown } | null;
      if (parsed?.error) return String(parsed.error);
    } catch {
      // الرد ليس JSON
    }
  }
  const message = (error as { message?: string } | null)?.message;
  if (message && /failed to send|failed to fetch|network/i.test(message)) return "تعذر الاتصال بالخادم؛ تحقق من الإنترنت ثم أعد المحاولة";
  return message || fallback;
};

export default function EmployeeCredentialsTab({ onGenerated }: { onGenerated: () => void }) {
  const { t, direction, formatDate, formatNumber } = useI18n();
  const org = useDeductionOrg();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [filters, setFilters] = useState<EmployeeFilterState>({ ...EMPTY_FILTERS, nationality: "saudi" });
  const [mailFilter, setMailFilter] = useState<"" | "with" | "without">("");
  const [generatingId, setGeneratingId] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [lastCredential, setLastCredential] = useState<{ name: string; empId: string; email: string; password: string } | null>(null);

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    setListError("");
    const { data, error } = await supabase.functions.invoke("manage-employee-credentials", { body: { action: "list" } });
    const result = data as { success?: boolean; credentials?: Record<string, unknown>[] } | null;
    if (error || !result?.success) {
      setListError(await functionErrorText(data, error, "تعذر تحميل الإيميلات المحفوظة"));
      setCredentials([]);
    } else {
      setCredentials((result.credentials ?? []).map((row) => ({
        id: String(row.id ?? ""),
        empId: String(row.emp_id ?? "").trim(),
        empName: String(row.emp_name ?? ""),
        email: String(row.generated_email ?? ""),
        password: String(row.generated_password ?? ""),
        createdAt: String(row.created_at ?? ""),
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadCredentials(); }, [loadCredentials]);

  const byEmpId = useMemo(() => new Map(credentials.map((credential) => [credential.empId, credential])), [credentials]);

  const rows = useMemo(() => org.employees
    .filter((employee) => employee.active && matchesEmployeeFilters(employee, filters, org.administrations, org.sections))
    .filter((employee) => {
      const has = byEmpId.has(employee.empId);
      return mailFilter === "with" ? has : mailFilter === "without" ? !has : true;
    }), [byEmpId, filters, mailFilter, org.administrations, org.employees, org.sections]);

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("تم النسخ"));
    } catch {
      toast.error(t("تعذر النسخ؛ انسخه يدويًا"));
    }
  };

  const generate = async (employee: DeductionEmployee) => {
    if (employee.nationality.trim() !== SAUDI) {
      toast.error(t("توليد البريد متاح للموظفين السعوديين فقط"));
      return;
    }
    if (byEmpId.has(employee.empId)
        && !window.confirm(`${employee.name} ${t("لديه بريد محفوظ. إعادة التوليد تغيّر كلمة مرور بريده، ويلزم إبلاغه بالجديدة. متابعة؟")}`)) {
      return;
    }
    setGeneratingId(employee.id);
    const { data, error } = await supabase.functions.invoke("manage-employee-credentials", { body: { action: "generate", employeeId: employee.id } });
    setGeneratingId("");
    const result = data as { success?: boolean; credential?: Record<string, unknown> } | null;
    if (error || !result?.success) {
      toast.error(t(await functionErrorText(data, error, "تعذر توليد بيانات دخول الموظف")));
      return;
    }
    const credential = result.credential ?? {};
    setLastCredential({
      name: String(credential.emp_name ?? employee.name),
      empId: String(credential.emp_id ?? employee.empId),
      email: String(credential.generated_email ?? ""),
      password: String(credential.generated_password ?? ""),
    });
    toast.success(t("تم توليد وحفظ البريد وكلمة المرور وربطهما بالموظف"));
    await loadCredentials();
    onGenerated();
  };

  const toggleReveal = (id: string) => setRevealed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const withMail = org.employees.filter((employee) => employee.active && byEmpId.has(employee.empId)).length;

  return (
    <div className="space-y-4" dir={direction}>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
        <p className="flex items-center gap-2 font-bold text-slate-900"><Mail className="h-4 w-4 text-[#004e89]" />{t("توليد الإيميلات")}</p>
        <p className="text-xs">{t("يُولَّد للموظف بريد داخلي وكلمة مرور ويُربطان بملفه، فيدخل بهما إلى بريده من بوابة الموظف ويستلم فيه إشعارات الخصم ويرد عليها.")}</p>
        <p className="text-xs">{t("التوليد للموظفين السعوديين. كلمة المرور تُحفظ مشفّرة وتظهر لمدير النظام فقط.")}</p>
      </div>

      {lastCredential && (
        <div className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-900">{t("بيانات دخول بريد")} {lastCredential.name} (#{lastCredential.empId})</p>
          <div className="flex items-center gap-2">
            <span className="w-24 text-xs text-emerald-800">{t("البريد")}</span>
            <code dir="ltr" className="flex-1 rounded bg-white px-2 py-1 text-sm">{lastCredential.email}</code>
            <button type="button" onClick={() => void copyText(lastCredential.email)} title={t("نسخ")} className="rounded p-1.5 hover:bg-emerald-100"><Copy className="h-4 w-4" /></button>
          </div>
          {lastCredential.password && (
            <div className="flex items-center gap-2">
              <span className="w-24 text-xs text-emerald-800">{t("كلمة المرور")}</span>
              <code dir="ltr" className="flex-1 rounded bg-white px-2 py-1 text-sm">{lastCredential.password}</code>
              <button type="button" onClick={() => void copyText(lastCredential.password)} title={t("نسخ")} className="rounded p-1.5 hover:bg-emerald-100"><Copy className="h-4 w-4" /></button>
            </div>
          )}
          <p className="text-xs text-emerald-800">{t("سلّمها للموظف ليدخل بريده من البوابة. تظهر كلمة المرور هنا مرة واحدة، وفي القائمة لمدير النظام فقط.")}</p>
          <button type="button" onClick={() => setLastCredential(null)} className="text-xs text-emerald-900 underline">{t("إخفاء")}</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[280px] flex-[3]">
          <EmployeeFilters value={filters} onChange={setFilters} administrations={org.administrations} sections={org.sections} />
        </div>
        <select value={mailFilter} onChange={(event) => setMailFilter(event.target.value as typeof mailFilter)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" aria-label={t("البريد")}>
          <option value="">{t("كل الموظفين")}</option>
          <option value="with">{t("لديهم بريد")}</option>
          <option value="without">{t("بلا بريد")}</option>
        </select>
        <button type="button" onClick={() => void loadCredentials()} title={t("تحديث")} className="rounded-md border border-gray-300 p-2 text-slate-600 hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {listError && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t(listError)}</p>}

      <p className="text-xs text-slate-500">
        {t("الإيميلات المحفوظة")}: {formatNumber(withMail)} · {t("المعروضون")}: {formatNumber(rows.length)}
      </p>

      {org.loading || loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />{t("جاري التحميل...")}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-start">{t("الموظف")}</th>
                <th className="px-3 py-2 text-start">{t("الجنسية")}</th>
                <th className="px-3 py-2 text-start">{t("البريد")}</th>
                <th className="px-3 py-2 text-start">{t("كلمة المرور")}</th>
                <th className="px-3 py-2 text-start">{t("تاريخ التوليد")}</th>
                <th className="px-3 py-2 text-start">{t("الإجراء")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((employee) => {
                const credential = byEmpId.get(employee.empId);
                const saudi = employee.nationality.trim() === SAUDI;
                const shown = credential ? revealed.has(credential.id) : false;
                return (
                  <tr key={employee.id}>
                    <td className="px-3 py-2"><strong className="text-slate-900">{employee.name}</strong> <small className="text-slate-500">#{employee.empId}</small></td>
                    <td className="px-3 py-2 text-xs text-slate-600">{employee.nationality ? t(employee.nationality) : t("غير محدد")}</td>
                    <td className="px-3 py-2">
                      {credential ? (
                        <span className="flex items-center gap-1">
                          <code dir="ltr" className="text-xs text-emerald-800">{credential.email}</code>
                          <button type="button" onClick={() => void copyText(credential.email)} title={t("نسخ")} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Copy className="h-3.5 w-3.5" /></button>
                        </span>
                      ) : <span className="text-xs text-slate-400">{t("لا بريد")}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {credential && credential.password ? (
                        <span className="flex items-center gap-1">
                          <KeyRound className="h-3.5 w-3.5 text-amber-600" />
                          <code dir="ltr" className="text-xs text-amber-800">{shown ? credential.password : "••••••••"}</code>
                          <button type="button" onClick={() => toggleReveal(credential.id)} title={shown ? t("إخفاء") : t("إظهار")} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                            {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          <button type="button" onClick={() => void copyText(credential.password)} title={t("نسخ")} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Copy className="h-3.5 w-3.5" /></button>
                        </span>
                      ) : credential ? <span className="text-xs text-slate-400">{t("كلمة المرور تظهر لمدير النظام فقط")}</span> : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{credential?.createdAt ? formatDate(credential.createdAt, { dateStyle: "medium" }) : "—"}</td>
                    <td className="px-3 py-2">
                      {saudi ? (
                        <button type="button" disabled={Boolean(generatingId)} onClick={() => void generate(employee)}
                          className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${credential ? "border border-gray-300 text-slate-700 hover:bg-slate-50" : "bg-[#004e89] text-white"}`}>
                          {generatingId === employee.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                          {credential ? t("إعادة التوليد") : t("توليد البريد")}
                        </button>
                      ) : isSaudiNationality(employee.nationality)
                        ? <span className="text-xs text-amber-700">{t("الجنسية في الملف ليست «سعودي» تمامًا؛ صحّحها من ملف الموظف ثم ولّد البريد")}</span>
                        : <span className="text-xs text-slate-400">{t("للسعوديين فقط")}</span>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-500">{t("لا يوجد موظفون مطابقون للفلاتر")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
