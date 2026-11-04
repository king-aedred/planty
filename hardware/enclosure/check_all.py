"""Prüft Endlagen und Einbauwege aller Teile gegen Rohr und Kopf.
Aufruf: python check_all.py pfad/zur/platine.step
Erwartete Überschneidungen (gewollt) sind markiert; alles andere sollte 0 sein."""
import math
import sys
from pathlib import Path

import cadquery as cq
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.gp import gp_Trsf

sys.path.insert(0, str(Path(__file__).parent))
import callgreen_case as C

b, h = C.body().val(), C.head().val()
vol = lambda a, x: round(a.intersect(x).Volume(), 3)
rot = lambda s, a: s.rotate(cq.Vector(0, 0, 0), cq.Vector(0, 0, 1), a)
rows = []


def row(name, value, expect_zero=True):
    ok = (value == 0) if expect_zero else (value > 0)
    rows.append((("OK " if ok else "!! ") + name, value, "" if expect_zero else "(gewollt > 0)"))


def column(bb, z_top):
    return C.box(bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin, z_top).val()


# Sonde: Endlage und Einsetzen von oben (inkl. Buchse)
probe = C.probe_with_socket().val()
row("Sonde Endlage ∩ Rohr", vol(probe, b))
sw, sh, sl = C.PROBE_SOCKET
blade = C.box(-C.PROBE_W / 2, C.PROBE_W / 2, -C.PROBE_T / 2, C.PROBE_T / 2, C.Z_PROBE_TOP - C.PROBE_LEN, C.Z_SPIGOT_TOP + 120).val()
socket = C.box(-sw / 2, sw / 2, C.PROBE_T / 2, C.PROBE_T / 2 + sh, C.Z_PROBE_TOP - sl, C.Z_SPIGOT_TOP + 120).val()
row("Sonde Einsetzweg von oben ∩ Rohr (Platte)", vol(blade, b))
row("Sonde Einsetzweg von oben ∩ Rohr (Buchse)", vol(socket, b))

# Zelle: Nennlage (Kopf spannt vor), eingefedert, Tauschweg
cell = C.cylinder(C.CELL_D / 2, C.CELL_LEN, C.Z_CELL0).val()
cell_pre = C.cylinder(C.CELL_D / 2, C.CELL_LEN, C.Z_CELL0 - C.CELL_PRELOAD).val()
row("Zelle Nennlage ∩ Rohr", vol(cell, b))
row("Zelle Nennlage ∩ Kopf (Vorspannung)", vol(cell, h), expect_zero=False)
row("Zelle eingefedert ∩ Kopf", vol(cell_pre, h))
row("Zelle eingefedert ∩ Rohr (Federzungen)", vol(cell_pre, b), expect_zero=False)
row("Zelle Tauschweg nach oben ∩ Rohr", vol(C.cylinder(C.CELL_D / 2, 150, C.Z_CELL0).val(), b))

# Sondenkabel an der Wand (Ø 1,2)
a = math.radians(C.CABLE_ANGLE)
r = C.CELL_D / 2 + 0.7
cable = cq.Workplane("XY").workplane(offset=C.Z_PROBE_TOP).center(r * math.cos(a), r * math.sin(a)).circle(0.6).extrude(C.Z_PCB0 - C.Z_PROBE_TOP).val()
row("Sondenkabel ∩ Rohr", vol(cable, b))
row("Sondenkabel ∩ Kopf", vol(cable, h))

# Stecker unter der Platine
for name, s in C.plug_keepouts():
    row(f"{name} ∩ Kopf", vol(s.val(), h))
    row(f"{name} ∩ Zelle", vol(s.val(), cell))

# Platine aus dem KiCad-STEP
pcb = cq.importers.importStep(sys.argv[1]).val()
t = gp_Trsf()
t.SetValues(0, 1, 0, C.PCB_EDGE_X - 10.0, 0, 0, 1, C.PCB_Y, 1, 0, 0, C.Z_PCB0 + 40.0)
pcb = cq.Shape.cast(BRepBuilderAPI_Transform(pcb.wrapped, t, True).Shape())
solids = sorted(pcb.Solids(), key=lambda s: -s.Volume())
board, parts = solids[0], solids[1:]
row("Platine (Bauteile) Endlage ∩ Kopf", sum(vol(s, h) for s in parts))
row("Platine (Leiterplatte) Endlage ∩ Kopf (Klemmrippen)", vol(board, h), expect_zero=False)
travel = C.Z_PCB0 - C.Z_HEAD0 + 5
def sweep_hit(s):
    """Einschiebeweg eines Bauteils: erst grob per Quader, bei Treffer genau in 1-mm-Schritten mit der echten Form."""
    bb = s.BoundingBox()
    if vol(C.box(bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin - travel, bb.zmin).val(), h) == 0:
        return 0.0
    return max(vol(s.translate(cq.Vector(0, 0, -dz)), h) for dz in range(0, int(travel) + 1))


sweep_parts = sum(sweep_hit(s) for s in parts)
row("Platine Einschiebeweg (Bauteile) ∩ Kopf", sweep_parts)
bb = board.BoundingBox()
row("Platine Einschiebeweg (Leiterplatte) ∩ Kopf (Schnapphaken-Nase)", vol(C.box(bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin - travel, bb.zmin).val(), h), expect_zero=False)

# Bajonett
pins = C.bayonet_pins().val()
row("Bajonett Endlage ∩ Rohr", vol(pins, b))
row("Bajonett Absenken (Einlaufstellung) ∩ Rohr", max(vol(rot(pins, C.BAYONET_TURN).translate(cq.Vector(0, 0, dz)), b) for dz in (12, 8, 5, 3, 2, 1, 0)))
turn = [vol(rot(pins, ang), b) for ang in range(int(C.BAYONET_TURN), -1, -3)]
row("Bajonett Drehen: Rastpunkt vorhanden", max(turn), expect_zero=False)
row("Kopf ∩ Rohr (Endlage)", vol(h, b))

# Fenstereinsatz
plug = C.window_plug().val()
row("Fenster ∩ Kopf (Presssitz)", vol(plug, h), expect_zero=False)
row("Fenster ∩ Platine", sum(vol(plug, s) for s in pcb.Solids()))

w = max(len(r[0]) for r in rows)
for name, value, note in rows:
    print(f"{name:<{w}}  {value:>9}  {note}")
print("\nErgebnis:", "alles wie erwartet" if all(r[0].startswith("OK") for r in rows) else "PROBLEME (siehe !!)")
