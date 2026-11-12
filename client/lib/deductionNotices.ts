import { supabase } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/fetchAll";
import { hrRequestErrorText } from "@/lib/hrErrors";

/**
 * HR-28 — إشعارات الخصم بموافقة الموظف.
 * - الإدارة (مدير النظام أو من يدير الرواتب) تختار مجموعة وسببًا وموظفًا، وتكتب الواقعة (تاريخها وتفاصيلها) والمبلغ وشهر الخصم.
 * - يصل الإشعار إلى بريد الموظف الداخلي، ويرد بـ «قبول» أو «التواصل مع الإدارة».
 * - لا يدخل الخصم الراتب إلا بقبول الموظف الصريح: يُسجَّل عندها اقتطاعًا شهريًا في شهره (hr_deductions).
 * - السكوت ليس قبولًا: بعد 24 ساعة بلا رد يظهر للإدارة «انتهت مهلة الرد» لتتابع مع الموظف.
 * كل الكتابة بدوال الخادم (hr28_*)؛ الواجهة تقرأ فقط.
 */

export type DeductionGroup = {
  id: string;
  code: string;
  name: string;
  description: string;
  includes: string[];
  sortOrder: number;
  active: boolean;
};

export type DeductionReason = {
  id: string;
  groupId: string;
  name: string;
  description: string;
  legalBasis: string;
  sortOrder: number;
  active: boolean;
};

export type NoticeStatus = "بانتظار الرد" | "طلب تواصل" | "مقبول" | "أُزيل";
/** الحالة المعروضة: «انتهت مهلة الرد» حالة عرض فقط (بانتظار الرد بعد 24 ساعة)، ولا تعني القبول */
export type NoticeDisplayStatus = NoticeStatus | "انتهت مهلة الرد";

export type DeductionNotice = {
  id: string;
  noticeNo: string;
  employeeId: string;
  empId: string;
  empName: string;
  groupId: string;
  groupName: string;
  reasonId: string;
  reasonName: string;
  factDate: string;
  factDetails: string;
  factRef: string;
  amount: number;
  deductMonth: string;
  status: NoticeStatus;
  toEmail: string;
  sentByName: string;
  sentAt: string;
  replyDueAt: string;
  respondedAt: string;
  acceptedAt: string;
  deductionId: string;
  removedAt: string;
  removedByName: string;
  removalReason: string;
  updatedAt: string;
  updatedByName: string;
};

export type NoticeEvent = {
  id: number;
  noticeId: string;
  event: "send" | "edit" | "accept" | "contact" | "remove";
  actorName: string;
  happenedAt: string;
  details: Record<string, unknown>;
};

export type SendItem = {
  employee_id: string;
  reason_id: string;
  fact_date: string;
  fact_details: string;
  fact_ref?: string;
  amount: number;
  deduct_month: string;
};

export const NOTICE_STATUSES: NoticeDisplayStatus[] = ["بانتظار الرد", "انتهت مهلة الرد", "طلب تواصل", "مقبول", "أُزيل"];

export const NOTICE_STATUS_STYLE: Record<NoticeDisplayStatus, string> = {
  "بانتظار الرد": "bg-sky-50 text-sky-700 border-sky-200",
  "انتهت مهلة الرد": "bg-amber-50 text-amber-800 border-amber-300",
  "طلب تواصل": "bg-violet-50 text-violet-700 border-violet-200",
  "مقبول": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "أُزيل": "bg-slate-100 text-slate-600 border-slate-200",
};

export const EVENT_LABELS: Record<NoticeEvent["event"], string> = {
  send: "إرسال الإشعار",
  edit: "تعديل من الإدارة",
  accept: "قبول الموظف",
  contact: "طلب التواصل مع الإدارة",
  remove: "إزالة الخصم",
};

const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => Number(value) || 0;

export const displayStatus = (notice: Pick<DeductionNotice, "status" | "replyDueAt">, now = Date.now()): NoticeDisplayStatus =>
  notice.status === "بانتظار الرد" && notice.replyDueAt && new Date(notice.replyDueAt).getTime() < now ? "انتهت مهلة الرد" : notice.status;

export const isOpenNotice = (notice: Pick<DeductionNotice, "status">) => notice.status === "بانتظار الرد" || notice.status === "طلب تواصل";

export const mapNotice = (row: Record<string, unknown>): DeductionNotice => ({
  id: text(row.id),
  noticeNo: text(row.notice_no),
  employeeId: text(row.employee_id),
  empId: text(row.emp_id),
  empName: text(row.emp_name),
  groupId: text(row.group_id),
  groupName: text(row.group_name),
  reasonId: text(row.reason_id),
  reasonName: text(row.reason_name),
  factDate: text(row.fact_date).slice(0, 10),
  factDetails: text(row.fact_details),
  factRef: text(row.fact_ref),
  amount: num(row.amount),
  deductMonth: text(row.deduct_month),
  status: (text(row.status) || "بانتظار الرد") as NoticeStatus,
  toEmail: text(row.to_email),
  sentByName: text(row.sent_by_name),
  sentAt: text(row.sent_at),
  replyDueAt: text(row.reply_due_at),
  respondedAt: text(row.responded_at),
  acceptedAt: text(row.accepted_at),
  deductionId: text(row.deduction_id),
  removedAt: text(row.removed_at),
  removedByName: text(row.removed_by_name),
  removalReason: text(row.removal_reason),
  updatedAt: text(row.updated_at),
  updatedByName: text(row.updated_by_name),
});

