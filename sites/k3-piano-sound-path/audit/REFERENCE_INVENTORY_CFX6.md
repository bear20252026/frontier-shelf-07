# Yamaha CFX Reference Photo 6: Inventory of Visible Layout Units

2026-09-14. Purpose: reconstruct the outlines, relative sizes, density, and layout order in the photograph first. **This table is not a CFX factory BOM; publicity totals such as "about 12,000 parts in a piano" are never used to back-fill the photo.**

## Baseline and counting rules

- Final baseline: `audit/references/cfx6-original.png`, the official 4096×4002 PNG, decompressed without resampling.
- Source: <https://yamaha-europe.com/YAMAHA_CFX_Wallpapers_4096.zip>, image 6; the research worker has verified the archived source.
- The 818×818 JPG and the user's 1460×1448 screenshot are only for cross-identification, never as the final count basis for small parts.
- A "layout unit" below means one piece or one assembly with its own clear spacing in the photo. "Internal repeats" means rods, keys, hammers, etc. still visible side by side inside that assembly. The two must not be added together and called a count of individual physical parts.
- Region positions use normalized image coordinates with the origin at the top left; original pixels in parentheses are for programmatic review.
- Confidence: high = each piece clearly visible and independently checkable; medium = zone confirmed, small pieces may include occlusion/reflections; low = only groups are distinguishable, no reliable per-piece count.

## From top left to bottom right

| Zone | Position / composition | Standalone layout units or groups | Internal repeats and counts | Confidence & modeling notes |
|---|---|---:|---|---|
| A | Outermost brass brackets at top left | **6** | Each has a curved arm, a foot, and an opening | High. Must be 6 pieces with equal vertical spacing; do not substitute straight bars. |
| B1 | 1st dense action-assembly column right of the brackets | **5 sections** | Suspected wippen array; repeats should be traced rod by rod — do not force 88 visible outlines just because there are 88 notes | Medium. Outer outlines of the 5 sections first, then inner rods/holes/felt layers. |
| B2 | 2nd column, wider light-wood dense assembly | **5 sections** | Wooden shanks and white hammer heads visible; this is the full hammer row, not the 3 sparse gray-head columns on the right | Medium-high. An 88-note layout does not mean every hammer in the photo is spread apart; keep the tightly packed rows. |
| B3 | 3rd column, narrow black/red dense assembly | **4 sections** | A few standalone end fittings below; internal rod count not locked yet | Medium. A narrow black column in the photo; should not be as wide as the white-wood hammer column. |
| C | Shared rails between B3 and the sparse gray-head pieces | **4 rail families** | 1 full-length light-wood rail, 1 column of 4 red-edged rail segments, 1 metal rail with 4 side lugs, 1 column of 4 light-wood rail segments; about 10 long segments/assemblies | Medium. Side lugs belonging to a rail assembly are not counted again. |
| D1 | 1st column of sparse long rods with gray felt heads | **24** | 6 upper + 18 lower | High count, medium naming. **Very likely the damper assemblies**; final name pending cross-confirmation from technical references — do not call them 24 "hammers". |
| D2 | 2nd column of the same kind | **24** | 6 upper + 12 middle + 6 lower; genuine gaps between middle and lower groups | High. A low-res image once misread a gap as a missing piece; 4096-pixel rod segments confirm there is no 25th rod. |
| D3 | 3rd column of the same kind | **23** | 8 upper + 15 lower | High. The 3 columns total **71 standalone long-rod gray-head assemblies**; do not clone 17 more to reach 88. |
| E | Small metal-parts matrix below B3/C | **1 matrix** | About 17 columns × 5 rows, provisionally **80–90** visible small pieces (nominal grid 85); silver reflections and shadows break automatic connected-component splitting | Medium. These are not the large colored paper-ring matrix of reference photo CFX2; do not replace them with stacks of large washers. |
| F1–F3 | 3 long horizontal rows of metal pins / tuning-pin-like pieces | **3 rows** | **81 per row, 243 total** | High. Four independent saliency-threshold scans all return 81. Original-image coordinates and per-pin ROIs are exported, see below. The name was not back-filled from a BOM. |
| G | Keys at lower-middle left | **5 key-row sections** | 88 wooden levers located by seam seeds in the original photo, sections of 20/15/18/18/17; 52 white key fronts and 36 black key fronts counted separately as visible surfaces | High for sections, medium for outlines. Low-contrast lever boundaries are still interpolated from the fan-shaped envelope of the original photo; see key-outline-check.json. Keytops and levers must not be double-counted as different keys. |
| H | Green-felt wooden frame right of the keys | **1 key-frame assembly** | 5 long window zones, front/balance rails and longitudinal dividers; the dense pins on the attached rail are not another set of standalone keys | High. The 5-window frame must not be replaced by a solid board. |
| I | Wooden rail right of the key frame, black cover panel and end blocks | **~6 main pieces + 1 curved handle** | 1 long light-wood rail, 2 narrow black long pieces, 1 wide black cover panel, 2 end blocks (top and bottom); separate fasteners scattered nearby | Medium. Plus 1 light-wood cover strip above the key frame. |
| J | 4 curved thin strips below the cast-iron plate | **4** | Repeating serrations or needle-like details on inner/outer edges — not 4 smooth arcs | High. Build each outline with its own curvature. |
| K | Orange-gold cast-iron frame at top right | **1 main assembly** | Frame windows, cross beams, circular hole rings, and dense pins remain connected in the main piece | High. Holes are not standalone rings. One separate long red felt/edge strip on the left. |
| L | Soundboard under the cast-iron frame | **1 main assembly** | 2 bridges and dense bridge pins remain on the board; not 2 separately laid-out bridges | High. The relative outline of board + bridges is the primary acceptance item. |
| M | Large black lids at middle right | **2 main pieces** | 1 long rectangular front lid, 1 triangular curved main lid; each with inlay/hinge details | High. Strictly preserve the narrow white gap between the two. |
| N | Black support rods at upper right of the lids | **2 main rods + ~2 brass connectors** | Forked end of the main prop, short prop; about 20–30 surrounding fasteners, not merged into the prop assembly count | Medium. The length ratio between the long and short rods is very distinctive. |
| O | Connecting hardware under the lids | **3 groups** | Each group has two main hinge/connecting plates and a small screw array; exact screw totals pending per-group reading | High for group count, low for internal counts. The 3 groups align with the lower edge of the large case. |
| P | Longest black case/rim at lower middle | **1 large assembly** | Yamaha mark at the end, lacquer reflections, small structures at the bottom end | High. Brand imagery must not substitute for model fidelity. |
| Q | Music desk / cross rails at lower left | **~7 main pieces** | 1 openwork music desk (8 large openings), 2 square side panels, 2 narrow outer end panels, 2 cross rails below; rail feet and hinges can be split further | High for main outlines, medium for small-part splitting. |
| R | 3 legs and casters at the very bottom | **3 legs + 3 casters + 3 standalone collars** | About 2 black connectors per leg, 6 total; each caster is a fork/wheel assembly — do not substitute 3 balls | High. Main leg proportions and individual clear spacing are independently reviewed. |
| S | Pedal lyre and pedal mechanism at lower left | **1 hollow frame + 3 pedals + 1 adjustment block** | 2 connectors on the left and right of the frame; loose screws/bushings below; do not fuse the frame and 3 pedals into one piece | High for main pieces. |
| T | Long control rods beside the pedal lyre | **5** | 3 brass-colored slim rods + 2 dark rods, each with discrete joints/washers at the top | High. Lengths differ; do not clone one length. |
| U | Smaller pedal linkages further left | **~4 main pieces** | 1 long L-shaped black piece, 3 short black pieces; plus small springs/metal parts, about 7–8 L-shaped pieces below | Medium. The photo shows clear spacing between them; main pieces must stay separate. |
| V | Small hanger and fine hardware between the legs | **1 black hanger + 2 small cross pieces + 1 array of slim parts** | Array of about 10–15 long/short pieces; reflections make reading difficult, no precise BOM reported yet | Medium/low. |
| W | Long string bundle at far right | **1 bundle-like layout region** | Many straight strings visible; the exact strand count cannot be reliably checked from overlapping lines alone | High for shape, low for count. Should be a longitudinal straight bundle, not a fanned spread. |
| X | Vertical rings at far right | **12** | Each ring contains a wound-wire assembly — not 12 single strings | High. The 12 standalone ring outlines and their pitch can be locked. |
| Y | Paired long pieces left of the rings | **10 pairs, ~20 pieces** | 3 shorter pairs above, 7 longer pairs below; reflections and shadows present | Medium-high. Main outlines follow the paired columns; do not mistake them for another ring column. |
| Z1 | Red rings at top right | **5** | 3 large, 2 small; staggered in two columns | High. Not 6; color connected regions match the manual count. |
| Z2 | Metal-parts array left of the red rings | **~5 columns × 8 rows, 40 pieces** | Each with a small bend/loop head | Medium-high. Rows are slightly offset; keep the real, not perfectly aligned, arrangement. |

