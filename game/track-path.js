export function createRoundedTrackPath({
  straightHalf = 0.68,
  radius = 0.22,
  centerY = -0.2,
} = {}) {
  const straightLength = straightHalf * 2;
  const arcLength = Math.PI * radius;
  const perimeter = straightLength * 2 + arcLength * 2;
  const top = centerY + radius;
  const bottom = centerY - radius;

  function pointAt(distance) {
    let d = ((distance % perimeter) + perimeter) % perimeter;

    if (d < straightLength) {
      return { x: -straightHalf + d, y: top, angle: 0 };
    }
    d -= straightLength;

    if (d < arcLength) {
      const angle = Math.PI / 2 - d / radius;
      return {
        x: straightHalf + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        angle: angle - Math.PI / 2,
      };
    }
    d -= arcLength;

    if (d < straightLength) {
      return { x: straightHalf - d, y: bottom, angle: Math.PI };
    }
    d -= straightLength;

    const angle = -Math.PI / 2 - d / radius;
    return {
      x: -straightHalf + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      angle: angle - Math.PI / 2,
    };
  }

  return { perimeter, pointAt };
}

export function createPolylineTrackPath(points) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error("A closed track path needs at least three points.");
  }
  const segments = [];
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({ from, to, start: perimeter, length });
    perimeter += length;
  }

  function pointAt(distance) {
    const d = ((distance % perimeter) + perimeter) % perimeter;
    let low = 0;
    let high = segments.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high + 1) / 2);
      if (segments[middle].start <= d) low = middle;
      else high = middle - 1;
    }
    const segment = segments[low];
    const t = segment.length > 1e-9 ? (d - segment.start) / segment.length : 0;
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    return {
      x: segment.from.x + dx * t,
      y: segment.from.y + dy * t,
      angle: Math.atan2(dy, dx),
    };
  }

  return { perimeter, pointAt };
}
