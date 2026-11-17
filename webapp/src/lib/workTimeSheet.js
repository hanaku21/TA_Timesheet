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

// Split one day's total hours into rows by filling the blocks in order —
// Pre (up to 2), Support (up to 2), Post (up to 4) — each taking as much of the
// remaining hours as it can (partial blocks allowed). Anything beyond 8 hr
// becomes an "Overtime Teaching" row. Special case: a whole day under 3 hr is
// booked as a single "Support Teaching" row.
//   e.g. 3h -> Pre 2 / Support 1 ; 6h -> Pre 2 / Support 2 / Post 2 ;
//        7h -> Pre 2 / Support 2 / Post 3 ; 8h -> Pre 2 / Support 2 / Post 4
export function splitDayIntoBlocks(totalHours) {
  let rem = round2(totalHours);
  if (rem <= EPS) return [];

  // A whole day of less than 3 hours is booked as a single "Support Teaching" row.
  if (rem < 3 - EPS) return [{ label: "Support Teaching", hours: rem }];

  const out = [];
  for (const b of BLOCKS) {
    if (rem <= EPS) break;
    const take = round2(Math.min(b.size, rem));
    if (take > EPS) {
      out.push({ label: b.label, hours: take });
      rem = round2(rem - take);
    }
  }
  if (rem > EPS) out.push({ label: "Overtime Teaching", hours: rem });
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

// The single instructor of the sections on a sheet, or null.
// Null when nobody is recorded, when a section's instructor field lists several people
// (comma / slash / semicolon / newline / "และ" / "&"), or when the sections on the sheet
// have different instructors — those cases keep the dotted blank to be written by hand.
export function singleInstructor(displayRows) {
  const names = [];
  let several = false;
  (displayRows || []).forEach((r) => {
    const raw = String(r?.section?.instructor ?? "").trim();
    if (!raw) return;
    if (/[,;\/\n&]|\sและ\s/.test(raw)) several = true;
    const n = raw.replace(/\s+/g, " ");
    if (!names.includes(n)) names.push(n);
  });
  return !several && names.length === 1 ? names[0] : null;
}

// Text for the "(........)" line under "For Instructor" (Work time sheet).
// With a name the dotted line stays, around the name: "(………name………)", about as wide as the blank.
export function instructorParen(displayRows, blank) {
  const n = singleInstructor(displayRows);
  if (!n) return blank;
  const dot = blank.replace(/[()]/g, "")[0] || ".";
  const total = blank.replace(/[()]/g, "").length;
  const visible = [...n].filter((ch) => !/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(ch)).length;
  // "…" is about as wide as two letters
  const side = Math.floor((total - Math.ceil(visible / 2)) / 2);
  return side >= 2 ? `(${dot.repeat(side)}${n}${dot.repeat(side)})` : `(${n})`;
}

// Display rows built from a frozen snapshot carry the section as it was saved at confirm
// time (no instructor). Re-attach the live instructor by section id.
export function attachInstructors(displayRows, liveRows) {
  const byId = {};
  (liveRows || []).forEach((r) => { if (r?.section?.id != null) byId[r.section.id] = r.section.instructor ?? null; });
  return (displayRows || []).map((r) =>
    r?.section ? { ...r, section: { ...r.section, instructor: byId[r.section.id] ?? r.section.instructor ?? null } } : r
  );
}
