// Baut aus callgreen.glb eine Zusammenbau-Animation (callgreen_assembly.glb), abspielbar in Blender
// (glTF importieren, Leertaste) und jedem glTF-Viewer. Benötigt: npm i @gltf-transform/core
// Aufruf: node animate_glb.mjs
// Bewegungen in mm im Modellkoordinatensystem (Z = Längsachse); der Wurzelknoten skaliert auf Meter.
import { NodeIO } from '@gltf-transform/core'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const io = new NodeIO()
const doc = await io.read(path.join(dir, 'callgreen.glb'))
const root = doc.getRoot()
const buffer = root.listBuffers()[0]
const extras = root.listScenes()[0].listChildren()[0].getExtras()
const node = (name) => root.listNodes().find((n) => n.getName() === name)

// Kopf seitlich geparkt, Platine kommt von unten hinein, dann wandert der Kopf aufs Rohr.
const HEAD_PARK = [45, 0, 70]
const at = (offset) => offset
const add = (a, b) => a.map((v, i) => v + b[i])

// Keyframes je Teil: [Zeit s, Versatz zur Endlage]
const tracks = {
  Sonde: [[0, [0, 0, 200]], [1, [0, 0, 200]], [4, [0, 0, 0]]],
  Zelle_18650: [[0, [-45, 0, 40]], [4.2, [-45, 0, 40]], [5.4, [0, 0, 130]], [7, [0, 0, 0]]],
  Kopf: [[0, HEAD_PARK], [11, HEAD_PARK], [12.5, [0, 0, HEAD_PARK[2]]], [14.5, [0, 0, 0]]],
  Platine: [[0, add(HEAD_PARK, [0, 0, -70])], [7.5, add(HEAD_PARK, [0, 0, -70])], [10, HEAD_PARK], [11, HEAD_PARK], [12.5, [0, 0, HEAD_PARK[2]]], [14.5, [0, 0, 0]]],
}
// Fenstereinsatz: wird von außen in den (verdrehten) Kopf gedrückt, danach fährt er mit dem Kopf
{
  const a = ((extras.window_angle + extras.bayonet_turn) * Math.PI) / 180
  const out = [30 * Math.cos(a), 30 * Math.sin(a), 0]
  tracks.Fenster = [[0, add(HEAD_PARK, out)], [6, add(HEAD_PARK, out)], [7.2, HEAD_PARK], [11, HEAD_PARK], [12.5, [0, 0, HEAD_PARK[2]]], [14.5, [0, 0, 0]]]
}
// Stecker: erscheinen unter dem Kopf und werden von unten aufgesteckt
for (const name of ['Dupont_H2', 'PH_Stecker_U4']) {
  tracks[name] = [[0, add(HEAD_PARK, [0, 0, -25])], [10, add(HEAD_PARK, [0, 0, -25])], [10.8, HEAD_PARK], [11, HEAD_PARK], [12.5, [0, 0, HEAD_PARK[2]]], [14.5, [0, 0, 0]]]
}
const END = 18
// Bajonett: Kopf (mit Platine und Steckern) kommt um 45° verdreht an und wird im Uhrzeigersinn verriegelt
const TURN = extras.bayonet_turn
const rotTracks = { t0: 14.6, t1: 16 }
const quat = (deg) => [0, 0, Math.sin((deg * Math.PI) / 360), Math.cos((deg * Math.PI) / 360)]

const anim = doc.createAnimation('Zusammenbau')
for (const [name, keys] of Object.entries(tracks)) {
  const n = node(name)
  if (!n) throw new Error(`Knoten fehlt: ${name}`)
  const all = [...keys, [END, keys[keys.length - 1][1]]]
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(all.map(([t]) => t))).setBuffer(buffer)
  const output = doc.createAccessor().setType('VEC3').setArray(new Float32Array(all.flatMap(([, v]) => at(v)))).setBuffer(buffer)
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR')
  anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(n).setTargetPath('translation').setSampler(sampler))
  n.setTranslation(all[0][1])
}
for (const name of ['Kopf', 'Platine', 'Dupont_H2', 'PH_Stecker_U4', 'Fenster']) {
  const keys = [[0, TURN], [rotTracks.t0, TURN], [rotTracks.t1, 0], [END, 0]]
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(keys.map(([t]) => t))).setBuffer(buffer)
  const output = doc.createAccessor().setType('VEC4').setArray(new Float32Array(keys.flatMap(([, d]) => quat(d)))).setBuffer(buffer)
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR')
  anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node(name)).setTargetPath('rotation').setSampler(sampler))
  node(name).setRotation(quat(TURN))
}
// Stecker bis zum Aufstecken unsichtbar (Skalierung 0 -> 1, sprunghaft)
for (const name of ['Dupont_H2', 'PH_Stecker_U4']) {
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 10, END])).setBuffer(buffer)
  const output = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 1, 1, 1, 1, 1])).setBuffer(buffer)
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('STEP')
  anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node(name)).setTargetPath('scale').setSampler(sampler))
}

// Rohr und Kopf halbtransparent, damit man das Innenleben sieht
for (const name of ['Rohr', 'Kopf']) {
  for (const prim of node(name).getMesh().listPrimitives()) {
    const mat = prim.getMaterial()
    const c = mat.getBaseColorFactor()
    mat.setBaseColorFactor([c[0], c[1], c[2], 0.35]).setAlphaMode('BLEND').setDoubleSided(true)
  }
}

await io.write(path.join(dir, 'callgreen_assembly.glb'), doc)
console.log('geschrieben: callgreen_assembly.glb, Dauer', END, 's')
