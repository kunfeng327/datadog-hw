import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import characterUrl from '../assets/rock-character.glb?url'

import {
  createMotion,
  playAction,
  advanceMotion,
  REST_YAW,
} from './characterMotion.js'

export { characterUrl }

// The bundled mesh has a continuous sculpted surface and a five-joint arm rig.
// Only short, explicitly requested actions invalidate frames; rest is static.
export default memo(function RockModel({ action, actionKey, spinKey }) {
  const { scene } = useGLTF(characterUrl)
  const invalidate = useThree((state) => state.invalidate)
  const group = useRef(null)
  const animation = useRef(createMotion())
  const model = useMemo(() => {
    // Clone the skeleton, sharing immutable geometry/materials in the loader cache.
    const root = clone(scene)
    return {
      root,
      left: root.getObjectByName('UpperArm_L'),
      leftElbow: root.getObjectByName('Forearm_L'),
      right: root.getObjectByName('UpperArm_R'),
      rightElbow: root.getObjectByName('Forearm_R'),
    }
  }, [scene])

  useEffect(() => {
    if (actionKey && playAction(animation.current, action, performance.now()))
      invalidate()
  }, [action, actionKey, invalidate])

  useEffect(() => {
    if (!spinKey) return
    animation.current.spinAt = performance.now()
    invalidate()
  }, [spinKey, invalidate])

  useFrame(() => {
    if (
      group.current &&
      advanceMotion(animation.current, model, group.current, performance.now())
    )
      invalidate()
  })

  return (
    <group ref={group} rotation={[0, REST_YAW, 0]} dispose={null}>
      <primitive object={model.root} dispose={null} />
    </group>
  )
})
