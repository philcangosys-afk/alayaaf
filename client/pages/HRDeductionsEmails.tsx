import { useState } from "react";
import { Wrench } from "lucide-react";
import Layout from "@/components/Layout";
import DeductionSettingsPage from "./DeductionSettingsPage";
import EmployeeEmailPage from "./EmployeeEmailPage";

type TabPage = "deductions" | "emails";

export default function HRDeductionsEmails() {
  const [activePage, setActivePage] = useState<TabPage>("deductions");

  return (
    <Layout>
      <div dir="rtl" className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-orange-100 rounded-lg">
            <Wrench className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">أدوات الخصومات والإيميلات</h1>
            <p className="text-sm text-gray-600 mt-1">إدارة الخصومات والبريد الإلكتروني للموظفين</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActivePage("deductions")}
              className={`flex-1 px-6 py-4 font-medium transition ${
                activePage === "deductions"
                  ? "bg-orange-50 text-orange-700 border-b-2 border-orange-600"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              أسباب الخصومات والفترات
            </button>
            <button
              onClick={() => setActivePage("emails")}
              className={`flex-1 px-6 py-4 font-medium transition ${
                activePage === "emails"
                  ? "bg-orange-50 text-orange-700 border-b-2 border-orange-600"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              المراسلات والبريد
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {activePage === "deductions" && <DeductionSettingsPage />}
            {activePage === "emails" && (
              <div className="bg-gray-50 rounded-lg">
                <EmployeeEmailPage onBack={() => {}} />
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
