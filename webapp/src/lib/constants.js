export const EMP_LABELS = {
  TOR: "TOR (จ้างเหมา)",
  SCHOLARSHIP: "ทุน ป.ตรี",
  TA_RA: "TA / RA",
};

export const EMP_BADGE = {
  TOR: "bg-amber-100 text-amber-700",
  SCHOLARSHIP: "bg-emerald-100 text-emerald-700",
  TA_RA: "bg-sky-100 text-sky-700",
};

export function ymd(d) {
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${m}-${day}`;
}

export const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
