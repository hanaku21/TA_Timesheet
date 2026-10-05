import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getActiveTerm } from "@/lib/term";
import { buildTorDocWorkbook, torDigits } from "@/lib/buildTorBillXlsx";
import { buildTorDocPdf } from "@/lib/buildTorBillPdf";

export const runtime = "nodejs";

// GET /api/timesheet/tor-doc?kind=bill|receipt&tor=CAMT/1920[&format=xlsx|pdf][&user_id=][&term=]
// ใบวางบิล / ใบเสร็จรับเงิน for a จ้างเหมา (TOR) TA — one document per เลข TOR.
// Amount = ยอดสั่งจ้างทั้งสัญญา (tor_periods.amount, else Σ expected_cost of that TOR's sections).
export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") === "receipt" ? "receipt" : "bill";
  const format = sp.get("format") === "pdf" ? "pdf" : "xlsx";
  const tor = (sp.get("tor") || "").trim();
  if (!tor) return NextResponse.json({ error: "missing tor" }, { status: 400 });

  let targetUid = session.uid;
  const reqUserId = sp.get("user_id");
  if (reqUserId && String(reqUserId) !== String(session.uid)) {
    if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    targetUid = Number(reqUserId);
  }

  const supabase = getSupabase();
  const { data: user } = await supabase
    .from("users")
    .select("id, title, full_name, employment_type, phone, email, tor_number, address, id_card")
    .eq("id", targetUid)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });
  if (user.employment_type !== "TOR") {
    return NextResponse.json({ error: "เอกสารนี้ใช้สำหรับผู้ช่วยสอนประเภทจ้างเหมา (TOR) เท่านั้น" }, { status: 403 });
  }

  const active = await getActiveTerm(supabase);
  const term = sp.get("term") || active.code;

  // the TA's sections under this TOR (must be assigned to them this term)
  const { data: assigns } = await supabase
    .from("assignments")
    .select("section:sections ( id, section, tor_number, expected_cost, curriculum:curricula ( code ), course:courses ( code, name ) )")
    .eq("user_id", targetUid)
    .eq("semester", term);
  const secs = (assigns || []).map((a) => a.section).filter((s) => s && s.tor_number === tor);
  if (secs.length === 0 && user.tor_number !== tor) {
    return NextResponse.json({ error: "ไม่พบเลข TOR นี้ในรายวิชาที่ได้รับมอบหมาย" }, { status: 404 });
  }

  const { data: tp } = await supabase
    .from("tor_periods").select("amount").eq("tor_number", tor).eq("term", term).maybeSingle();
  const sumExpected = secs.reduce((a, s) => a + Number(s.expected_cost || 0), 0);
  const amount = tp?.amount != null && Number(tp.amount) > 0 ? Number(tp.amount) : sumExpected;

  const subjects = secs
    .map((s) => ({ code: s.course?.code || "", name: s.course?.name || "", section: s.section || "" }))
    .sort((a, b) => a.code.localeCompare(b.code) || a.section.localeCompare(b.section));
  const args = { kind, user, tor, amount, subjects, termCode: term };
  const buffer = format === "pdf" ? await buildTorDocPdf(args) : await buildTorDocWorkbook(args);

  const label = kind === "bill" ? "ใบวางบิล" : "ใบเสร็จรับเงิน";
  const fname = `${label}_${user.title || ""}${user.full_name}_camt_${torDigits(tor)}.${format}`.replace(/[\\/:*?"<>|]+/g, "_");
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`,
      "Content-Length": String(buffer.length),
    },
  });
}
