// Lightweight i18n for the user-facing (TA) pages.
// Locale is derived from the user's name: if it contains any Latin letters → English.

export function localeFromName(name) {
  return /[A-Za-z]/.test(name || "") ? "en" : "th";
}

export const MONTHS = {
  th: ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"],
  en: ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"],
};

export const WEEKDAYS = {
  th: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"],
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
};

// month + year label (Thai uses Buddhist year, English uses Gregorian)
export function monthLabel(locale, yy, mm) {
  return locale === "en" ? `${MONTHS.en[mm - 1]} ${yy}` : `${MONTHS.th[mm - 1]} ${yy + 543}`;
}

const T = {
  // NavBar
  appName: { th: "CAMT TA Timesheet", en: "CAMT TA Timesheet" },
  roleAdmin: { th: "ผู้ดูแลระบบ", en: "Administrator" },
  roleTA: { th: "ผู้ช่วยสอน", en: "Teaching Assistant" },
  navOverview: { th: "ภาพรวม", en: "Overview" },
  navLog: { th: "บันทึกเวลา", en: "Log Time" },
  logout: { th: "ออกจากระบบ", en: "Sign out" },

  // Overview
  myClaims: { th: "รายการเบิกของฉัน", en: "My Reimbursements" },
  overviewSub: { th: "สรุปรายวิชา/section แยกตามเดือน พร้อมดาวน์โหลดใบเบิก", en: "Per-course/section summary by month, with downloadable forms" },
  logTime: { th: "＋ บันทึกเวลาทำงาน", en: "＋ Log Working Time" },
  monthTotal: { th: "รวมทั้งเดือน:", en: "Month total:" },
  baht: { th: "บาท", en: "THB" },
  items: { th: "รายการ", en: "items" },
  downloadAllZip: { th: "⬇ ดาวน์โหลดทั้งหมด (.zip)", en: "⬇ Download all (.zip)" },
  colCourse: { th: "วิชา", en: "Course" },
  colSection: { th: "ตอน", en: "Section" },
  colType: { th: "Type", en: "Type" },
  colTor: { th: "เลข TOR", en: "TOR No." },
  colMonth: { th: "เดือนที่เบิก", en: "Month" },
  colDays: { th: "วัน", en: "Days" },
  colHours: { th: "ชั่วโมง", en: "Hours" },
  colAmount: { th: "ยอดเงิน (บาท)", en: "Amount (THB)" },
  colDownload: { th: "ดาวน์โหลด", en: "Download" },
  colLog: { th: "บันทึกเวลา", en: "Log" },
  logEntry: { th: "บันทึกข้อมูล", en: "Log time" },
  noCourses: { th: "ยังไม่มีวิชาที่ได้รับมอบหมาย", en: "No assigned courses yet" },
  loading: { th: "กำลังโหลด...", en: "Loading..." },

  // Log page
  logTitle: { th: "บันทึกเวลาทำงาน", en: "Log Working Time" },
  backOverview: { th: "← กลับหน้าภาพรวม", en: "← Back to Overview" },
  courseSection: { th: "รายวิชา / Section", en: "Course / Section" },
  noAssigned: { th: "— ยังไม่มีรายวิชาที่ได้รับมอบหมาย —", en: "— No assigned courses —" },
  moduleTag: { th: "กรอกชั่วโมงเอง", en: "Enter hours manually" },
  time: { th: "เวลา", en: "Time" },
  hoursPerDay: { th: "ชั่วโมง/วัน", en: "hrs/day" },
  rate: { th: "อัตรา", en: "Rate" },
  bahtPerHr: { th: "บาท/ชม.", en: "THB/hr" },
  asMoney: { th: "คิดเป็น", en: "=" },
  bahtPerDay: { th: "บาท/วัน", en: "THB/day" },
  used: { th: "ใช้ไป", en: "Used" },
  budget: { th: "งบ", en: "Budget" },
  remaining: { th: "คงเหลือ", en: "Remaining" },
  hrsShort: { th: "ชม.", en: "hrs" },
  noBudgetSet: { th: "ไม่ได้กำหนดค่าใช้จ่ายคาดการณ์สำหรับ section นี้", en: "No expected cost set for this section" },
  legendSelected: { th: "เลือกไว้", en: "Selected" },
  legendSaved: { th: "บันทึกแล้ว", en: "Saved" },
  legendBlackout: { th: "ห้ามลงเวลา", en: "Blackout" },
  legendOut: { th: "นอกภาคเรียน", en: "Out of term" },
  selectedDates: { th: "วันที่เลือก + หมายเหตุ", en: "Selected dates + notes" },
  days: { th: "วัน", en: "days" },
  totalPrefix: { th: "รวม", en: "Total" },
  pickHint: { th: "คลิกเลือกวันในปฏิทินด้านซ้าย แล้วกรอกข้อมูลของแต่ละวันได้ที่นี่", en: "Click dates on the calendar, then fill in each day here" },
  hoursLabel: { th: "จำนวนชั่วโมง *", en: "Hours *" },
  hoursPlaceholder: { th: "กรอกจำนวนชั่วโมง", en: "Enter hours" },
  remarkLabel: { th: "หมายเหตุ (ไม่บังคับ)", en: "Note (optional)" },
  remarkPlaceholder: { th: "เช่น สอนชดเชย", en: "e.g. makeup class" },
  save: { th: "บันทึก", en: "Save" },
  edit: { th: "แก้ไข", en: "Edit" },
  cancel: { th: "ยกเลิก", en: "Cancel" },
  delete: { th: "ลบ", en: "Delete" },
  thisMonthList: { th: "รายการเดือนนี้", en: "This month" },
  noEntries: { th: "ยังไม่มีการลงเวลาในเดือนนี้", en: "No entries this month" },
  savedOk: { th: "บันทึกวันที่ {date} เรียบร้อย", en: "Saved {date}" },
  savedAll: { th: "บันทึก {n} วันเรียบร้อย", en: "Saved {n} day(s)" },
  needHours: { th: "กรุณากรอกจำนวนชั่วโมง (มากกว่า 0) ของวันที่ {date}", en: "Please enter hours (> 0) for {date}" },
  hoursPositive: { th: "จำนวนชั่วโมงต้องมากกว่า 0", en: "Hours must be greater than 0" },
  maxMoreDays: { th: "เลือกได้อีกไม่เกิน {n} วัน (จำกัดด้วยค่าใช้จ่ายคาดการณ์)", en: "You can select up to {n} more day(s) (budget limit)" },
};

export function makeT(locale) {
  const loc = locale === "en" ? "en" : "th";
  return (key, vars) => {
    let s = (T[key] && (T[key][loc] ?? T[key].th)) ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  };
}
