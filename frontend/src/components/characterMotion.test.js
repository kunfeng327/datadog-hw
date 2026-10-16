import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTION_DURATION,
  SPIN_DURATION,
  REST_YAW,
  createMotion,
  playAction,
  advanceMotion,
} from './characterMotion.js'

function fixture() {
  const model = Object.fromEntries(
    ['left', 'leftElbow', 'right', 'rightElbow'].map((name) => [
      name,
      { rotation: { z: 0 } },
    ]),
  )
  const group = { position: { y: 0 }, rotation: { y: REST_YAW, z: 0 } }
  return { state: createMotion(), model, group }
}
function assertRest(model, group) {
  for (const bone of Object.values(model))
    assert.equal(Math.abs(bone.rotation.z), 0)
  assert.equal(group.position.y, 0)
  assert.equal(group.rotation.y, REST_YAW)
  assert.equal(Math.abs(group.rotation.z), 0)
}

test('rest does not request frames or mutate the model', () => {
  const { state, model, group } = fixture()
  for (let now = 0; now < 60000; now += 1000)
    assert.equal(advanceMotion(state, model, group, now), false)
  assertRest(model, group)
  assert.equal(playAction(state, 'unknown', 0), false)
  assert.equal(playAction(state, 'toString', 0), false)
})

for (const action of ['pose', 'flex', 'celebrate']) {
  test(`${action} moves the rig and stops at rest after its deadline`, () => {
    const { state, model, group } = fixture()
    assert.equal(playAction(state, action, 100), true)
    assert.equal(
      advanceMotion(state, model, group, 100 + ACTION_DURATION / 2),
      true,
    )
    assert(model.left.rotation.z < -1)
    assert(model.right.rotation.z > 0)
    assert.equal(
      advanceMotion(state, model, group, 100 + ACTION_DURATION),
      false,
    )
    assertRest(model, group)
    assert.equal(advanceMotion(state, model, group, 60000), false)
  })
}

test('rotation makes one turn and stops without retaining a large Euler angle', () => {
  const { state, model, group } = fixture()
  state.spinAt = 100
  assert.equal(
    advanceMotion(state, model, group, 100 + SPIN_DURATION / 2),
    true,
  )
  assert(Math.abs(group.rotation.y - REST_YAW - Math.PI) < 1e-10)
  assert.equal(advanceMotion(state, model, group, 100 + SPIN_DURATION), false)
  assertRest(model, group)
})

test('overlapping actions, retriggers, and a hidden-tab time jump remain bounded', () => {
  const { state, model, group } = fixture()
  playAction(state, 'celebrate', 0)
  state.spinAt = 200
  assert.equal(advanceMotion(state, model, group, 1200), true)
  assert.equal(state.spinAt, null)
  playAction(state, 'pose', 1500)
  assert.equal(advanceMotion(state, model, group, 2300), true)
  assert.equal(advanceMotion(state, model, group, 120000), false)
  assertRest(model, group)
})
