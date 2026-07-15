// "Work time sheet TA Student (CMU Rate)" — layout logic for ทุน ป.ตรี (SCHOLARSHIP).
//
// Each work day's hours (already capped at 8/day and carried over by
// computeDisplayRows) are laid out into fixed teaching blocks, filled in order:
//
//   Pre Teaching      2 hr   (08:00–10:00)
//   Support Teaching  2 hr   (10:00–12:00)
//   Post Teaching     4 hr   (13:00–17:00)
//
// A block is only used if the remaining hours cover it in full. Whatever is left
// over after the blocks that fit is emitted as a single "Overtime Teaching" row.
// Times run sequentially from 08:00, skipping the 12:00–13:00 lunch break.

const EPS = 1e-6;
const round2 = (n) => Math.round(n * 100) / 100;

export const BLOCKS = [
  { label: "Pre Teaching", size: 2 },
  { label: "Support Teaching", size: 2 },
  { label: "Post Teaching", size: 4 },
];

const LUNCH_START = 12 * 60; // 12:00
const LUNCH_END = 13 * 60; // 13:00
const DAY_START = 8 * 60; // 08:00

// minutes -> "8:00" / "13:00" (no leading zero on the hour, as in the form)
export function fmtTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

// "2025-12-01" -> "01/12/2568"  (DD/MM/YYYY, full Buddhist year)
export function fmtDateBE(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const be = y + 543;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${be}`;
}

// Push the cursor past lunch if the block would start in, or run through, the break.
function avoidLunch(cursor, hours) {
  const dur = hours * 60;
  if (cursor >= LUNCH_START && cursor < LUNCH_END) return LUNCH_END;
  if (cursor < LUNCH_START && cursor + dur > LUNCH_START + EPS) return LUNCH_END;
  return cursor;
}

// Split one day's total hours into rows.
//   - A FULL day (>= 8 hr) uses the fixed blocks: Pre 2, Support 2, Post 4
//     (any hours beyond 8 become a trailing Overtime row).
//   - A PARTIAL day (< 8 hr) is entirely "Overtime Teaching", laid across the
//     lunch break: up to 4 hr in the morning (08:00–12:00), the rest in the
//     afternoon (from 13:00).
export function splitDayIntoBlocks(totalHours) {
  const rem = round2(totalHours);
  const FULL = BLOCKS.reduce((a, b) => a + b.size, 0); // 8

  if (rem >= FULL - EPS) {
    const out = BLOCKS.map((b) => ({ label: b.label, hours: b.size }));
    const extra = round2(rem - FULL);
    if (extra > EPS) out.push({ label: "Overtime Teaching", hours: extra });
    return out;
  }

  // partial day -> all Overtime, morning chunk (<=4h) then afternoon chunk
  const out = [];
  const morning = round2(Math.min(rem, 4));
  if (morning > EPS) out.push({ label: "Overtime Teaching", hours: morning });
  const afternoon = round2(rem - morning);
  if (afternoon > EPS) out.push({ label: "Overtime Teaching", hours: afternoon });
  return out;
}

// Build the printable rows of the work time sheet.
// displayRows: [{ section, work_date, hours, ... }] (already redistributed)
// -> [{ work_date, dateLabel, timeIn, timeOut, hours, courseKey, detail, section }]
export function computeWorkTimeRows(displayRows) {
  // group by date, preserving section order within the day
  const byDate = new Map();
  for (const r of displayRows || []) {
    if (!byDate.has(r.work_date)) byDate.set(r.work_date, []);
    byDate.get(r.work_date).push(r);
  }

  const out = [];
  const dates = [...byDate.keys()].sort();

  for (const date of dates) {
    const entries = byDate.get(date);
    const total = round2(entries.reduce((a, e) => a + Number(e.hours || 0), 0));
    if (total <= EPS) continue;

    const blocks = splitDayIntoBlocks(total);

    // Walk the day's entries so each block row is attributed to the right course.
    let ei = 0;
    let entryLeft = round2(Number(entries[0]?.hours || 0));
    let cursor = DAY_START;

    for (const b of blocks) {
      let blockLeft = b.hours;
      while (blockLeft > EPS) {
        while (ei < entries.length && entryLeft <= EPS) {
          ei += 1;
          entryLeft = ei < entries.length ? round2(Number(entries[ei]?.hours || 0)) : 0;
        }
        const sec = (entries[ei] || entries[entries.length - 1]).section || {};
        const take = round2(Math.min(blockLeft, entryLeft > EPS ? entryLeft : blockLeft));

        cursor = avoidLunch(cursor, take);
        const start = cursor;
        const end = start + take * 60;

        out.push({
          work_date: date,
          dateLabel: fmtDateBE(date),
          timeIn: fmtTime(start),
          timeOut: fmtTime(end),
          hours: take,
          courseKey: `${sec.course?.code || ""} (${sec.section || ""})`,
          detail: b.label,
          section: sec,
        });

        cursor = end;
        blockLeft = round2(blockLeft - take);
        entryLeft = round2(entryLeft - take);
      }
    }
  }
  return out;
}
