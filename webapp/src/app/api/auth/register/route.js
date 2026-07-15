import { NextResponse } from "next/server";

// Self-registration is disabled. User accounts are created by an admin via
// the data import page (/admin -> นำเข้าข้อมูล).
export async function POST() {
  return NextResponse.json(
    { error: "ปิดการลงทะเบียนเอง บัญชีผู้ใช้สร้างโดยผู้ดูแลผ่านการนำเข้าข้อมูล" },
    { status: 403 }
  );
}