/** قبل تطبيق D2: الجدول أو الدالة غير موجودة فقط (لا أخطاء التكرار أو القيود أو الصلاحيات) */
export const isHr28Missing = (error: unknown) => {
  const err = error as { code?: string; message?: string } | null;
  const code = String(err?.code ?? "");
  const message = String(err?.message ?? "");
  if (code === "42P01" || code === "PGRST205" || code === "PGRST202") return true;
  return code === "42883" && /hr28_/.test(message);
};

export const HR28_MISSING_TEXT = "إشعارات الخصم تتطلب تحديث قاعدة البيانات (HR-28)";

/** رسالة الخطأ، ومعها رقم البند عند الإرسال الجماعي */
export const deductionErrorText = (error: unknown, fallback: string, lines?: string[]) => {
  if (isHr28Missing(error)) return HR28_MISSING_TEXT;
  const base = hrRequestErrorText(error, fallback);
  const detail = Number((error as { details?: unknown } | null)?.details);
  if (lines && Number.isInteger(detail) && detail >= 1 && detail <= lines.length) return `${lines[detail - 1]}: ${base}`;
  return base;
};

export async function loadGroupsAndReasons(): Promise<{ groups: DeductionGroup[]; reasons: DeductionReason[] }> {
  const [groupResult, reasonResult] = await Promise.all([
    supabase.from("hr_deduction_groups").select("*").order("sort_order").order("code"),
    supabase.from("hr_deduction_reasons").select("*").order("sort_order").order("name_ar"),
  ]);
  if (groupResult.error) throw groupResult.error;
  if (reasonResult.error) throw reasonResult.error;
  return {
    groups: (groupResult.data ?? []).map((row: Record<string, unknown>) => ({
      id: text(row.id),
      code: text(row.code),
      name: text(row.name_ar),
      description: text(row.description),
      includes: Array.isArray(row.includes) ? (row.includes as unknown[]).map(text).filter(Boolean) : [],
      sortOrder: num(row.sort_order),
      active: text(row.status) !== "غير فعال",
    })),
    reasons: (reasonResult.data ?? []).map((row: Record<string, unknown>) => ({
      id: text(row.id),
      groupId: text(row.group_id),
      name: text(row.name_ar),
      description: text(row.description),
      legalBasis: text(row.legal_basis),
      sortOrder: num(row.sort_order),
      active: text(row.status) !== "غير فعال",
    })),
  };
}

/** الأسباب المتاحة لمجموعة: أسبابها، ثم أسباب المجموعات التي تضمها (نمطا التسوية الشهرية) */
export const reasonsForGroup = (group: DeductionGroup, groups: DeductionGroup[], reasons: DeductionReason[]) => {
  const ids = [group.id, ...group.includes.map((code) => groups.find((item) => item.code === code && item.active)?.id ?? "").filter(Boolean)];
  return ids.flatMap((id) => reasons.filter((reason) => reason.groupId === id && reason.active));
};

export async function loadNotices(filter?: { employeeId?: string; month?: string }): Promise<DeductionNotice[]> {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let query = supabase.from("hr_deduction_notices").select("*");
    if (filter?.employeeId) query = query.eq("employee_id", filter.employeeId);
    if (filter?.month) query = query.eq("deduct_month", filter.month);
    return query.order("sent_at", { ascending: false }).order("id").range(from, to);
  });
  return rows.map(mapNotice);
}

export async function loadNoticeEvents(noticeId: string): Promise<NoticeEvent[]> {
  const { data, error } = await supabase
    .from("hr_deduction_notice_events")
    .select("*")
    .eq("notice_id", noticeId)
    .order("happened_at")
    .order("id");
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: num(row.id),
    noticeId: text(row.notice_id),
    event: text(row.event) as NoticeEvent["event"],
    actorName: text(row.actor_name),
    happenedAt: text(row.happened_at),
    details: (row.details && typeof row.details === "object" ? row.details : {}) as Record<string, unknown>,
  }));
}

export async function sendNotices(items: SendItem[]): Promise<number> {
  const { data, error } = await supabase.rpc("hr28_send_deduction_notices", { p_items: items });
  if (error) throw error;
  return num((data as { sent?: unknown } | null)?.sent);
}

export async function updateNotice(id: string, changes: Record<string, unknown>) {
  const { error } = await supabase.rpc("hr28_update_deduction_notice", { p_id: id, p_changes: changes });
  if (error) throw error;
}

export async function removeNotice(id: string, reason: string) {
  const { error } = await supabase.rpc("hr28_remove_deduction_notice", { p_id: id, p_reason: reason });
  if (error) throw error;
}

