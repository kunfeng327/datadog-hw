// A bounded animation state machine, independent of React and rendering.
export const ACTION_DURATION = 2200
export const SPIN_DURATION = 900
export const REST_YAW = -0.12
const POSES = {
  pose: {
    left: 1.35,
    leftElbow: 0.1,
    right: 0.12,
    rightElbow: 0.1,
    lean: -0.06,
  },
  flex: { left: 1.35, leftElbow: 0.28, right: 1.35, rightElbow: 0.28, lean: 0 },
  celebrate: {
    left: 2.55,
    leftElbow: 0.15,
    right: 2.55,
    rightElbow: 0.15,
    lean: 0,
  },
}

export function createMotion() {
  return { action: null, actionAt: null, spinAt: null }
}

export function playAction(state, action, now) {
  if (!Object.hasOwn(POSES, action)) return false
  state.action = action
  state.actionAt = now
  return true
}

export function advanceMotion(state, model, group, now) {
  if (state.actionAt === null && state.spinAt === null) return false
  const actionProgress =
    state.actionAt === null
      ? 1
      : Math.min(Math.max(0, now - state.actionAt) / ACTION_DURATION, 1)
  const spinProgress =
    state.spinAt === null
      ? 0
      : Math.min(Math.max(0, now - state.spinAt) / SPIN_DURATION, 1)
  const envelope = actionProgress < 1 ? Math.sin(actionProgress * Math.PI) : 0
  const pose = POSES[state.action]

  model.left.rotation.z = -(pose?.left ?? 0) * envelope
  model.leftElbow.rotation.z = -(pose?.leftElbow ?? 0) * envelope
  model.right.rotation.z = (pose?.right ?? 0) * envelope
  model.rightElbow.rotation.z = (pose?.rightElbow ?? 0) * envelope
  group.rotation.z = (pose?.lean ?? 0) * envelope
  group.position.y =
    state.action === 'celebrate'
      ? Math.abs(Math.sin(actionProgress * Math.PI * 5)) * 0.18 * envelope
      : 0
  group.rotation.y =
    REST_YAW +
    (spinProgress < 1
      ? spinProgress * spinProgress * (3 - 2 * spinProgress) * Math.PI * 2
      : 0) +
    (state.action === 'celebrate' && actionProgress < 1
      ? actionProgress * Math.PI * 2
      : 0)

  if (actionProgress === 1) {
    state.actionAt = null
    state.action = null
  }
  if (spinProgress === 1) state.spinAt = null
  return state.actionAt !== null || state.spinAt !== null
}
