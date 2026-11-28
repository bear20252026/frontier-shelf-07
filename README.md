# Frontier VII — 22 live worlds

**数字图书馆第七分卷 · Volume VII of VII · ranks 651–672**

这是 `frontier-shelf-07`：把 22 个 Kimi / FC 部署站点收进同一个仓库，并为每个页面保留可实际打开的本地入口。水母（`jellyfish`）同时保留线上 WebGL 压缩产物与 上游工程(信息见总表) 上游 WebGPU/TSL 源码。

- **22 个站点**，全部位于 `sites/<slug>/`
- **22/22 HTTP 200**，2026-11-25 用 Chromium + Playwright 逐页审计
- **22 张实机截图**，位于 `assets/shots/`，首页卡片直接引用
- **6 个压缩 bundle** 原样保留；没有 source map，不伪造“已还原源码”
- **11 个模块化源码**、**5 个单文件内嵌**

打开房间：<https://bear20252026.github.io/frontier-shelf-07/>

## 怎么运行

在仓库根目录：

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080/
```

或者：

```bash
python3 scripts/serve.py
```

所有页面使用相对路径。不要直接双击 HTML 以 `file://` 打开，ES modules 和 `fetch()` 会被浏览器拦截。

## 收录清单

| Rank | 目录 | 页面 | 入口 | 源码类型 | 上游 |
|---:|---|---|---|---|---|
| 651 | `inmotion` | **IN MOTION** · Catch the motion | `index.html` | 模块化源码 | [源站](https://inmotion.ok.kimi.link/) |
| 652 | `light-color-dance` | **光色之舞** · 印象派大师展 | `index.html` | 压缩 bundle | [源站](https://ehwy2waoquu4s.ok.kimi.link/) |
| 653 | `field-buffer` | **FIELD** · 一段缓冲区的四种状态 | `index.html` | 模块化源码 | [源站](https://mp2omwzlqp2mg.ok.kimi.link/) |
| 654 | `tiffany-lamp` | **蒂凡尼彩绘玻璃台灯** · Tiffany stained-glass lamp | `index.html` | 单文件内嵌 | [源站](https://knxlya43lfegi.ok.kimi.link/) |
| 655 | `sunset-collector` | **日落收藏家** · Sunset Collector | `index.html` | 压缩 bundle | [源站](https://fpur2umqgt2bu.ok.kimi.link/) |
| 656 | `cz5` | **长征五号** · CZ-5 · 中国航天 | `index.html` | 模块化源码 | [源站](https://hxp6ckmqfulbm.ok.kimi.link/) |
| 657 | `moonshot-concept-r` | **MOONSHOT Concept R** · 轨道立方发布 | `index.html` | 单文件内嵌 | [源站](https://bfqywdgssqppc.ok.kimi.link/) |
| 658 | `jellyfish` | **Aurelia** · 实时生成水母 | `index.html` | bundle + 上游源码 |  |
| 659 | `ev7-helmet` | **Moonshot EV-7** · 舱外活动头盔 | `index.html` | 模块化源码 | [源站](https://fk47bkcgsbnhi.ok.kimi.link/) |
| 660 | `open-sea-webgpu` | **Open Sea** · WebGPU Ocean | `index.html` | 模块化源码 | [源站](https://deployma-webgpu-tfywsgwrmm.cn-beijing-vpc.fcapp.run/) |
| 661 | `cloud-storage` | **云储存** · 个人云盘 | `index.html` | 压缩 bundle | [源站](https://dash-cloud-storage-cn.ok.kimi.link/) |
| 662 | `limonaia` | **Limonaia** · Amalfi lemons, one pull away | `index.html` | 模块化源码 | [源站](https://limonaia.ok.kimi.link/) |
| 663 | `r4360` | **R-4360 Wasp Major** · 4-Row Radial · Engineering Dashboard R1 | `index.html` | 单文件内嵌 | [源站](https://k3-r4360.ok.kimi.link/) |
| 664 | `open-heart` | **Kimi — Open Heart** · 机械腕表研究 | `index.html` | 模块化源码 | [源站](https://k3-open-heart.ok.kimi.link/) |
| 665 | `k3-microscope` | **K3 Compound Microscope** · Exploded Optical Study | `index.html` | 单文件内嵌 | [源站](https://k3-microscope.ok.kimi.link/) |
| 666 | `k3-piano-sound-path` | **KIMI · From Touch to Sound** · 从触碰到声音 | `sound-path.html` | 模块化源码 | [源站](https://k3-piano-cfx.ok.kimi.link/sound-path.html) |
| 667 | `goodluck-bobing` | **Goodluck** · 中秋博饼 | `bobing.html` | 模块化源码 | [源站](https://goodluck.ok.kimi.link/bobing.html) |
| 668 | `timber-tower` | **TIMBER TOWER** · A Rapier Physics Duel | `index.html` | 压缩 bundle | [源站](https://timber-tower.ok.kimi.link/) |
| 669 | `aeolis-01` | **AEOLIS 01** · 火星地表探索概念车 | `index.html` | 单文件内嵌 | [源站](https://5qgbge2wajz2k.ok.kimi.link/) |
| 670 | `mnt-reform` | **MNT Reform** · 模块之内 | `index.html` | 模块化源码 | [源站](https://mnt-reform-laptop-exploded.ok.kimi.link/) |
| 671 | `gringotts-lighting` | **古灵阁** · 灯光控制台 | `index.html` | 压缩 bundle | [源站](https://gringottslighting.ok.kimi.link/) |
| 672 | `fish-and-me` | **Fish&me** · 斗鱼、窗与光 | `index.html` | 模块化源码 | [源站](https://fish-and-me.ok.kimi.link/) |

## 仓库结构

```text
frontier-shelf-07/
├── index.html                 # 第七分卷目录页
├── data/catalog.json          # 机读清单（22 条）
├── source-spec.json           # 分卷统计
├── assets/shots/              # 22 张 1280×800 实机截图
├── sites/                     # 22 个可运行站点
│   ├── inmotion/              # 每个目录保留原始相对文件树
│   ├── jellyfish/             # 线上 WebGL bundle
│   └── ...
├── source/aurelia/            # 水母上游 WebGPU 源码 + dist + 对比说明
├── scripts/serve.py           # 本地静态服务器
├── SOURCE.md                  # 来源、依赖与 bundle 说明
├── NOTICE.md                  # 来源与权利说明
└── .nojekyll                  # GitHub Pages 不做 Jekyll 处理
```

## 关键修复

- 把 `jellyfish`、`cloud-storage`、`gringotts-lighting` 的根路径 `/assets/...` 改为 `./assets/...`。
- 把 bundle 内的 `/images/*`、`/videos/*`、`/grunge.png`、`/gringotts.glb` 改为文档相对路径。
- 为 `light-color-dance` 修改 React Router 的 `basename` 默认值；否则打开 `/sites/light-color-dance/` 会报 `No routes matched location`。
- 本地化 `open-sea-webgpu` 的 Three.js 0.178 / TSL / addons / Geist 字体，移除运行时 CDN 依赖。
- 本地化 `moonshot-concept-r`、`aeolis-01` 的 cdnjs Three.js r128。
- 本地化 `light-color-dance` 的 Google Fonts 到 `fonts/`。
- 从原站补抓 `inmotion` 动作图、`cz5` 火箭/发射台贴图、`sunset-collector` 公寓 GLB、`timber-tower` HDR/贴图、`goodluck-bobing` 博饼道具与音效、`open-heart` 腕表模型/材质、`mnt-reform` 装配 GLB 与贴图、`fish-and-me` 模型等。
- `cloud-storage` 的 `config.json` 是 `{"backend": false}`；本地用 `seed/en` + `seed/cn` 演示数据，不连接后端。

## 已知限制

- **`field-buffer` / `open-sea-webgpu`** 需要支持 WebGPU 的浏览器。headless Chromium 可能报 `WebGPU Device Lost` 或 `Instance dropped in popErrorScope`，这是运行环境限制；有 WebGPU 的真实浏览器应正常渲染。
- **`cloud-storage`** 是 UI demo，`/api/*` 不会连真实服务；文件上传只存在于本地演示状态。
- **6 个 bundle** 没有 `.map`，无法还原原始 React/TSX 组件树；仓库只保留线上产物与可读的模块边界，不声称源码已还原。
- **`k3-piano-sound-path`** 是 3D 模型页，页面没有 `<canvas>` 标签，但实机截图正常；审计中的 `canvas=0` 不代表页面空白。
- **`light-color-dance`** 的 `basename` 补丁依赖目录 URL；从 `index.html` 直接打开也可以，但推荐使用目录路径。

## 审计口径

2026-11-25，Chromium + Playwright，1280×800，逐页等待 6 秒后记录：

- HTTP 状态
- `<canvas>` 数量与尺寸
- 页面正文
- 404 资源
- console error / pageerror

结果：22/22 `status=200`；22 张截图；除 `field-buffer` / `open-sea-webgpu` 的 WebGPU 环境限制外，所有页面均加载到可见内容。详细错误逐条在开发记录中核对，不以“能打开”代替“能运行”。

## 相关链接

- [Frontier Atlas](https://bear20252026.github.io/frontier-atlas/)
- [数字图书馆 github-catalog](https://bear20252026.github.io/github-catalog/)
- [本卷 GitHub 仓库](https://github.com/bear20252026/frontier-shelf-07)
