import type { PlayerPose } from './multiplayer.ts';

// Corrections are not player movement. Remember how much correction has already
// been applied since each pose, so delayed acknowledgments cannot apply it again.
export class PositionHistory {
  x = 0;
  z = 0;
  poses = new WeakMap<PlayerPose, { x: number; z: number }>();

  record(pose: PlayerPose) {
    this.poses.set(pose, { x: this.x, z: this.z });
    return pose;
  }

  applied(x: number, z: number) {
    this.x += x;
    this.z += z;
  }

  error(server: { x: number; z: number }, pose: PlayerPose) {
    const at = this.poses.get(pose);
    if (!at) return;
    return {
      x: server.x - pose.x - (this.x - at.x),
      z: server.z - pose.z - (this.z - at.z),
    };
  }

  reset() {
    this.x = this.z = 0;
    this.poses = new WeakMap();
  }
}
