// Thai-aware line wrapping for PDF cells.
//
// Thai is written without spaces, so a naive character-by-character wrap breaks
// words (and even consonant+vowel clusters) at unnatural points. We use the
// platform's ICU dictionary via Intl.Segmenter to split text at real Thai word
// boundaries, then greedily pack those words into lines that fit the given
// width. A single "word" wider than the whole cell is split by grapheme cluster
// (never between a base character and its combining marks) as a last resort.

const wordSeg =
  typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter("th", { granularity: "word" })
    : null;
const graphemeSeg =
  typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter("th", { granularity: "grapheme" })
    : null;

function tokenize(s) {
  if (wordSeg) return [...wordSeg.segment(s)].map((x) => x.segment);
  // Fallback: split on whitespace only (keeps spaces as tokens).
  return s.split(/(\s+)/).filter((t) => t !== "");
}
function graphemes(s) {
  if (graphemeSeg) return [...graphemeSeg.segment(s)].map((x) => x.segment);
  return [...s];
}

// `measure(text)` returns the rendered width of `text`.
export function wrapTextLines(s, maxW, measure) {
  s = String(s ?? "");
  if (s === "" || maxW <= 0 || measure(s) <= maxW) return [s];

  const out = [];
  let cur = "";
  const flush = () => {
    const line = cur.replace(/\s+$/, "");
    if (line !== "") out.push(line);
    cur = "";
  };
  const pushGraphemes = (word) => {
    for (const g of graphemes(word)) {
      if (cur !== "" && measure(cur + g) > maxW) {
        out.push(cur);
        cur = g;
      } else cur += g;
    }
  };

  for (const tok of tokenize(s)) {
    if (tok === "") continue;
    if (measure(cur + tok) <= maxW) {
      cur += tok;
      continue;
    }
    // token doesn't fit on the current line
    if (/^\s+$/.test(tok)) {
      flush(); // an overflowing space just ends the line
      continue;
    }
    flush();
    if (measure(tok) > maxW) pushGraphemes(tok); // word wider than the cell
    else cur = tok;
  }
  if (cur !== "") flush();
  return out.length ? out : [""];
}
