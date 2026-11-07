import { useState, useEffect } from "react";
import { Plus, Trash2, Mail, Settings } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

interface DeductionReason {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

interface GeneratedEmail {
  emp_id: string;
  emp_name: string;
  generated_email: string;
  created_at: string;
}

interface EmailSchedule {
  id: string;
  day_of_month: number;
  description: string;
}

export default function DeductionSettingsPage() {
  const [activeTab, setActiveTab] = useState<"reasons" | "schedule" | "generate">("reasons");
  const [deductions, setDeductions] = useState<DeductionReason[]>([]);
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);
  const [emailSchedules, setEmailSchedules] = useState<EmailSchedule[]>([]);
  const [newDeduction, setNewDeduction] = useState({ name: "", description: "" });
  const [newSchedule, setNewSchedule] = useState({ day: 15, description: "" });
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [saudiEmployees, setSaudiEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // تحميل أسباب الخصومات
  useEffect(() => {
    loadDeductions();
    loadSchedules();
    loadSaudiEmployees();
  }, []);

  const loadDeductions = async () => {
    try {
      const { data, error } = await supabase
        .from("hr_config_items")
        .select("*")
        .eq("config_type", "deduction_reason");
      
      if (!error && data) {
        setDeductions(data.map((d: any) => ({
          id: d.id,
          name: d.name_ar,
          description: d.description,
          created_at: d.created_at
        })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from("hr_config_items")
        .select("*")
        .eq("config_type", "email_schedule");
      
      if (!error && data) {
        setEmailSchedules(data.map((s: any) => ({
          id: s.id,
          day_of_month: s.sort_order || 15,
          description: s.description
        })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadSaudiEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id, emp_id, name, nationality")
        .eq("nationality", "سعودي");
      
      if (!error && data) {
        setSaudiEmployees(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addDeduction = async () => {
    if (!newDeduction.name) {
      toast.error("أدخل اسم السبب");
      return;
    }

    try {
      const { error } = await supabase
        .from("hr_config_items")
        .insert([{
          config_type: "deduction_reason",
          name_ar: newDeduction.name,
          description: newDeduction.description,
          status: "فعال"
        }]);

      if (!error) {
        toast.success("تم إضافة سبب الخصم");
        setNewDeduction({ name: "", description: "" });
        loadDeductions();
      }
    } catch (err) {
      toast.error("حدث خطأ");
    }
  };

  const deleteDeduction = async (id: string) => {
    try {
      await supabase.from("hr_config_items").delete().eq("id", id);
      toast.success("تم الحذف");
      loadDeductions();
    } catch (err) {
      toast.error("حدث خطأ");
    }
  };

  const addSchedule = async () => {
    if (!newSchedule.description) {
      toast.error("أدخل الوصف");
      return;
    }

    try {
      const { error } = await supabase
        .from("hr_config_items")
        .insert([{
          config_type: "email_schedule",
          name_ar: `إرسال في اليوم ${newSchedule.day}`,
          description: newSchedule.description,
          sort_order: newSchedule.day,
          status: "فعال"
        }]);

      if (!error) {
        toast.success("تم إضافة الفترة");
        setNewSchedule({ day: 15, description: "" });
        loadSchedules();
      }
    } catch (err) {
      toast.error("حدث خطأ");
    }
  };

  const generateEmailForEmployee = async () => {
    if (!selectedEmployee) {
      toast.error("اختر موظف");
      return;
    }

    try {
      const emp = saudiEmployees.find(e => e.id === selectedEmployee);
      if (!emp) return;

      const email = `${emp.name.replace(/\s+/g, ".").toLowerCase()}@alayaf.com`;

      // حفظ الإيميل المولد
      const { error } = await supabase
        .from("employee_emails")
        .insert([{
          emp_id: emp.emp_id,
          emp_name: emp.name,
          generated_email: email,
          status: "active"
        }]);

      if (!error) {
        toast.success(`تم توليد الإيميل: ${email}`);
        setSelectedEmployee("");
        loadSaudiEmployees();
      }
    } catch (err) {
      toast.error("حدث خطأ في توليد الإيميل");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
          <Settings className="h-8 w-8 text-blue-400" />
          إعدادات الخصومات والإيميلات
        </h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setActiveTab("reasons")}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition ${
              activeTab === "reasons"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            أسباب الخصومات
          </button>
          <button
            onClick={() => setActiveTab("schedule")}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition ${
              activeTab === "schedule"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            فترات الإرسال
          </button>
          <button
            onClick={() => setActiveTab("generate")}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition ${
              activeTab === "generate"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            توليد الإيميلات
          </button>
        </div>

        {/* Content */}
        <div className="bg-gray-800 rounded-xl p-6 text-white">
          {/* أسباب الخصومات */}
          {activeTab === "reasons" && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4">أسباب الخصومات</h2>
              
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="اسم السبب"
                  value={newDeduction.name}
                  onChange={(e) => setNewDeduction({ ...newDeduction, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white placeholder-gray-400"
                />
                <textarea
                  placeholder="الوصف (اختياري)"
                  value={newDeduction.description}
                  onChange={(e) => setNewDeduction({ ...newDeduction, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white placeholder-gray-400"
                  rows={3}
                />
                <button
                  onClick={addDeduction}
                  className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg font-semibold flex items-center justify-center gap-2"
                >
                  <Plus className="h-5 w-5" />
                  إضافة سبب
                </button>
              </div>

              <div className="space-y-2 mt-6">
                {deductions.map((d) => (
                  <div key={d.id} className="bg-gray-700 p-4 rounded-lg flex justify-between items-start">
                    <div>
                      <p className="font-semibold">{d.name}</p>
                      {d.description && <p className="text-sm text-gray-400 mt-1">{d.description}</p>}
                    </div>
                    <button
                      onClick={() => deleteDeduction(d.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* فترات الإرسال */}
          {activeTab === "schedule" && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4">فترات إرسال الإيميلات</h2>
              
              <div className="space-y-3">
                <input
                  type="number"
                  placeholder="اليوم من الشهر"
                  value={newSchedule.day}
                  onChange={(e) => setNewSchedule({ ...newSchedule, day: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white placeholder-gray-400"
                  min="1"
                  max="28"
                />
                <input
                  type="text"
                  placeholder="الوصف"
                  value={newSchedule.description}
                  onChange={(e) => setNewSchedule({ ...newSchedule, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white placeholder-gray-400"
                />
                <button
                  onClick={addSchedule}
                  className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg font-semibold flex items-center justify-center gap-2"
                >
                  <Plus className="h-5 w-5" />
                  إضافة فترة
                </button>
              </div>

              <div className="space-y-2 mt-6">
                {emailSchedules.map((s) => (
                  <div key={s.id} className="bg-gray-700 p-4 rounded-lg">
                    <p className="font-semibold">اليوم {s.day_of_month}</p>
                    <p className="text-sm text-gray-400">{s.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* توليد الإيميلات */}
          {activeTab === "generate" && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-400" />
                توليد الإيميلات
              </h2>
              
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 rounded-lg text-white"
              >
                <option value="">اختر موظف سعودي</option>
                {saudiEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.emp_id})
                  </option>
                ))}
              </select>

              <button
                onClick={generateEmailForEmployee}
                disabled={!selectedEmployee || isLoading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 py-2 rounded-lg font-semibold flex items-center justify-center gap-2"
              >
                <Mail className="h-5 w-5" />
                توليد إيميل
              </button>

              <div className="space-y-2 mt-6">
                {saudiEmployees
                  .filter(emp => emp.id === selectedEmployee)
                  .map((emp) => (
                    <div key={emp.id} className="bg-gray-700 p-4 rounded-lg">
                      <p className="font-semibold">{emp.name}</p>
                      <p className="text-sm text-green-400 font-mono">
                        {emp.name.replace(/\s+/g, ".").toLowerCase()}@alayaf.com
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
