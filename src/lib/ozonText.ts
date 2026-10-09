const ORIGINAL_CLAIM_PATTERNS = [
  /\boriginal\b/giu,
  /\bor[iı]jinal\b/giu,
  /\borjinal\b/giu,
  /(?<![\p{L}\p{N}_])оригинальн(?:ая|ое|ый|ые|ого|ому|ым|ыми|ой|ую|ых)?(?![\p{L}\p{N}_])/giu,
  /(?<![\p{L}\p{N}_])оригинал(?:ьные|ьная|ьное|ьный|а|у|ом|ы)?(?![\p{L}\p{N}_])/giu,
];

export function sanitizeOzonText(value: string) {
  let text = value;
  for (const pattern of ORIGINAL_CLAIM_PATTERNS) text = text.replace(pattern, "");
  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
