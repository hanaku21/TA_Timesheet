// Thai baht in words ("3,200.00" -> "สามพันสองร้อยบาทถ้วน")

const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const UNITS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

// Read an integer string (no sign, no separators) in Thai.
function readInt(numStr) {
  const s = String(numStr).replace(/^0+(?=\d)/, "");
  const len = s.length;
  if (len === 0) return "";
  if (len > 6) {
    const head = s.slice(0, len - 6);
    const tail = s.slice(len - 6);
    return readInt(head) + "ล้าน" + (Number(tail) ? readInt(tail) : "");
  }
  let out = "";
  for (let i = 0; i < len; i++) {
    const d = Number(s[i]);
    const pos = len - i - 1;
    if (d === 0) continue;
    if (pos === 0) {
      out += d === 1 && len > 1 ? "เอ็ด" : DIGITS[d];
    } else if (pos === 1) {
      if (d === 1) out += "สิบ";
      else if (d === 2) out += "ยี่สิบ";
      else out += DIGITS[d] + "สิบ";
    } else {
      out += DIGITS[d] + UNITS[pos];
    }
  }
  return out;
}

export function bahtText(amount) {
  const n = Number(amount) || 0;
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const satang = Number(decPart);

  let out = "";
  if (Number(intPart) === 0 && satang === 0) return "ศูนย์บาทถ้วน";

  if (Number(intPart) > 0) out += readInt(intPart) + "บาท";
  if (satang > 0) out += readInt(String(satang)) + "สตางค์";
  else out += "ถ้วน";

  return (neg ? "ลบ" : "") + out;
}
