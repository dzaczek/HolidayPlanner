export const LAYOUTS = {
  '3x4': { rows: 3, cols: 4 },
  '2x6': { rows: 2, cols: 6 },
  '4x3': { rows: 4, cols: 3 },
  '6x2': { rows: 6, cols: 2 },
  '1x12': { rows: 1, cols: 12 },
  '12x1': { rows: 12, cols: 1 },
};

export function getLayoutClass(layout) {
  return `layout-${layout}`;
}
