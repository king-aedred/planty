"""Exportiert die Kapsel als GLB für Blender (Datei -> Importieren -> glTF 2.0).

Teile einzeln und eingefärbt: Rohr, Kopf, Platine (aus dem KiCad-STEP), Zelle, Sonde.
Explosionsansicht: Kopf mit Platine nach oben gezogen, Zelle halb heraus (Akkutausch).
Aufruf: python export_glb.py pfad/zur/platine.step [--explode]
"""
import json
import struct
import sys
from pathlib import Path

import cadquery as cq
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.gp import gp_Trsf

import callgreen_case as C

OUT = Path(__file__).parent


def fix_units(path: Path) -> None:
    """glTF rechnet in Metern, CadQuery in mm: Wurzelknoten auf 0,001 skalieren (sonst ist das Modell in Blender 160 m hoch)."""
    data = path.read_bytes()
    json_len = struct.unpack("<I", data[12:16])[0]
    gltf = json.loads(data[20 : 20 + json_len])
    for scene in gltf["scenes"]:
        for root in scene["nodes"]:
            gltf["nodes"][root]["scale"] = [0.001, 0.001, 0.001]
            # Parameter für animate_glb.mjs
            gltf["nodes"][root]["extras"] = {"window_angle": C.window_axis()[0], "bayonet_turn": C.BAYONET_TURN}
    chunk = json.dumps(gltf, separators=(",", ":")).encode()
    chunk += b" " * (-len(chunk) % 4)
    rest = data[20 + json_len :]
    body = struct.pack("<I", len(chunk)) + b"JSON" + chunk + rest
    path.write_bytes(data[:8] + struct.pack("<I", 12 + len(body)) + body)
explode = "--explode" in sys.argv
gap = 45.0 if explode else 0.0

pcb = cq.importers.importStep(sys.argv[1]).val()
t = gp_Trsf()
t.SetValues(0, 1, 0, C.PCB_EDGE_X - 10.0, 0, 0, 1, C.PCB_Y, 1, 0, 0, C.Z_PCB0 + 40.0)
pcb = cq.Shape.cast(BRepBuilderAPI_Transform(pcb.wrapped, t, True).Shape())

cell = C.cylinder(C.CELL_D / 2, C.CELL_LEN, C.Z_CELL0)
probe = C.box(-C.PROBE_W / 2, C.PROBE_W / 2, -C.PROBE_T / 2, C.PROBE_T / 2, C.Z_PROBE_TOP - 98, C.Z_PROBE_TOP)

lift = 2 * gap  # Kopf + Platine
cell_lift = gap
asm = (
    cq.Assembly(name="callgreen")
    .add(C.body(), name="Rohr", color=cq.Color(0.93, 0.93, 0.90))
    .add(C.head().translate((0, 0, lift)), name="Kopf", color=cq.Color(0.42, 0.62, 0.38))
    .add(cq.Workplane().add(pcb).translate((0, 0, lift)), name="Platine", color=cq.Color(0.10, 0.35, 0.18))
    .add(cell.translate((0, 0, cell_lift)), name="Zelle_18650", color=cq.Color(0.15, 0.30, 0.75))
    .add(probe, name="Sonde", color=cq.Color(0.12, 0.12, 0.12))
)
asm.add(C.window_plug().translate((0, 0, lift)), name="Fenster", color=cq.Color(0.96, 0.94, 0.85))
plugs = dict(C.plug_keepouts())
asm.add(plugs["Dupont-Buchse H2"].translate((0, 0, lift)), name="Dupont_H2", color=cq.Color(0.05, 0.05, 0.05))
asm.add(plugs["PH-Stecker U4"].translate((0, 0, lift)), name="PH_Stecker_U4", color=cq.Color(0.95, 0.95, 0.92))
name = "callgreen_exploded.glb" if explode else "callgreen.glb"
asm.save(str(OUT / name), tolerance=0.05, angularTolerance=0.15)
fix_units(OUT / name)
print("geschrieben:", OUT / name)
