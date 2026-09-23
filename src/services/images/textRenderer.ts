const escapeXml = (value: string) => value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);

export function fitProductName(value: string, maxWidth: number, preferredSize: number, minSize: number) {
  const text = value.trim();
  let fontSize = preferredSize;
  const estimated = (candidate: string, size: number) => candidate.length * size * 0.62;
  while (fontSize > minSize && estimated(text, fontSize) > maxWidth) fontSize -= 2;
  if (estimated(text, fontSize) <= maxWidth) return { lines: [text], fontSize };
  const words = text.split(/\s+/); const lines = [""];
  for (const word of words) {
    const index = lines.length - 1; const candidate = `${lines[index]} ${word}`.trim();
    if (estimated(candidate, fontSize) <= maxWidth || !lines[index]) lines[index] = candidate;
    else if (lines.length === 1) lines.push(word); else lines[1] += ` ${word}`;
  }
  while (fontSize > minSize && lines.some((line) => estimated(line, fontSize) > maxWidth)) fontSize -= 2;
  return { lines: lines.slice(0, 2), fontSize };
}

export function textLayer(modelName: string, productCode: string, options: { width: number; height: number; nameX: number; nameY: number; nameMaxWidth: number; nameFontSize: number; nameMinSize: number; nameFontWeight: number; nameFontFamily: string; nameColor: string; shadowAngle: number; shadowDistance: number; shadowOpacity: number; embeddedFont?: { base64: string; format: "opentype" | "truetype" }; codeX: number; codeY: number; codeFontSize: number; codeFontWeight: number; codeFontFamily: string; codeColor: string }) {
  const fitted = fitProductName(modelName, options.nameMaxWidth, options.nameFontSize, options.nameMinSize);
  const lineHeight = Math.round(fitted.fontSize * 1.12);
  const startY = options.nameY - ((fitted.lines.length - 1) * lineHeight) / 2;
  const radians = options.shadowAngle * Math.PI / 180;
  const dx = (Math.cos(radians) * options.shadowDistance).toFixed(2);
  const dy = (Math.sin(radians) * options.shadowDistance).toFixed(2);
  const fontFace = options.embeddedFont ? `@font-face{font-family:'${escapeXml(options.nameFontFamily)}';src:url(data:font/${options.embeddedFont.format};base64,${options.embeddedFont.base64}) format('${options.embeddedFont.format}');}` : "";
  const spans = fitted.lines.map((line, index) => `<text x="${options.nameX}" y="${startY + index * lineHeight}" text-anchor="middle" class="name" filter="url(#modelShadow)">${escapeXml(line)}</text>`).join("");
  return Buffer.from(`<svg width="${options.width}" height="${options.height}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="modelShadow" x="-50%" y="-100%" width="200%" height="250%"><feDropShadow dx="${dx}" dy="${dy}" stdDeviation="4" flood-color="${options.nameColor}" flood-opacity="${options.shadowOpacity}"/></filter></defs><style>${fontFace}.name{font-family:'${escapeXml(options.nameFontFamily)}',Arial,sans-serif;font-size:${fitted.fontSize}px;font-weight:${options.nameFontWeight};fill:${options.nameColor}}.code{font-family:'${escapeXml(options.codeFontFamily)}',Arial,sans-serif;font-size:${options.codeFontSize}px;font-weight:${options.codeFontWeight};fill:${options.codeColor}}</style>${spans}<text x="${options.codeX}" y="${options.codeY}" text-anchor="end" class="code">${escapeXml(productCode)}</text></svg>`);
}
