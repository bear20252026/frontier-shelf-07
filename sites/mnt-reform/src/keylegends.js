// 键帽字符定位数据：keycaps_us.png 中每个字符块的实测中心（像素，墨迹质心）。
// 每排按 x 顺序与模型键位一一对应；比例 S=10.1 px/mm（图集 187.6px / 键距 18.6mm）。
export const LEGEND_ROWS = {
  "-75.8": { y: 386, xs: [172, 362.8, 549.7, 737.3, 924.7, 1112.4, 1300.7, 1485.2, 1675.9, 1863.2, 2050.7, 2237.7, 2424.4, 2657.8] },
  "-58.2": { y: 564, xs: [172.8, 367.2, 546.3, 738.3, 926.7, 1111, 1302, 1486.2, 1677, 1866.1, 2054.5, 2235.8, 2424.8, 2663.5] },
  "-40.6": { y: 741, xs: [225.3, 452, 639.3, 824.4, 1012.3, 1202, 1389.8, 1577.4, 1765, 1952.7, 2137.3, 2326, 2515.7, 2706] },
  "-23":   { y: 919, xs: [244.4, 499.2, 687.3, 872.6, 1058.6, 1251, 1439, 1631.7, 1811.2, 1997.4, 2191, 2376.8, 2632.8] },
  "-5.4":  { y: 1097, xs: [198.6, 400.6, 594.5, 782.2, 967.8, 1156.7, 1342.5, 1531.5, 1719.5, 1903.3, 2089.5, 2281, 2469, 2679.4] },
  "12.2":  { y: 1275, xs: [201.6, 452.4, 733.8, 1909.2, 2094.6, 2275.6, 2469, 2684.6] },
};
// 空格区三个键帽（SW24/SW30/SW42）取图集空格空白处
export const SPACE_BLANK = [1300, 1275];
export const LEGEND_SCALE = 10.1;

// 模型键位按排分组（z 取整到 0.1）并按 x 排序后，返回该键对应的图集字符中心 [px, py]
export function matchLegend(keycaps, canon, center) {
  const z = Math.round(center[2] * 10) / 10;
  const rowKey = Object.keys(LEGEND_ROWS).reduce((a, b) => Math.abs(parseFloat(b) - z) < Math.abs(parseFloat(a) - z) ? b : a);
  const row = LEGEND_ROWS[rowKey];
  const keys = keycaps[rowKey];
  const idx = keys.indexOf(canon);
  if (rowKey === "12.2") {
    if (idx < 3) return [row.xs[idx], row.y];
    if (idx < 6) return SPACE_BLANK;
    return [row.xs[idx - 3], row.y];
  }
  return [row.xs[Math.min(idx, row.xs.length - 1)], row.y];
}

// 从 parts_map 收集键帽并按排分组排序
export function groupKeycaps(partsMap) {
  const rows = {};
  for (const [canon, info] of Object.entries(partsMap.parts)) {
    if (info.matClass !== "keycap") continue;
    const z = Math.round(info.center[2] * 10) / 10;
    const rowKey = Object.keys(LEGEND_ROWS).reduce((a, b) => Math.abs(parseFloat(b) - z) < Math.abs(parseFloat(a) - z) ? b : a);
    (rows[rowKey] ||= []).push([canon, info.center[0]]);
  }
  for (const k of Object.keys(rows)) rows[k] = rows[k].sort((a, b) => a[1] - b[1]).map(e => e[0]);
  return rows;
}
