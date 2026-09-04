export function footstepDirection(
  listener: { x: number; z: number; yaw: number },
  source: { x: number; z: number },
) {
  const dx = source.x - listener.x,
    dz = source.z - listener.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.3 || distance > 28) return null;
  const angle = ((Math.atan2(dx, -dz) + listener.yaw) * 180) / Math.PI;
  return { angle, strength: Math.max(0.25, 1 - distance / 32) };
}