/** نسخة الإشعار التي رآها الموظف: القبول يُرفض في الخادم إن عدّلت الإدارة الإشعار بعدها */
export const noticeTerms = (notice: Pick<DeductionNotice, "amount" | "deductMonth" | "updatedAt" | "sentAt">) => ({
  amount: notice.amount,
  deduct_month: notice.deductMonth,
  version: notice.updatedAt || notice.sentAt,
});

export async function respondNotice(id: string, action: "accept" | "contact", expected?: ReturnType<typeof noticeTerms>) {
  const { error } = await supabase.rpc("hr28_respond_deduction_notice", { p_id: id, p_action: action, p_expected: expected ?? null });
  if (error) throw error;
}

/** هل للمستخدم إدارة الإشعارات (مدير النظام أو إدارة الرواتب)؟ من الخادم نفسه */
export async function fetchCanManageNotices(): Promise<boolean> {
  const { data, error } = await supabase.rpc("hr28_can_manage");
  return !error && data === true;
}

/** صلاحيات الصفحة من الخادم: القراءة (مدير النظام أو الرواتب) والإدارة، ووجود تحديث قاعدة البيانات */
export async function fetchHr28Access(): Promise<{ canRead: boolean; canManage: boolean; missing: boolean }> {
  const [readResult, manageResult] = await Promise.all([supabase.rpc("hr28_can_read"), supabase.rpc("hr28_can_manage")]);
  const missing = isHr28Missing(readResult.error) || isHr28Missing(manageResult.error);
  return { canRead: !readResult.error && readResult.data === true, canManage: !manageResult.error && manageResult.data === true, missing };
}

/** إشعارات بعينها (بريد الموظف: إشعارات رسائله فقط) */
export async function loadNoticesByIds(ids: string[]): Promise<DeductionNotice[]> {
  const unique = [...new Set(ids.map(text).filter(Boolean))];
  const result: DeductionNotice[] = [];
  for (let index = 0; index < unique.length; index += 100) {
    const { data, error } = await supabase.from("hr_deduction_notices").select("*").in("id", unique.slice(index, index + 100));
    if (error) throw error;
    result.push(...(data ?? []).map((row: Record<string, unknown>) => mapNotice(row)));
  }
  return result;
}

/** من له بريد داخلي مولَّد: معرّف الموظف ← عنوان البريد */
export async function loadMailboxEmployees(): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc("hr28_mailbox_employees");
  if (error) throw error;
  return new Map(((data ?? []) as Record<string, unknown>[]).map((row) => [text(row.employee_id), text(row.generated_email)]));
}

export type ReasonInput = { groupId: string; name: string; legalBasis: string; description: string; sortOrder: number; active: boolean };

/** إضافة سبب أو تعديله (RLS: مدير النظام أو إدارة الرواتب) */
export async function saveReason(id: string | null, input: ReasonInput) {
  const payload = {
    group_id: input.groupId,
    name_ar: input.name.trim(),
    legal_basis: input.legalBasis.trim() || null,
    description: input.description.trim() || null,
    sort_order: Math.round(input.sortOrder) || 100,
    status: input.active ? "فعال" : "غير فعال",
  };
  const query = id
    ? supabase.from("hr_deduction_reasons").update(payload).eq("id", id).select("id")
    : supabase.from("hr_deduction_reasons").insert(payload).select("id");
  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) throw { code: "42501", message: "HR28_NOT_ALLOWED" };
}

/** تفعيل مجموعة أو إيقافها */
export async function setGroupActive(id: string, active: boolean) {
  const { data, error } = await supabase.from("hr_deduction_groups").update({ status: active ? "فعال" : "غير فعال" }).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw { code: "42501", message: "HR28_NOT_ALLOWED" };
}

/** عناوين رسائل HR-28 المخزنة بالعربية، بلغة الواجهة (الرقم يبقى كما هو) */
const SUBJECT_PREFIXES = [
  "تعديل لصالحك على الخصم ",
  "تعديل إشعار الخصم ",
  "طلب تواصل بشأن إشعار الخصم ",
  "قبول إشعار الخصم ",
  "إزالة الخصم ",
  "إشعار خصم ",
];
export const localizeNoticeSubject = (subject: string, t: (source: string) => string) => {
  const prefix = SUBJECT_PREFIXES.find((item) => subject.startsWith(item));
  if (!prefix) return subject;
  const rest = subject.slice(prefix.length);
  const [number, ...reason] = rest.split(" — ");
  return `${t(prefix.trim())} ${number}${reason.length ? ` — ${t(reason.join(" — "))}` : ""}`;
};

/** شهر بعد (أو قبل) عدد من الأشهر بصيغة YYYY-MM */
export const addMonths = (month: string, count: number) => {
  const [year, value] = month.split("-").map(Number);
  if (!year || !value) return month;
  const index = year * 12 + (value - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};

/** مدى شهر الخصم المقبول في الخادم: من الشهر الماضي حتى 12 شهرًا قادمًا */
export const deductMonthRange = (current: string) => ({ min: addMonths(current, -1), max: addMonths(current, 12) });

/** الشهر التالي بصيغة YYYY-MM */
export const nextMonth = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  if (!year || !value) return month;
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, "0")}`;
};
