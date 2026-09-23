export function containSize(sourceWidth: number, sourceHeight: number, areaWidth: number, areaHeight: number) {
  if ([sourceWidth, sourceHeight, areaWidth, areaHeight].some((v) => !Number.isFinite(v) || v <= 0)) throw new Error("Boyutlar pozitif olmalıdır");
  const scale = Math.min(areaWidth / sourceWidth, areaHeight / sourceHeight);
  return { width: Math.round(sourceWidth * scale), height: Math.round(sourceHeight * scale) };
}

export function centeredPlacement(sourceWidth: number, sourceHeight: number, areaX: number, areaY: number, areaWidth: number, areaHeight: number) {
  const size = containSize(sourceWidth, sourceHeight, areaWidth, areaHeight);
  return { ...size, left: Math.round(areaX + (areaWidth - size.width) / 2), top: Math.round(areaY + (areaHeight - size.height) / 2) };
}
