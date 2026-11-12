import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/fetchAll";
import { isEmployeeActive } from "@/lib/employeeStatus";
import { isSaudiNationality } from "@/lib/hrStatus";
import { useI18n } from "@/i18n";

/** موظف للاختيار والفلترة في صفحة الخصومات والإيميلات (HR-28) */
export type DeductionEmployee = {
  id: string;
  empId: string;
  name: string;
  nationality: string;
  active: boolean;
  /** الإدارة (departments) والقسم (org_sections)، بالمعرّف أو بالنص القديم في الملف */
  administrationId: string;
  administrationText: string;
  sectionId: string;
  sectionText: string;
};

export type OrgOption = { id: string; name: string; nameEn: string };

export type EmployeeFilterState = { search: string; nationality: string; administration: string; section: string };

export const EMPTY_FILTERS: EmployeeFilterState = { search: "", nationality: "", administration: "", section: "" };

const text = (value: unknown) => String(value ?? "").trim();

/** الموظفون والإدارات والأقسام (كل الموظفين على دفعات) */
export function useDeductionOrg(reloadKey = 0) {
  const [employees, setEmployees] = useState<DeductionEmployee[]>([]);
  const [administrations, setAdministrations] = useState<OrgOption[]>([]);
  const [sections, setSections] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [rows, departmentResult, sectionResult] = await Promise.all([
          fetchAllRows<Record<string, unknown>>((from, to) => supabase.from("employees").select("id, emp_id, name, nationality, status, department_id, directorate, division, section_id, department").order("emp_id").order("id").range(from, to)),
          supabase.from("departments").select("id, name, name_en").order("name"),
          supabase.from("org_sections").select("id, name, name_en").order("name"),
        ]);
        if (cancelled) return;
        setEmployees(rows.map((row) => ({
          id: text(row.id),
          empId: text(row.emp_id),
          name: text(row.name),
          nationality: text(row.nationality),
          active: isEmployeeActive(row.status),
          administrationId: text(row.department_id),
          administrationText: text(row.directorate ?? row.division),
          sectionId: text(row.section_id),
          sectionText: text(row.department),
        })));
        const option = (row: Record<string, unknown>) => ({ id: text(row.id), name: text(row.name), nameEn: text(row.name_en) });
        setAdministrations(departmentResult.error ? [] : (departmentResult.data ?? []).map(option));
        setSections(sectionResult.error ? [] : (sectionResult.data ?? []).map(option));
      } catch (loadError) {
        if (!cancelled) setError(loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  return { employees, administrations, sections, loading, error };
}

export const matchesEmployeeFilters = (
  employee: DeductionEmployee | undefined,
  filters: EmployeeFilterState,
  administrations: OrgOption[],
  sections: OrgOption[],
  extraSearch: string[] = [],
) => {
  if (!employee) return !filters.nationality && !filters.administration && !filters.section && !filters.search.trim();
  const keyword = filters.search.trim().toLowerCase();
  if (keyword && ![employee.name, employee.empId, ...extraSearch].some((value) => value.toLowerCase().includes(keyword))) return false;
  if (filters.nationality === "saudi" && !isSaudiNationality(employee.nationality)) return false;
  if (filters.nationality === "non-saudi" && (isSaudiNationality(employee.nationality) || !employee.nationality)) return false;
  if (filters.administration) {
    const selected = administrations.find((item) => item.id === filters.administration);
    if (employee.administrationId !== filters.administration && employee.administrationText !== selected?.name) return false;
  }
  if (filters.section) {
    const selected = sections.find((item) => item.id === filters.section);
    if (employee.sectionId !== filters.section && employee.sectionText !== selected?.name) return false;
  }
  return true;
};

/** فلاتر البحث والجنسية والإدارة والقسم */
export function EmployeeFilters({
  value,
  onChange,
  administrations,
  sections,
  placeholder,
}: {
  value: EmployeeFilterState;
  onChange: (next: EmployeeFilterState) => void;
  administrations: OrgOption[];
  sections: OrgOption[];
  placeholder?: string;
}) {
  const { t, locale } = useI18n();
  const label = (item: OrgOption) => (locale === "en" && item.nameEn ? item.nameEn : t(item.name));
  const field = "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={value.search}
          onChange={(event) => onChange({ ...value, search: event.target.value })}
          placeholder={placeholder ?? t("بحث بالاسم أو الرقم الوظيفي...")}
          className={`${field} w-full ps-9`}
        />
      </div>
      <select value={value.nationality} onChange={(event) => onChange({ ...value, nationality: event.target.value })} className={field} aria-label={t("الجنسية")}>
        <option value="">{t("كل الجنسيات")}</option>
        <option value="saudi">{t("سعودي")}</option>
        <option value="non-saudi">{t("غير سعودي")}</option>
      </select>
      <select value={value.administration} onChange={(event) => onChange({ ...value, administration: event.target.value })} className={field} aria-label={t("الإدارة")}>
        <option value="">{t("كل الإدارات")}</option>
        {administrations.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}
      </select>
      <select value={value.section} onChange={(event) => onChange({ ...value, section: event.target.value })} className={field} aria-label={t("القسم")}>
        <option value="">{t("كل الأقسام")}</option>
        {sections.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}
      </select>
    </div>
  );
}