## Precise data ready for outline extraction

`assets/reference/pin-rows.json` contains the 243 real image positions of zone F: `[x,y]` centers in the original photo, `[left,top,right,bottom)` crop regions, and scan intensities. The algorithm did not generate, duplicate, or average-fill any missing pin.

- F1 scan ROI: original x ≈ 355–1594, y 1228–1256.
- F2: same x range, y 1315–1341.
- F3: same x range, y 1400–1425.
- `audit/count-reference-pin-rows.py`: local-peak scan of grayscale column means; prominence 12/16/20/24 all return 81 per row; minimum peak spacing 8 original pixels.
- Zone D long-handle review: narrow-band scans at x 472–489, 533–545, 583–599 (equivalent to 1600 display width on the original) return 24/24/23 strong long-handle peaks; the y ≈ 363–379 display-pixel band in column 2 is genuine blank space, not a 25th rod.

## Locked vs. still needing manual review

Can be locked now: 6 brackets, 5 dense wippen sections, 5 hammer sections, 4 black-column sections, 71 sparse gray-head assemblies in 3 columns, 243 long-row pin-like pieces, 5 key-row sections, 4 curved strips, 2 large lids, 3 legs / 3 casters, 3 pedals, 5 long control rods, 12 rings, 5 red rings.

No false-precision "N complete parts in the photo" total: some objects are laid out piece by piece, others are still shown as assemblies of dozens, and tiny reflective hardware may still be under-read. Build the outline draft from these confirmed layout units first, then split the dense assemblies into second-level parts, and only then produce a traceable BOM comparison table.
