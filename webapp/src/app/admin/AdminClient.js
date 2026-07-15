"use client";

import { useState } from "react";
import { TH_MONTHS } from "@/lib/constants";
import TimesheetViewer from "./TimesheetViewer";
import BlackoutManager from "./BlackoutManager";
import ImportManager from "./ImportManager";
import TermsManager from "./TermsManager";
import UsersManager from "./UsersManager";
import SectionsManager from "./SectionsManager";

const TABS = [
  ["timesheets", "ภาพรวม Timesheet"],
  ["blackouts", "ช่วงห้ามลงเวลา"],
  ["terms", "ปีการศึกษา"],
  ["users", "ผู้ใช้"],
  ["sections", "วิชา/Section"],
  ["import", "นำเข้า/ลบ/สำรองข้อมูล"],
];

export default function AdminClient() {
  const [tab, setTab] = useState("timesheets");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "btn-primary" : "btn-ghost"} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "timesheets" && <TimesheetViewer />}
      {tab === "blackouts" && <BlackoutManager />}
      {tab === "terms" && <TermsManager />}
      {tab === "users" && <UsersManager />}
      {tab === "sections" && <SectionsManager />}
      {tab === "import" && <ImportManager />}
    </div>
  );
}

export { TH_MONTHS };
