"""Validate the checked-in GLBs without installing frontend dependencies.

Run: python3 -m unittest discover -s frontend/scripts -p 'test_*.py'
"""
import json
import math
from pathlib import Path
import struct
import unittest


ASSETS = Path(__file__).resolve().parents[1] / 'src' / 'assets'
FORMATS = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


class GLB:
    def __init__(self, path):
        self.data = path.read_bytes()
        magic, version, length = struct.unpack_from('<4sII', self.data)
        assert (magic, version, length) == (b'glTF', 2, len(self.data))
        size, kind = struct.unpack_from('<I4s', self.data, 12)
        assert kind == b'JSON' and size % 4 == 0
        self.doc = json.loads(self.data[20:20 + size])
        bin_size, kind = struct.unpack_from('<I4s', self.data, 20 + size)
        assert kind == b'BIN\0' and bin_size % 4 == 0
        self.binary = self.data[28 + size:]
        assert len(self.binary) == bin_size

    def accessor(self, index):
        item = self.doc['accessors'][index]
        view = self.doc['bufferViews'][item['bufferView']]
        fmt = '<' + FORMATS[item['componentType']] * WIDTHS[item['type']]
        size = struct.calcsize(fmt)
        offset = item.get('byteOffset', 0)
        stride = view.get('byteStride', size)
        assert offset + (item['count'] - 1) * stride + size <= view['byteLength']
        start = view.get('byteOffset', 0) + offset
        assert start % struct.calcsize(FORMATS[item['componentType']]) == 0
        return [struct.unpack_from(fmt, self.binary, start + i * stride)
                for i in range(item['count'])]


class SceneAssetsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.character = GLB(ASSETS / 'rock-character.glb')
        cls.garden = GLB(ASSETS / 'garden-diorama.glb')

    def test_embedded_buffers_and_valid_mesh_data(self):
        for asset in (self.character, self.garden):
            doc = asset.doc
            self.assertEqual(len(doc['buffers']), 1)
            self.assertNotIn('uri', doc['buffers'][0])
            self.assertLessEqual(doc['buffers'][0]['byteLength'], len(asset.binary))
            for view in doc['bufferViews']:
                self.assertEqual(view['buffer'], 0)
                self.assertLessEqual(view.get('byteOffset', 0) + view['byteLength'],
                                     doc['buffers'][0]['byteLength'])
            for image in doc.get('images', []):
                self.assertNotIn('uri', image)
                self.assertEqual(image['mimeType'], 'image/png')
                view = doc['bufferViews'][image['bufferView']]
                start = view['byteOffset']
                self.assertEqual(asset.binary[start:start + 8], b'\x89PNG\r\n\x1a\n')
            for index in range(len(doc['accessors'])):
                for row in asset.accessor(index):
                    self.assertTrue(all(math.isfinite(value) for value in row))
            for mesh in doc['meshes']:
                for primitive in mesh['primitives']:
                    self.assertEqual(primitive.get('mode', 4), 4)
                    attrs = primitive['attributes']
                    positions = asset.accessor(attrs['POSITION'])
                    indices = asset.accessor(primitive['indices'])
                    self.assertEqual(len(indices) % 3, 0)
                    self.assertTrue(all(0 <= i[0] < len(positions) for i in indices))
                    for index in attrs.values():
                        self.assertEqual(doc['accessors'][index]['count'], len(positions))
                    for normal in asset.accessor(attrs['NORMAL']):
                        self.assertAlmostEqual(sum(v * v for v in normal), 1, places=4)
                    bounds = doc['accessors'][attrs['POSITION']]
                    for axis in range(3):
                        self.assertAlmostEqual(min(p[axis] for p in positions),
                                               bounds['min'][axis], places=5)
                        self.assertAlmostEqual(max(p[axis] for p in positions),
                                               bounds['max'][axis], places=5)

    def test_skin_bind_pose_and_stationary_torso(self):
        asset = self.character
        doc = asset.doc
        skin = doc['skins'][0]
        joints = skin['joints']
        names = [doc['nodes'][i]['name'] for i in joints]
        self.assertEqual(names, ['Root', 'UpperArm_L', 'Forearm_L',
                                 'UpperArm_R', 'Forearm_R'])
        parents = {child: i for i, node in enumerate(doc['nodes'])
                   for child in node.get('children', [])}

        def world_position(index):
            position = doc['nodes'][index].get('translation', [0, 0, 0])
            if index in parents:
                position = [a + b for a, b in zip(position, world_position(parents[index]))]
            return position

        inverse_bind = asset.accessor(skin['inverseBindMatrices'])
        self.assertEqual(len(inverse_bind), len(joints))
        for joint, matrix in zip(joints, inverse_bind):
            expected = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0,
                        *[-v for v in world_position(joint)], 1]
            for actual, value in zip(matrix, expected):
                self.assertAlmostEqual(actual, value, places=6)
        attrs = doc['meshes'][0]['primitives'][0]['attributes']
        positions = asset.accessor(attrs['POSITION'])
        weights = asset.accessor(attrs['WEIGHTS_0'])
        indices = asset.accessor(attrs['JOINTS_0'])
        arm_vertices = 0
        for (x, y, z), row, ids in zip(positions, weights, indices):
            self.assertAlmostEqual(sum(row), 1, places=6)
            self.assertTrue(all(0 <= w <= 1 for w in row))
            self.assertTrue(all(i < len(joints) for i in ids))
            if y > 1.1 or y < -.4 or (abs(x) < .33 and y < .5):
                self.assertEqual(row[0], 1, 'Torso, legs and head must not follow arms')
            if abs(x) > .43 and -.2 < y < .55:
                arm_vertices += 1
                self.assertLess(row[0], .1)
        self.assertGreater(arm_vertices, 0, 'The arm-weight checks must cover vertices')

    def test_render_and_transfer_budget(self):
        assets = (self.character, self.garden)
        self.assertLess(sum(len(asset.data) for asset in assets), 2_000_000)
        triangles = 0
        draws = 0
        for asset in assets:
            self.assertNotIn('animations', asset.doc)
            for mesh in asset.doc['meshes']:
                for primitive in mesh['primitives']:
                    triangles += asset.doc['accessors'][primitive['indices']]['count'] // 3
                    material = asset.doc['materials'][primitive['material']]
                    draws += 2 if material.get('doubleSided') and material.get('alphaMode') == 'BLEND' else 1
        self.assertLessEqual(triangles, 60_000)
        self.assertLessEqual(draws, 4)


if __name__ == '__main__':
    unittest.main()
