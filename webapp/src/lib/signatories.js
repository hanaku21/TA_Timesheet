// Signature-footer names/positions for the reimbursement forms
// (แบบใบเบิก TA/RA · จ้างเหมา). Stored in the settings key/value table.
export const SIGN_KEYS = [
  "sign_enabled",
  "sign_head_name",
  "sign_head_position",
  "sign_approver_name",
  "sign_approver_position",
  // F-07 ใบสรุปเบิก (บัณฑิต / ป.ตรี)
  "f07_notice_date_grad",
  "f07_notice_date_ug",
  "f07_notice_date_tor",
  "f07_preparer",
  "f07_certifier",
];

export const F07_DEFAULTS = {
  noticeDateGrad: "19 มิถุนายน 2569",
  noticeDateUg: "19 มิถุนายน 2569",
  noticeDateTor: "",
  preparer: "นางมาลีทิพย์   ปลัดคุณ",
  certifier: "ผู้ช่วยศาสตราจารย์ ดร.รัศมิ์ลภัส สุตีคา",
};

export async function readSignatories(supabase) {
  const { data } = await supabase.from("settings").select("key, value").in("key", SIGN_KEYS);
  const kv = Object.fromEntries((data || []).map((s) => [s.key, s.value]));
  return {
    enabled: kv.sign_enabled === "1",
    head: { name: kv.sign_head_name || "", position: kv.sign_head_position || "" },
    approver: { name: kv.sign_approver_name || "", position: kv.sign_approver_position || "" },
    f07: {
      noticeDateGrad: kv.f07_notice_date_grad ?? F07_DEFAULTS.noticeDateGrad,
      noticeDateUg: kv.f07_notice_date_ug ?? F07_DEFAULTS.noticeDateUg,
      noticeDateTor: kv.f07_notice_date_tor ?? F07_DEFAULTS.noticeDateTor,
      preparer: kv.f07_preparer ?? F07_DEFAULTS.preparer,
      certifier: kv.f07_certifier ?? F07_DEFAULTS.certifier,
    },
  };
}
