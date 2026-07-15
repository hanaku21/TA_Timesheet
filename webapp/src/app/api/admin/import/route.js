import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getSupabase } from "@/lib/supabase";
import { getSession, hashPassword } from "@/lib/auth";
import { getActiveTerm } from "@/lib/term";

export const runtime = "nodejs";

const EMP_MAP = {
  "TOR (จ้างเหมา)": "TOR",
  "ทุนป.ตรี": "SCHOLARSHIP",
  "TA/RA": "TA_RA",
};
const CUR_NAMES = {
  ANI: "แอนิเมชันและวิชวลเอฟเฟกต์",
  DF: "ดิจิทัลฟิล์ม",
  DG: "การพัฒนาเกม",
  DII: "บูรณาการอุตสาหกรรมดิจิทัล",
  MMIT: "การจัดการสมัยใหม่และเทคโนโลยีสารสนเทศ",
  "SE (Bachelor)": "วิศวกรรมซอฟต์แวร์",
};
const clean = (s) => (s == null ? "" : String(s).trim());

function parseCsv(text) {
  const clean = text.replace(/^﻿/, "");
  const res = Papa.parse(clean, { header: true, skipEmptyLines: true });
  return res.data || [];
}

export async function POST(req) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "อัปโหลดไฟล์ไม่สำเร็จ" }, { status: 400 });
  }
  const peopleFile = form.get("people");
  const emsFile = form.get("ems");

  if (!peopleFile && !emsFile) {
    return NextResponse.json({ error: "กรุณาอัปโหลดอย่างน้อย 1 ไฟล์" }, { status: 400 });
  }

  const supabase = getSupabase();
  const term = await getActiveTerm(supabase);
  const SEM = term.code;
  const SEM_START = term.start_date || "2026-06-22";
  const SEM_END = term.end_date || "2026-11-03";
  const report = { term: SEM, users_new: 0, users_updated: 0, users_deactivated: 0, courses: 0, sections: 0, assignments: 0, warnings: [] };

  const people = peopleFile ? parseCsv(await peopleFile.text()) : [];
  const ems = emsFile ? parseCsv(await emsFile.text()) : [];

  // ---- TOR number per person name (from EMS) ----
  const torByName = {};
  for (const r of ems) {
    const name = clean(r["ผู้ช่วยสอน"]);
    const tor = clean(r["เลข TOR"]);
    if (name && tor && !torByName[name]) torByName[name] = tor;
  }

  // ---- ensure curricula exist (the standard 6 + any code seen in EMS) ----
  const curCodes = new Set(Object.keys(CUR_NAMES));
  for (const r of ems) {
    const c = clean(r["หลักสูตร"]);
    if (c) curCodes.add(c);
  }
  const curRows = [...curCodes].map((code) => ({ code, name: CUR_NAMES[code] || code }));
  if (curRows.length) {
    await supabase.from("curricula").upsert(curRows, { onConflict: "code" });
  }
  const { data: curList } = await supabase.from("curricula").select("id, code");
  const curId = Object.fromEntries((curList || []).map((c) => [c.code, c.id]));

  // ================= USERS =================
  if (people.length) {
    const seenEmail = new Set();
    const built = [];
    for (const r of people) {
      const name = clean(r["ชื่อ-นามสกุล"]);
      if (!name) continue;
      let email = clean(r["อีเมล"]).toLowerCase();
      const emp = EMP_MAP[clean(r["สถานะการจ้าง"])] || "TA_RA";
      const sid = clean(r["รหัสนักศึกษา"]);
      const tor = torByName[name] || "";
      const phone = clean(r["เบอร์โทร"]);
      // password = phone number, else default "0123456789"
      const pw = phone || "0123456789";
      if (!email) email = `${(sid || name.replace(/\s+/g, "") || "user")}@camt.info`.toLowerCase();
      if (seenEmail.has(email)) continue;
      seenEmail.add(email);
      built.push({
        title: clean(r["คำนำหน้า"]) || null,
        full_name: name,
        employment_type: emp,
        report_status: clean(r["การรายงานตัว"]) || null,
        student_id: sid || null,
        phone: clean(r["เบอร์โทร"]) || null,
        email,
        tor_number: tor || null,
        bank: clean(r["ธนาคาร"]) || null,
        account_no: clean(r["เลขที่บัญชี"]) || null,
        _password: pw,
      });
    }

    // existing emails -> split insert vs update (do NOT overwrite passwords)
    const emails = built.map((b) => b.email);
    const { data: existing } = await supabase
      .from("users")
      .select("email")
      .in("email", emails);
    const existSet = new Set((existing || []).map((e) => e.email));

    const toInsert = [];
    for (const b of built) {
      const { _password, ...rest } = b;
      if (existSet.has(b.email)) {
        // update profile fields only + reactivate (they're in this term's file)
        await supabase
          .from("users")
          .update({ ...rest, active: true })
          .eq("email", b.email);
        report.users_updated++;
      } else {
        const password_hash = await hashPassword(_password);
        toInsert.push({ ...rest, password_hash, role: "user", active: true });
      }
    }
    if (toInsert.length) {
      const { error } = await supabase.from("users").insert(toInsert);
      if (error) report.warnings.push("users: " + error.message);
      else report.users_new = toInsert.length;
    }

    // Users NOT in this term's file -> mark inactive (keep their data). Admins untouched.
    const presentEmails = new Set(built.map((b) => b.email));
    const { data: allUsers } = await supabase.from("users").select("id, email, role");
    const deactivateIds = (allUsers || [])
      .filter((u) => u.role !== "admin" && !presentEmails.has(u.email))
      .map((u) => u.id);
    if (deactivateIds.length) {
      await supabase.from("users").update({ active: false }).in("id", deactivateIds);
    }
    report.users_deactivated = deactivateIds.length;
  }

  // ================= COURSES / SECTIONS / ASSIGNMENTS =================
  if (ems.length) {
    // courses (unique by code)
    const courseMap = {};
    for (const r of ems) {
      const code = clean(r["รหัสวิชา"]);
      if (!code) continue;
      if (!courseMap[code]) {
        courseMap[code] = {
          code,
          name: clean(r["ชื่อวิชา"]),
          curriculum_id: curId[clean(r["หลักสูตร"])] || null,
        };
      }
    }
    const courseRows = Object.values(courseMap);
    if (courseRows.length) {
      const { error } = await supabase.from("courses").upsert(courseRows, { onConflict: "code" });
      if (error) report.warnings.push("courses: " + error.message);
      else report.courses = courseRows.length;
    }
    const { data: courseList } = await supabase.from("courses").select("id, code");
    const courseId = Object.fromEntries((courseList || []).map((c) => [c.code, c.id]));

    // sections (unique by course_id, section, semester)
    const sectionRows = [];
    for (const r of ems) {
      const code = clean(r["รหัสวิชา"]);
      const cid = courseId[code];
      if (!cid) continue;
      let days = [];
      const rawDays = clean(r["วันที่สอน"]);
      try { days = JSON.parse(rawDays || "[]"); } catch { days = rawDays ? [rawDays] : []; }
      const ec = clean(r["ค่าใช้จ่ายคาดการณ์"]);
      sectionRows.push({
        course_id: cid,
        section: clean(r["ตอนที่"]),
        curriculum_id: curId[clean(r["หลักสูตร"])] || null,
        employment_type: EMP_MAP[clean(r["ประเภทการจ้าง"])] || null,
        tor_number: clean(r["เลข TOR"]) || null,
        teaching_type: clean(r["ประเภทการสอน"]) || null,
        teaching_days: days,
        start_time: clean(r["เวลาเริ่ม"]) || null,
        end_time: clean(r["เวลาจบ"]) || null,
        instructor: clean(r["ผู้สอน"]) || null,
        expected_cost: ec ? Number(ec) : null,
        rate: clean(r["อัตราค่าจ้าง/ชม. (จริง)"]) || clean(r["อัตราค่าจ้าง/ชม. (แผน)"]) || null,
        semester: SEM,
      });
    }
    if (sectionRows.length) {
      const { error } = await supabase
        .from("sections")
        .upsert(sectionRows, { onConflict: "course_id,section,semester,teaching_type" });
      if (error) report.warnings.push("sections: " + error.message);
      else report.sections = sectionRows.length;
    }

    // assignments: match TA name -> user, section by (course, section, teaching_type)
    const { data: secList } = await supabase
      .from("sections")
      .select("id, section, course_id, teaching_type, semester")
      .eq("semester", SEM);
    const secKey = {};
    (secList || []).forEach((s) => (secKey[`${s.course_id}|${s.section}|${s.teaching_type || ""}`] = s.id));
    const { data: userList } = await supabase.from("users").select("id, full_name");
    const userByName = {};
    (userList || []).forEach((u) => (userByName[u.full_name] = u.id));

    const assignRows = [];
    const seenSection = new Set(); // enforce one TA per section
    for (const r of ems) {
      const name = clean(r["ผู้ช่วยสอน"]);
      const code = clean(r["รหัสวิชา"]);
      const sec = clean(r["ตอนที่"]);
      const tt = clean(r["ประเภทการสอน"]);
      const uid = userByName[name];
      const sid = secKey[`${courseId[code]}|${sec}|${tt}`];
      if (!uid || !sid) {
        if (name && !uid) report.warnings.push(`ไม่พบผู้ใช้: ${name}`);
        continue;
      }
      if (seenSection.has(sid)) continue; // first TA wins for a section
      seenSection.add(sid);
      assignRows.push({
        user_id: uid,
        section_id: sid,
        start_date: SEM_START,
        end_date: SEM_END,
        semester: SEM,
      });
    }
    if (assignRows.length) {
      const { error } = await supabase
        .from("assignments")
        .upsert(assignRows, { onConflict: "section_id,semester" });
      if (error) report.warnings.push("assignments: " + error.message);
      else report.assignments = assignRows.length;
    }
  }

  // de-duplicate warnings
  report.warnings = [...new Set(report.warnings)].slice(0, 30);
  return NextResponse.json({ ok: true, report });
}
