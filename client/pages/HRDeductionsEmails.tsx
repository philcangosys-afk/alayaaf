import { useEffect, useState } from "react";
import { AlertTriangle, Layers, Loader2, Mail, Mails, Wrench } from "lucide-react";
import Layout from "@/components/Layout";
import { useI18n } from "@/i18n";
import { HR28_MISSING_TEXT, fetchHr28Access } from "@/lib/deductionNotices";
import DeductionGroupsTab from "@/components/hr/deductions/DeductionGroupsTab";
import DeductionRecordsTab from "@/components/hr/deductions/DeductionRecordsTab";
import EmployeeCredentialsTab from "@/components/hr/deductions/EmployeeCredentialsTab";

type TabPage = "groups" | "records" | "credentials";

/**
 * HR-28 «الخصومات والإيميلات»:
 * - أسباب الخصومات: المجموعات العشر وأسبابها، وإرسال إشعار خصم بواقعة موثقة إلى بريد الموظف.
 * - سجلات الإيميلات: سجل كل موظف بإشعاراته وحالاتها، والتعديل وإزالة الخصم بسبب.
 * - توليد الإيميلات: البريد الداخلي للموظف وكلمة مروره.
 * لا يدخل الراتب إلا خصم قبله الموظف صراحة من بريده؛ السكوت ليس قبولًا.
 */
export default function HRDeductionsEmails() {
  const { t, direction } = useI18n();
  const [activePage, setActivePage] = useState<TabPage>("groups");
  const [access, setAccess] = useState<{ canRead: boolean; canManage: boolean; missing: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchHr28Access()
      .then((result) => {
        if (cancelled) return;
        setAccess(result);
        if (!result.canRead || result.missing) setActivePage("credentials");
      })
      .catch(() => { if (!cancelled) setAccess({ canRead: false, canManage: false, missing: false }); });
    return () => { cancelled = true; };
  }, []);

  const tabs: { id: TabPage; label: string; icon: typeof Layers }[] = [
    { id: "groups", label: "أسباب الخصومات", icon: Layers },
    { id: "records", label: "سجلات الإيميلات", icon: Mails },
    { id: "credentials", label: "توليد الإيميلات", icon: Mail },
  ];

  const deductionsBlocked = activePage !== "credentials" && access && (access.missing || !access.canRead);

  return (
    <Layout>
      <div dir={direction} className="space-y-6">
        <div className="mb-2 flex items-center gap-3">
          <div className="rounded-lg bg-orange-100 p-3">
            <Wrench className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t("الخصومات والإيميلات")}</h1>
            <p className="mt-1 text-sm text-gray-600">{t("إشعارات الخصم بموافقة الموظف، وسجلاتها، وتوليد البريد الداخلي للموظفين")}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePage(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-2 px-4 py-4 font-medium transition ${
                    activePage === tab.id ? "border-b-2 border-orange-600 bg-orange-50 text-orange-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t(tab.label)}
                </button>
              );
            })}
          </div>

          <div className="p-6">
            {!access && activePage !== "credentials" ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />{t("جاري التحميل...")}</div>
            ) : deductionsBlocked ? (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{access?.missing ? t(HR28_MISSING_TEXT) : t("إشعارات الخصم وسجلاتها لمدير النظام أو من لديه صلاحية الرواتب")}</p>
              </div>
            ) : activePage === "groups" ? (
              <DeductionGroupsTab canManage={Boolean(access?.canManage)} onSent={() => setReloadKey((key) => key + 1)} />
            ) : activePage === "records" ? (
              <DeductionRecordsTab canManage={Boolean(access?.canManage)} reloadKey={reloadKey} />
            ) : (
              <EmployeeCredentialsTab onGenerated={() => setReloadKey((key) => key + 1)} />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
