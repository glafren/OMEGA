export interface ImageTemplateConfig {
  canvasWidth: 750; canvasHeight: 1000; backgroundColor: string;
  ikeaLogo: { x: number; y: number; width: number; maxHeight: number };
  storeLogo: { x: number; y: number; width: number; maxHeight: number };
  product: { areaX: number; areaY: number; areaWidth: number; areaHeight: number; padding: number };
  productName: { x: number; y: number; maxWidth: number; fontSize: number; minFontSize: number; fontWeight: number; fontFamily: string; color: string; align: "middle"; shadow: { angle: number; distance: number; opacity: number } };
  productCode: { x: number; y: number; fontSize: number; fontWeight: number; fontFamily: string; color: string; align: "end" };
}

export const defaultTemplate: ImageTemplateConfig = {
  canvasWidth: 750, canvasHeight: 1000, backgroundColor: "#FFFFFF",
  ikeaLogo: { x: 30, y: 98, width: 278, maxHeight: 130 },
  storeLogo: { x: 442, y: 20, width: 250, maxHeight: 310 },
  product: { areaX: 10, areaY: 285, areaWidth: 730, areaHeight: 575, padding: 0 },
  productName: { x: 375, y: 915, maxWidth: 580, fontSize: 44, minFontSize: 24, fontWeight: 700, fontFamily: "Montserrat", color: "#0356ac", align: "middle", shadow: { angle: -45, distance: 5, opacity: 0.5 } },
  productCode: { x: 710, y: 958, fontSize: 20, fontWeight: 600, fontFamily: "Montserrat", color: "#0356ac", align: "end" },
};
