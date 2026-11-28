/** CPU sectioning for the assembled, static piano meshes.
 * All returned vertices are in world coordinates and every returned mesh has
 * an identity transform. Put them in identity groups before animating halves.
 * Source geometry, materials and transforms are never changed.
 */
export function splitMeshAtZ(T, mesh, cutZ = 0, options = {}) {
  const negative = [], positive = [];
  const stats = { sourceTriangles: 0, negativeTriangles: 0, positiveTriangles: 0,
    capTrianglesPerSide: 0, sectionSegments: 0, closedContours: 0, holes: 0,
    openContours: 0, ambiguousVertices: 0, degenerateTriangles: 0,
    invalidTriangles: 0, crossed: false };
  if (!mesh?.geometry?.attributes?.position) return { negative, positive, stats };
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const position = geometry.attributes.position, normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv, color = geometry.attributes.color;
  const index = geometry.index, count = index ? index.count : position.count;
  const start = Math.max(0, geometry.drawRange.start || 0);
  const end = Math.min(count, start + geometry.drawRange.count);
  const epsilon = options.epsilon ?? 1e-7;
  const epsilon2 = epsilon * epsilon;
  const mirrored = mesh.matrixWorld.determinant() < 0;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = start; i < end; i++) {
    const z = position.getZ(index ? index.getX(i) : i);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  stats.sourceTriangles = Math.floor((end - start) / 3);
  const cloneMaterials = () => Array.isArray(mesh.material)
    ? mesh.material.map(m => m.clone()) : mesh.material.clone();
  function output(geo, material, side, cap = false) {
    const result = new T.Mesh(geo, material);
    result.name = (mesh.name || mesh.userData?.detailName || 'part') + ':' + side + (cap ? ':section' : '');
    result.castShadow = mesh.castShadow; result.receiveShadow = mesh.receiveShadow;
    result.renderOrder = mesh.renderOrder; result.layers.mask = mesh.layers.mask;
    result.frustumCulled = mesh.frustumCulled;
    result.userData = { ...mesh.userData, sectionHalf: side, sectionCap: cap, sectionSource: mesh.uuid };
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    (side === 'negative' ? negative : positive).push(result);
  }
  function flipWinding(geo) {
    if (geo.index) {
      const a = geo.index.array;
      for (let i = 0; i + 2 < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
    } else {
      for (const attr of Object.values(geo.attributes)) {
        const a = attr.array, n = attr.itemSize;
        for (let i = 0; i + 2 < attr.count; i += 3) for (let k = 0; k < n; k++) {
          const j = (i + 1) * n + k, l = (i + 2) * n + k;
          [a[j], a[l]] = [a[l], a[j]];
        }
      }
    }
  }
  // Most of the 823 units do not meet the plane. Keep their original buffers,
  // groups and attributes, applying only the world bake and a material clone.
  if (maxZ <= cutZ + epsilon || minZ >= cutZ - epsilon) {
    const side = maxZ <= cutZ + epsilon ? 'negative' : 'positive';
    for (let i = 0; i < position.count; i++) if (Math.abs(position.getZ(i) - cutZ) <= epsilon) position.setZ(i, cutZ);
    if (mirrored) flipWinding(geometry);
    if (!normal) geometry.computeVertexNormals();
    output(geometry, cloneMaterials(), side);
    stats[side + 'Triangles'] = stats.sourceTriangles;
    return { negative, positive, stats };
  }
  stats.crossed = true;
  const buffers = { negative: { p: [], n: [], uv: [], color: [], groups: [] }, positive: { p: [], n: [], uv: [], color: [], groups: [] } };
  const segments = [];
  const groups = geometry.groups;
  let groupCursor = 0;
  function materialIndex(offset) {
    if (!Array.isArray(mesh.material) || !groups.length) return 0;
    while (groupCursor + 1 < groups.length && offset >= groups[groupCursor].start + groups[groupCursor].count) groupCursor++;
    return groups[groupCursor]?.materialIndex || 0;
  }
  function vertex(i) {
    const v = { p: [position.getX(i), position.getY(i), position.getZ(i)],
      n: normal ? [normal.getX(i), normal.getY(i), normal.getZ(i)] : null,
      uv: uv ? [uv.getX(i), uv.getY(i)] : null,
      color: color ? Array.from({ length: color.itemSize }, (_, c) => color.array[i * color.itemSize + c]) : null };
    if (Math.abs(v.p[2] - cutZ) <= epsilon) v.p[2] = cutZ;
    return v;
  }
  function intersection(a, b) {
    const t = (cutZ - a.p[2]) / (b.p[2] - a.p[2]);
    const mix = (x, y) => x && x.map((v, i) => v + (y[i] - v) * t);
    return { p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t, cutZ],
      n: mix(a.n, b.n), uv: mix(a.uv, b.uv), color: mix(a.color, b.color) };
  }
  function clip(vertices, sign) {
    const result = [];
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i], b = vertices[(i + 1) % vertices.length];
      const insideA = sign * (a.p[2] - cutZ) >= 0, insideB = sign * (b.p[2] - cutZ) >= 0;
      if (insideA) result.push(a);
      if (insideA !== insideB) result.push(intersection(a, b));
    }
    return result;
  }
  function triangle(a, b, c, side, matIndex) {
    const ab = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]];
    const ac = [c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]];
    const nx = ab[1] * ac[2] - ab[2] * ac[1], ny = ab[2] * ac[0] - ab[0] * ac[2], nz = ab[0] * ac[1] - ab[1] * ac[0];
    const length = Math.hypot(nx, ny, nz);
    if (length <= epsilon2) { stats.degenerateTriangles++; return; }
    const dst = buffers[side], offset = dst.p.length / 3;
    const lastGroup = dst.groups[dst.groups.length - 1];
    if (lastGroup && lastGroup.materialIndex === matIndex) lastGroup.count += 3;
    else dst.groups.push({ start: offset, count: 3, materialIndex: matIndex });
    for (const v of [a, b, c]) {
      dst.p.push(...v.p);
      if (v.n) { const l = Math.hypot(...v.n) || 1; dst.n.push(v.n[0] / l, v.n[1] / l, v.n[2] / l); }
      else dst.n.push(nx / length, ny / length, nz / length);
      if (uv) dst.uv.push(...v.uv);
      if (color) dst.color.push(...v.color);
    }
    stats[side + 'Triangles']++;
  }
  for (let i = start; i + 2 < end; i += 3) {
    const ids = [0, 1, 2].map(k => index ? index.getX(i + k) : i + k);
    if (mirrored) [ids[1], ids[2]] = [ids[2], ids[1]];
    const vertices = ids.map(vertex), z = vertices.map(v => v.p[2] - cutZ);
    if (vertices.some(v => v.p.some(n => !Number.isFinite(n)))) { stats.invalidTriangles++; continue; }
    const hasNegative = z.some(n => n < 0), hasPositive = z.some(n => n > 0), matIndex = materialIndex(i);
    if (!hasPositive) triangle(...vertices, 'negative', matIndex);
    else if (!hasNegative) triangle(...vertices, 'positive', matIndex);
    else for (const [side, sign] of [['negative', -1], ['positive', 1]]) {
      const polygon = clip(vertices, sign);
      for (let k = 1; k + 1 < polygon.length; k++) triangle(polygon[0], polygon[k], polygon[k + 1], side, matIndex);
    }
    // A plane coincident with an existing edge is a cut only when incident
    // triangles exist on both sides. Retain that information until welding.
    const hits = [];
    for (let k = 0; k < 3; k++) {
      const a = vertices[k], b = vertices[(k + 1) % 3], da = z[k], db = z[(k + 1) % 3];
      if (da === 0) hits.push(a.p);
      if (da * db < 0) hits.push(intersection(a, b).p);
    }
    const unique = hits.filter((p, k) => !hits.slice(0, k).some(q => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 <= epsilon2));
    if (unique.length === 2) segments.push({ a: unique[0], b: unique[1], negative: hasNegative, positive: hasPositive });
  }
  for (const side of ['negative', 'positive']) {
    const b = buffers[side]; if (!b.p.length) continue;
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(b.p, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(b.n, 3));
    if (uv) geo.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2));
    if (color) geo.setAttribute('color', new T.Float32BufferAttribute(b.color, color.itemSize));
    if (Array.isArray(mesh.material)) for (const g of b.groups) geo.addGroup(g.start, g.count, g.materialIndex);
    output(geo, cloneMaterials(), side);
  }
  geometry.dispose();
  if (options.caps === false || !segments.length) return { negative, positive, stats };

  // Weld in XY with adjacent-bucket checks so points near a quantization
  // boundary still connect. Duplicate edges at UV/material seams coalesce.
  const nodes = [], buckets = new Map(), edges = new Map();
  function nodeFor(p) {
    const x = Math.floor(p[0] / epsilon), y = Math.floor(p[1] / epsilon);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const bucket = buckets.get((x + dx) + ',' + (y + dy));
      if (bucket) for (const id of bucket) { const q = nodes[id].p; if ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 <= epsilon2) return id; }
    }
    const id = nodes.length, key = x + ',' + y;
    nodes.push({ p: [p[0], p[1]], adjacent: [] });
    if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(id);
    return id;
  }
  for (const segment of segments) {
    const a = nodeFor(segment.a), b = nodeFor(segment.b); if (a === b) continue;
    const key = a < b ? a + ':' + b : b + ':' + a;
    const old = edges.get(key);
    if (old) { old.negative ||= segment.negative; old.positive ||= segment.positive; }
    else edges.set(key, { a, b, negative: segment.negative, positive: segment.positive });
  }
  for (const edge of edges.values()) if (edge.negative && edge.positive) {
    nodes[edge.a].adjacent.push(edge.b); nodes[edge.b].adjacent.push(edge.a); stats.sectionSegments++;
  }
  const visited = new Set(), loops = [];
  for (let first = 0; first < nodes.length; first++) {
    if (visited.has(first) || !nodes[first].adjacent.length) continue;
    const component = [], stack = [first]; visited.add(first);
    while (stack.length) { const id = stack.pop(); component.push(id); for (const next of nodes[id].adjacent) if (!visited.has(next)) { visited.add(next); stack.push(next); } }
    const bad = component.filter(id => nodes[id].adjacent.length !== 2);
    if (bad.length) { stats.openContours++; stats.ambiguousVertices += bad.filter(id => nodes[id].adjacent.length > 2).length; continue; }
    const contour = []; let current = first, previous = -1;
    do { contour.push(nodes[current].p); const next = nodes[current].adjacent.find(n => n !== previous); previous = current; current = next; } while (current !== first && contour.length <= component.length);
    if (current !== first || contour.length < 3) { stats.openContours++; continue; }
    // Triangle diagonals introduce redundant points on straight cut edges.
    const points = contour.filter((b, i) => {
      const a = contour[(i + contour.length - 1) % contour.length], c = contour[(i + 1) % contour.length];
      const base = Math.hypot(c[0] - a[0], c[1] - a[1]);
      return base < epsilon || Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > epsilon * base;
    });
    if (points.length < 3) { stats.degenerateTriangles++; continue; }
    const area = signedArea(points); if (Math.abs(area) <= epsilon2) continue;
    loops.push({ points, area: Math.abs(area), parent: -1, depth: 0 });
  }
  stats.closedContours = loops.length;
  function signedArea(points) { let a = 0; for (let i = 0; i < points.length; i++) { const p = points[i], q = points[(i + 1) % points.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  function contains(points, p) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  for (let i = 0; i < loops.length; i++) {
    let area = Infinity;
    for (let j = 0; j < loops.length; j++) if (loops[j].area > loops[i].area + epsilon2 && loops[j].area < area && contains(loops[j].points, loops[i].points[0])) { loops[i].parent = j; area = loops[j].area; }
  }
  for (const loop of loops) { let parent = loop.parent; while (parent !== -1) { loop.depth++; parent = loops[parent].parent; } if (loop.depth % 2) stats.holes++; }
  const capPositions = [];
  for (let i = 0; i < loops.length; i++) {
    if (loops[i].depth % 2) continue;
    const toPoints = (loop, clockwise) => {
      const p = loop.points.map(v => new T.Vector2(...v));
      if (T.ShapeUtils.isClockWise(p) !== clockwise) p.reverse(); return p;
    };
    const contour = toPoints(loops[i], true), holes = loops.filter(l => l.parent === i && l.depth % 2).map(l => toPoints(l, false));
    const points = contour.concat(...holes);
    for (const ids of T.ShapeUtils.triangulateShape(contour, holes)) {
      let [a, b, c] = ids.map(id => points[id]);
      const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(area) <= epsilon2) continue;
      if (area < 0) [b, c] = [c, b];
      // BufferGeometry stores Float32 positions. Reject triangles that only
      // have area in double precision but collapse after that quantisation.
      const qa=[Math.fround(a.x),Math.fround(a.y)],qb=[Math.fround(b.x),Math.fround(b.y)],qc=[Math.fround(c.x),Math.fround(c.y)];
      const qArea=(qb[0]-qa[0])*(qc[1]-qa[1])-(qb[1]-qa[1])*(qc[0]-qa[0]);
      if(Math.abs(qArea)<=epsilon2) { stats.degenerateTriangles++; continue; }
      capPositions.push(qa[0],qa[1],cutZ, qb[0],qb[1],cutZ, qc[0],qc[1],cutZ);
    }
  }
  stats.capTrianglesPerSide = capPositions.length / 9;
  if (capPositions.length) for (const side of ['negative', 'positive']) {
    const geo = new T.BufferGeometry(), p = capPositions.slice(), n = [], tex = [], sign = side === 'negative' ? 1 : -1;
    if (sign < 0) for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
    for (let i = 0; i < p.length; i += 3) { n.push(0, 0, sign); tex.push(p[i], p[i + 1]); }
    geo.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(n, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(tex, 2));
    const custom = typeof options.capMaterial === 'function' ? options.capMaterial(mesh, side) : options.capMaterial;
    const material = custom ? custom.clone() : defaultCapMaterial(T, mesh);
    output(geo, material, side, true);
  }
  return { negative, positive, stats };
}

function defaultCapMaterial(T, mesh) {
  const base = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const kind = String(mesh.userData?.pieceData?.material || mesh.userData?.materialKind || mesh.userData?.material || '').toLowerCase();
  const detail = String(mesh.userData?.detailName || '').toLowerCase();
  // Mixed source units such as "felt-metal-wood" contain separate material
  // meshes after exterior repair; their actual material takes precedence.
  const metal = /^(metal|plate|brass|steel|iron|铜|铁|钢)$/.test(kind) || (base.metalness || 0) >= .4;
  const felt = /felt|毡/.test(detail) || kind === 'felt' || (base.roughness || 0) >= .9;
  const keycap = /ivory|keycap|plastic/.test(kind) || /key-cap|white-front-lip/.test(detail);
  const material = new T.MeshStandardMaterial({
    color: metal ? (base.color || 0xb39965) : felt || keycap ? (base.color || 0xd9cdb5) : 0xbd925f,
    roughness: metal ? .54 : .83, metalness: metal ? .65 : 0,
    side: T.FrontSide, opacity: base.opacity, transparent: base.transparent,
    depthWrite: base.depthWrite,
  });
  material.name = 'Physical cut surface';
  return material;
}
