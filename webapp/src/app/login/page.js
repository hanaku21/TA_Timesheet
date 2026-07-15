"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "เข้าสู่ระบบไม่สำเร็จ");
      router.push(data.role === "admin" ? "/admin" : "/dashboard");
      router.refresh();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">
            CT
          </div>
          <h1 className="text-2xl font-bold text-slate-800">CAMT TA Timesheet</h1>
          <p className="text-sm text-slate-500">ระบบบันทึกเวลาทำงานผู้ช่วยสอน</p>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@cmu.ac.th"
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="เบอร์โทรศัพท์"
              required
            />
            <p className="mt-1 text-xs text-slate-400">
              รหัสผ่านเริ่มต้นคือ เบอร์โทรศัพท์ (ถ้าไม่มีเบอร์คือ 0123456789)
            </p>
          </div>

          {err && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {err}
            </div>
          )}

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>

          <p className="text-center text-xs text-slate-400">
            หากเข้าสู่ระบบไม่ได้ กรุณาติดต่อผู้ดูแลระบบ
          </p>
        </form>
      </div>
    </div>
  );
}
