# Aurelia 源工程核对

## 仓库
- https://github.com/holtsetio/aurelia
- commit: 724aba263459d1b11a49b72bfc7ce8baac840ca8 (2025-06-10)
- License: MIT

## 与 Kimi「Aurelia · 实时生成水母」的关系

高度相关，基本可以确认这个仓库是上游参考源：

1. HTML 结构几乎一致：`#container`、`#veil`、`#progress-bar`、相同的 viewport 设置。
2. 线上 bundle 保留了仓库里的原句：`Verlet system not yet baked!`
3. 线上 bundle 里有一条注释：`radial line / speckle pattern, ported from medusaBellPattern.js`，直接指向本仓库的 `src/medusaBellPattern.js`。
4. 线上 bundle 同样包含 medusa bell、oral arms、tentacles、verlet physics 等模块。

## 但不是同一份构建

- 仓库原版：`three/webgpu` + `WebGPURenderer`（WebGPU）。
- 线上版本：`WebGLRenderer`（WebGL），是移植/降级后的版本。
- 仓库本地构建：`dist/assets/index-t8ql2Fmu.js` 约 1.18 MB。
- 线上 bundle：`assets/index-Di72duUg.js` 约 558 KB。
- 线上版本没有仓库里的 `godrays.js`、`plankton.js`、Tweakpane 调试面板，属于精简版。

## 结论

这个仓库是水母页面的**上游参考源**，适合学习结构、改参数、重新实现；但它不是线上那份 bundle 的逐字节原始工程。线上页面更像是一个 WebGL 精简移植版。
