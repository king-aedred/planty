"""Callgreen Gehäuse v5 (parametrisch, CadQuery): schlanke runde Kapsel (Ø 28), zwei Druckteile, keine Kleinteile.

Rohr (unten): Bodensensor (98 x 23 mm, 35 mm innen) in Führungsnuten, darüber die 18650-Zelle in zwei Ringen.
Kopf (oben): Platine v3 (Antenne oben) mit USB-C, Lichtfenster, Lüftung; flache Kuppel. Der Kopf wird auf den
Zapfen des Rohrs gesetzt und mit einer Achteldrehung im Uhrzeigersinn verriegelt (Bajonett, 3 Zapfen, Rastpunkt);
der Kopfrand überlappt außen wie ein Dachziegel. Kopf zurückdrehen und abziehen -> Zelle liegt frei.
Zelle federt auf gedruckten Zungen und wird vom Kopf vorgespannt; Platine rastet über die USB-Buchse ein;
Lichtfenster ist eine dünne Wandstelle (Kopf in weißem/naturfarbenem PETG drucken).
Koordinaten: Z = Längsachse (0 = Unterkante Boden), X = Breite, Y = Tiefe.
Platinenkoordinaten (KiCad-STEP): x -40..0 -> Z (Antenne oben), y 10..30 -> X, z -> Y.

Aufruf: python callgreen_case.py  -> body.stl, head.stl, case.step
Kollisionstest: python collide.py pfad/zur/platine.step
"""
import math
from pathlib import Path

import cadquery as cq

OUT = Path(__file__).parent

# --- Parameter (mm) ---
WALL = 2.0
R_IN = 12.0  # Sonde 23 mm quer (+ Spiel) bestimmt die Breite
R_OUT = R_IN + WALL
FLOOR = 2.5
BOTTOM_CHAMFER = 1.2

# Bodensensor (kapazitiv v1.2): 35 mm im Gehäuse (ab Unterkante), darüber Platz für Stecker + Kabelbogen
PROBE_W, PROBE_T, PROBE_LEN = 23.0, 1.6, 98.0
PROBE_INSIDE = 35.0
PROBE_CLEAR = 0.3
PROBE_GRIP = 0.9  # so tief greifen die Führungsnuten über die Sondenkanten
PROBE_SOCKET = (8.0, 6.0, 8.0)  # PH-Buchse oben auf der Sonde (+Y-Seite): Breite, Höhe über Platte, Länge
PROBE_PLUG_ROOM = 12.0  # PH-Stecker steht axial nach oben aus der Sonde

CELL_D, CELL_LEN = 19.0, 70.0  # geschützte 18650 inkl. Schutzschaltung
CELL_CLEAR = 0.4
CELL_PRELOAD = 0.6  # so weit drückt der Kopf die Zelle in die Federzungen (gleicht Längentoleranz aus)
SPRING_ANGLES = (30.0, 230.0, 320.0)  # Federzungen: frei von Sondennut (0°/180°), Sondenbuchse (+Y) und Kabel
CABLE_ANGLE = 135.0  # Kabelkanal (Sonde -> Platine) an der Wand, Richtung in Grad von +X
CABLE_W = 4.0

PCB_LEN, PCB_W, PCB_T = 40.0, 20.0, 1.51
PCB_Y = -1.5  # Platinenunterseite in Y (Bauteile oben/unten etwa gleich weit von der Mitte)
PCB_EDGE_X = -11.6  # USB-Kante an der Wand, damit der Stecker die Buchse erreicht
GROOVE = 0.25
RAIL_OVERLAP = 0.5
# Unter der Platine: Dupont-Buchse auf der Stiftleiste H2 (Zelle) ragt ~14 mm über die Kante, PH-Stecker der
# Sonde an U4 ~8 mm; dazu Kabelbögen
PLUG_ROOM = 22.0

# USB-C TYPE-C-31-M-12: Öffnung nur so groß wie die Buchse, außen eine flache Mulde für den Steckerkörper
USB_HOLE = (9.4, 3.8, 1.5)  # Breite (Z), Höhe (Y), Eckradius
USB_POCKET = (12.8, 7.0, 2.8)
USB_MEMBRANE = 0.7  # Restwand zwischen Mulde und Buchsenfront

# Verbindung Rohr/Kopf: Zapfen am Rohr, Kopf greift mit einem Rand darüber. Bajonett: Stifte innen am Kopfrand,
# L-Nuten außen am Zapfen. Zelle passt innen durch den Zapfen, das Sondenkabel durch eine Kerbe.
SPIGOT = 7.0
SKIRT = 1.2  # Wand des Kopfrands über dem Zapfen
FIT = 0.2
R_SPIGOT_IN = CELL_D / 2 + 0.45  # Zelle muss beim Tausch durch
BAYONET_ANGLES = (22.0, 202.0, 292.0)  # Stifte in Endlage; Nuten meiden Sondennut (0°/180°) und Kabelkerbe
BAYONET_TURN = 45.0  # Verriegeln: Achteldrehung im Uhrzeigersinn (von oben)
PIN_W, PIN_H, PIN_DEPTH = 3.0, 2.0, 0.8
PIN_Z = 3.5  # Stiftmitte über der Schulter
DETENT = 0.15  # Rastpunkt kurz vor der Endlage
R_SPIGOT = R_OUT - SKIRT - FIT
DOME_H = 9.0
DOME_CONE = 6.0  # Innenseite: 45°-Schräge bis 6 mm, darüber flache Decke (Ø 12 mm Brücke)
CRUSH_R = 0.4  # Klemmrippen: greifen 0,15 mm in die Platinenkante
# Lichtfenster: Einsatz aus naturfarbenem PETG, sitzt von außen auf einer 0,5 mm breiten Schulter
WINDOW_R = 3.5
WINDOW_LIP = 0.6  # Schulterdicke innen
WINDOW_LIP_W = 0.5
WINDOW_PRESS = 0.05  # Übermaß (Radius) für Presssitz
# Schnapphaken für die Platine (unter der +X-Kante)
HOOK_X0 = 7.35  # neben C17 (Unterseite), Nase greift 1 mm unter die Platine
HOOK_Y0 = -3.3
HOOK_T = 1.2
HOOK_LEN = 14.0

Z_PROBE_TOP = PROBE_INSIDE
Z_CELL0 = Z_PROBE_TOP + PROBE_PLUG_ROOM
Z_CELL_TOP = Z_CELL0 + CELL_LEN
Z_SHOULDER = Z_CELL_TOP - SPIGOT - 4.0  # Zapfen endet 4 mm unter dem Zellende: Zelle ragt zum Greifen heraus
Z_SPIGOT_TOP = Z_SHOULDER + SPIGOT
Z_HEAD0 = Z_SHOULDER
Z_PCB0 = Z_CELL_TOP + PLUG_ROOM
Z_PCB_TOP = Z_PCB0 + PCB_LEN
Z_HEAD_TOP = Z_PCB_TOP + 3.0


def pcb_to_case(x: float, y: float, z: float = 0.0) -> tuple[float, float, float]:
    return (PCB_EDGE_X + (y - 10.0), PCB_Y + z, Z_PCB0 + (x + 40.0))


def cylinder(r: float, h: float, z0: float = 0.0) -> cq.Workplane:
    return cq.Workplane("XY").workplane(offset=z0).circle(r).extrude(h)


def box(x0: float, x1: float, y0: float, y1: float, z0: float, z1: float) -> cq.Workplane:
    return cq.Workplane("XY").box(x1 - x0, y1 - y0, z1 - z0).translate(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))


def ledge(r_inner: float, z_top: float, flat: float, r_wall: float = R_IN + 0.5) -> cq.Workplane:
    """Ring an der Innenwand, Unterseite unter 45° (druckbar ohne Stütze)."""
    pts = [(r_inner, z_top), (r_wall, z_top), (r_wall, z_top - flat - (r_wall - r_inner)), (r_inner, z_top - flat)]
    return cq.Workplane("XZ").polyline(pts).close().revolve(360, (0, 0, 0), (0, 1, 0))


def cable_notch(z0: float, z1: float) -> cq.Workplane:
    return box(0, R_OUT, -CABLE_W / 2, CABLE_W / 2, z0, z1).rotate((0, 0, 0), (0, 0, 1), CABLE_ANGLE)


def body() -> cq.Workplane:
    cavity = cylinder(R_IN, Z_SHOULDER, FLOOR)
    b = cylinder(R_OUT, Z_SHOULDER).faces("<Z").edges().chamfer(BOTTOM_CHAMFER).cut(cavity)

    # Zapfen mit Bajonett-Nuten (senkrechter Einlauf, dann waagerecht bis zur Endlage)
    r_in_sp = R_SPIGOT_IN
    spigot = cylinder(R_SPIGOT, SPIGOT, Z_SHOULDER).cut(cylinder(r_in_sp, SPIGOT, Z_SHOULDER))
    r_groove = R_SPIGOT + FIT - PIN_DEPTH - 0.15
    zp = Z_SHOULDER + PIN_Z
    half = math.degrees((PIN_W / 2 + 0.3) / r_groove)
    for a in BAYONET_ANGLES:
        track = [(r_groove, zp - PIN_H / 2 - 1.05), (R_OUT, zp - PIN_H / 2 - 1.05), (R_OUT, zp + PIN_H / 2 + 0.15), (r_groove, zp + PIN_H / 2 + 0.15)]
        arc = cq.Workplane("XZ").polyline(track).close().revolve(BAYONET_TURN + 2 * half, (0, 0, 0), (0, 1, 0))
        spigot = spigot.cut(arc.rotate((0, 0, 0), (0, 0, 1), a - half))
        entry = box(r_groove, R_OUT, -(PIN_W / 2 + 0.3), PIN_W / 2 + 0.3, zp - PIN_H / 2 - 1.05, Z_SPIGOT_TOP + 1)
        spigot = spigot.cut(entry.rotate((0, 0, 0), (0, 0, 1), a + BAYONET_TURN))
        bump = box(r_groove - 0.1, r_groove + 0.15 + DETENT, -0.6, 0.6, zp - PIN_H / 2, zp + PIN_H / 2)
        spigot = spigot.union(bump.rotate((0, 0, 0), (0, 0, 1), a + math.degrees((PIN_W / 2 + 0.9) / r_groove)))
    # Kerbe für das Sondenkabel
    spigot = spigot.cut(box(0, R_SPIGOT - 1.6, -CABLE_W / 2, CABLE_W / 2, Z_SHOULDER - 1, Z_SPIGOT_TOP + 1).rotate((0, 0, 0), (0, 0, 1), CABLE_ANGLE))
    b = b.union(spigot)
    # Übergang Rohrwand -> Zapfen (innen 45°, druckbar)
    b = b.union(ledge(r_in_sp, Z_SHOULDER + 0.01, 0.0).intersect(cylinder(R_IN + 0.01, Z_SHOULDER, FLOOR)))
    b = b.cut(box(0, R_SPIGOT - 1.6, -CABLE_W / 2, CABLE_W / 2, Z_SHOULDER - 8, Z_SHOULDER + 1).rotate((0, 0, 0), (0, 0, 1), CABLE_ANGLE))

    # Sonde: Schlitz im Boden, Führungsnuten an beiden Kanten bis zur Oberkante
    b = b.cut(cq.Workplane("XY").box(PROBE_W + 2 * PROBE_CLEAR, PROBE_T + 2 * PROBE_CLEAR, FLOOR * 3))
    half_slot = PROBE_T / 2 + PROBE_CLEAR / 2
    for side in (-1, 1):
        x_edge = side * (PROBE_W / 2 + PROBE_CLEAR)
        x_inner = side * (PROBE_W / 2 - PROBE_GRIP)
        guide = box(min(x_inner, side * R_OUT), max(x_inner, side * R_OUT), -half_slot - 1.6, half_slot + 1.6, FLOOR, Z_PROBE_TOP)
        guide = guide.cut(box(min(x_inner, x_edge), max(x_inner, x_edge), -half_slot, half_slot, FLOOR, Z_PROBE_TOP))
        b = b.union(guide.intersect(cavity))

    # Zelle: unten drei Federzungen (wachsen 45° schräg aus der Wand, druckbar), zwei Ringe zur seitlichen Führung
    r_cell = CELL_D / 2 + CELL_CLEAR / 2
    r_wall = R_IN + 0.6
    tongue = [(r_wall, Z_CELL0 - (r_wall - 8.0)), (8.0, Z_CELL0), (6.5, Z_CELL0), (6.5, Z_CELL0 - 1.3), (r_wall, Z_CELL0 - 1.3 - (r_wall - 6.5))]
    for angle in SPRING_ANGLES:
        spring = cq.Workplane("XZ").polyline(tongue).close().extrude(2.0, both=True).rotate((0, 0, 0), (0, 0, 1), angle)
        b = b.union(spring.intersect(cavity))
    for z_top in (Z_CELL0 + 18, Z_CELL0 + CELL_LEN - 12):
        b = b.union(ledge(r_cell, z_top, 3.0).intersect(cavity))
    b = b.cut(cable_notch(Z_CELL0 - 8, Z_SHOULDER).intersect(cavity))
    # Durchgang für die Sonde beim Einsetzen von oben: Nut in der Sondenebene durch Ringe, Schulter und Zapfen
    # (der Zapfen behält außen eine Haut, damit der Ring geschlossen bleibt)
    r_key = PROBE_W / 2 + PROBE_CLEAR + 0.1
    for side in (-1, 1):
        key = box(min(side * 8.0, side * r_key), max(side * 8.0, side * r_key), -PROBE_T / 2 - 0.6, PROBE_T / 2 + 0.6, Z_PROBE_TOP, Z_SPIGOT_TOP + 1)
        b = b.cut(key)
    return b


def pcb_hook() -> cq.Workplane:
    """Schnapphaken: federnde Zunge unter der Platine (+X-Kante), Nase greift unter die untere Platinenkante.
    Beim Einschieben drückt die Platine die Nase über die 45°-Schräge zur Seite, dann schnappt sie ein.
    Lösen: Zunge von unten mit dem Finger zur Wand drücken."""
    z_b = Z_PCB0 - HOOK_LEN
    y1 = HOOK_Y0 + HOOK_T
    nose_y = PCB_Y + 1.2
    prof = [(HOOK_Y0, z_b), (y1, z_b), (y1, Z_PCB0 - 1.2 - (nose_y - y1)), (nose_y, Z_PCB0 - 1.2), (nose_y, Z_PCB0 - 0.1), (HOOK_Y0, Z_PCB0 - 0.1)]
    tongue = cq.Workplane("YZ").polyline(prof).close().extrude(PCB_EDGE_X + PCB_W - HOOK_X0).translate((HOOK_X0, 0, 0))
    # Fuß: 45° aus der Wand (druckbar), trägt die Zunge
    foot = cq.Workplane("XZ").polyline([(HOOK_X0, z_b), (R_IN + 0.5, z_b), (R_IN + 0.5, z_b - 1.5 - (R_IN + 0.5 - HOOK_X0)), (HOOK_X0, z_b - 1.5)]).close().extrude(-HOOK_T).translate((0, HOOK_Y0, 0))
    return tongue.union(foot)


def window_axis() -> tuple[float, float]:
    """Lichtfenster: radiale Achse durch die Außenwand über dem BH1750 (Winkel in Grad, Höhe)."""
    lx, _, lz = pcb_to_case(-20.6, 13.0)
    return math.degrees(math.acos(lx / R_OUT)), lz


def window_plug() -> cq.Workplane:
    """Fenstereinsatz (naturfarbenes PETG, eigener Druck): von außen eindrücken, sitzt auf einer Schulter.
    Außen bündig mit der Rundung, innen flach (darauf stehend drucken)."""
    angle, lz = window_axis()
    plug = cq.Workplane("YZ").workplane(offset=R_IN + WINDOW_LIP).circle(WINDOW_R + WINDOW_PRESS).extrude(5)
    plug = plug.intersect(cylinder(R_OUT, 20, -10))
    return plug.rotate((0, 0, 0), (0, 0, 1), angle).translate((0, 0, lz))


def bayonet_pins() -> cq.Workplane:
    """Stifte innen am Kopfrand (Endlage), Unterseite 45° angeschrägt (druckbar, findet die Nut)."""
    r_wall = R_SPIGOT + FIT
    zp = Z_SHOULDER + PIN_Z
    prof = [(r_wall + 0.1, zp - PIN_H / 2 - (PIN_DEPTH + 0.1)), (r_wall + 0.1, zp + PIN_H / 2), (r_wall - PIN_DEPTH, zp + PIN_H / 2), (r_wall - PIN_DEPTH, zp - PIN_H / 2)]
    pins = None
    for a in BAYONET_ANGLES:
        pin = cq.Workplane("XZ").polyline(prof).close().extrude(PIN_W / 2, both=True).rotate((0, 0, 0), (0, 0, 1), a)
        pins = pin if pins is None else pins.union(pin)
    return pins


def ellipsoid(r: float, h: float) -> cq.Shape:
    sphere = cq.Solid.makeSphere(r, angleDegrees1=0, angleDegrees2=90)
    return sphere.transformGeometry(cq.Matrix([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, h / r, 0]]))


def head() -> cq.Workplane:
    cavity = cylinder(R_IN, Z_HEAD_TOP - Z_HEAD0, Z_HEAD0)
    tube = cylinder(R_OUT, Z_HEAD_TOP - Z_HEAD0, Z_HEAD0).cut(cavity)
    # Rand über dem Zapfen, Übergang nach innen 45°
    r_skirt = R_SPIGOT + FIT
    z_skirt = Z_SPIGOT_TOP + 0.3
    tube = tube.cut(cylinder(r_skirt, z_skirt - Z_HEAD0, Z_HEAD0))
    tube = tube.cut(cq.Workplane().add(cq.Solid.makeCone(r_skirt, R_IN, r_skirt - R_IN, cq.Vector(0, 0, z_skirt))))
    tube = tube.union(bayonet_pins())
    inner = cq.Solid.makeCone(R_IN, R_IN - DOME_CONE, DOME_CONE)
    dome = cq.Workplane().add(ellipsoid(R_OUT, DOME_H).cut(inner)).translate((0, 0, Z_HEAD_TOP))
    h = tube.union(dome)

    # Anschlag für die Zelle: zwei Ringsegmente seitlich der Platine, Unterseite 45° (druckbar, zentriert die Zelle).
    # Die Schräge trifft die Zellkante CELL_PRELOAD unter dem Nennmaß -> Zelle sitzt vorgespannt auf den Federzungen.
    r_edge = CELL_D / 2
    z_top = Z_CELL_TOP - CELL_PRELOAD + (r_edge - 7.0) + 1.5
    stop = ledge(7.0, z_top, 1.5, R_IN + 0.5)
    for side in (-1, 1):
        h = h.union(stop.intersect(box(-4, 4, 6.0 * side, 14 * side, Z_HEAD0, z_top + 1) if side > 0 else box(-4, 4, -14, -6.0, Z_HEAD0, z_top + 1)).intersect(cavity))

    groove_y0, groove_y1 = PCB_Y - GROOVE, PCB_Y + PCB_T + GROOVE
    x_far = PCB_EDGE_X + PCB_W
    z_end = Z_PCB_TOP + GROOVE

    # -X: Leisten ober- und unterhalb der USB-Kante (Platine liegt an der Wand), oben geschlossen als Anschlag
    for y0, y1 in ((groove_y0 - 1.5, groove_y0), (groove_y1, groove_y1 + 1.5)):
        h = h.union(box(-R_OUT, PCB_EDGE_X + RAIL_OVERLAP, y0, y1, Z_PCB0, Z_HEAD_TOP).intersect(cavity))
    h = h.union(box(-R_OUT, PCB_EDGE_X + RAIL_OVERLAP, groove_y0, groove_y1, z_end, Z_HEAD_TOP).intersect(cavity))

    # +X: Schiene unter der Kante (oben stehen Bauteile bis an die Kante), seitlicher Anschlag, oben Anschlag;
    # Unterseite der Schiene 45° angeschrägt
    x0 = x_far - RAIL_OVERLAP
    prof = [(x0, Z_PCB0), (x0, Z_HEAD_TOP), (R_IN + 0.5, Z_HEAD_TOP), (R_IN + 0.5, Z_PCB0 - (R_IN + 0.5 - x0))]
    rail = cq.Workplane("XZ").polyline(prof).close().extrude(-1.5).translate((0, groove_y0 - 1.5, 0))
    fence = box(x_far + GROOVE, R_OUT, groove_y0, groove_y1 + 1.5, Z_PCB0, Z_HEAD_TOP)
    cap = box(x0, R_OUT, groove_y0, groove_y1 + 1.5, z_end, Z_HEAD_TOP)
    h = h.union(rail.union(fence).union(cap).intersect(cavity))
    h = h.cut(box(HOOK_X0 - 0.5, R_IN + 1, HOOK_Y0 - 2.5, groove_y0 + 0.01, Z_PCB0 - HOOK_LEN - 8, Z_PCB0).intersect(cavity))
    h = h.union(pcb_hook().intersect(cylinder(R_IN + 0.5, Z_HEAD_TOP, 0)))
    # Klemmrippen am seitlichen Anschlag: drücken die Platine gegen die Wand und halten sie per Reibung (kein Kleber).
    # Sie verformen sich beim ersten Einschieben etwas und gleichen so Drucktoleranzen aus.
    for z0 in (Z_PCB0 + 4, Z_PCB0 + 24):
        rib = cylinder(CRUSH_R, 12, z0).translate((x_far + GROOVE, PCB_Y + PCB_T / 2, 0))
        h = h.union(rib.intersect(cavity))

    # USB-C: innen Freiraum für die Buchse, dünne Restwand mit knapper Öffnung, außen flache Mulde
    usb_z = (pcb_to_case(-27.47, 10)[2] + pcb_to_case(-18.53, 10)[2]) / 2
    usb_y = PCB_Y + (-3.335 + 0.765) / 2
    front = PCB_EDGE_X - 0.07
    h = h.cut(box(front - 0.05, front + 9, PCB_Y - 3.6, PCB_Y + 1.0, usb_z - 5.0, usb_z + 5.0))
    # Laufbahn für die Buchse beim Einschieben der Platine von unten (Wand dort ca. 1,4 mm)
    h = h.cut(box(front - 0.3, front + 8.5, PCB_Y - 3.65, PCB_Y + 1.1, Z_HEAD0 - 1, usb_z + 4.5))
    hole_w, hole_h, hole_r = USB_HOLE
    h = h.cut(cq.Workplane("YZ").rect(hole_h, hole_w).extrude(10).edges("|X").fillet(hole_r).translate((front - 10, usb_y, usb_z)))
    pw, ph, pr = USB_POCKET
    h = h.cut(cq.Workplane("YZ").rect(ph, pw).extrude(10).edges("|X").fillet(pr).translate((front - USB_MEMBRANE - 10, usb_y, usb_z)))

    # Lichtfenster über dem BH1750: Bohrung mit innerer Schulter für den Fenstereinsatz (window_plug)
    angle, lz = window_axis()
    seat = cq.Workplane("YZ").workplane(offset=R_IN + WINDOW_LIP).circle(WINDOW_R).extrude(10)
    through = cq.Workplane("YZ").circle(WINDOW_R - WINDOW_LIP_W).extrude(R_OUT + 5)
    h = h.cut(seat.union(through).rotate((0, 0, 0), (0, 0, 1), angle).translate((0, 0, lz)))

    # Lüftung für den AHT20 (Unterseite, -Y), waagerechte Schlitze
    ax, _, az = pcb_to_case(-38.4, 13.95)
    for i in range(4):
        vent = cq.Workplane("XZ").rect(9.0, 1.2).extrude(-20).edges("|Y").fillet(0.55).translate((ax + 3.0, -R_OUT - 5, az - 3 + i * 2.6))
        h = h.cut(vent)
    return h


def probe_with_socket() -> cq.Workplane:
    """Sonde in Endlage inkl. PH-Buchse oben auf der +Y-Seite (für Einsetz-Test)."""
    sw, sh, sl = PROBE_SOCKET
    probe = box(-PROBE_W / 2, PROBE_W / 2, -PROBE_T / 2, PROBE_T / 2, Z_PROBE_TOP - PROBE_LEN, Z_PROBE_TOP)
    socket = box(-sw / 2, sw / 2, PROBE_T / 2, PROBE_T / 2 + sh, Z_PROBE_TOP - sl, Z_PROBE_TOP + 2)
    return probe.union(socket)


def plug_keepouts() -> list[tuple[str, cq.Workplane]]:
    """Freiräume für Stecker und Kabelbögen unter der Platine (für den Kollisionstest)."""
    x0, _, _ = pcb_to_case(-40, 10.6)
    _, _, z_edge = pcb_to_case(-40, 10)
    dupont = box(x0 + 0.4, pcb_to_case(-40, 19.0)[0] + 1.3, PCB_Y + PCB_T - 0.3, PCB_Y + PCB_T + 2.9, z_edge - 15.0, z_edge + 2.0)
    ph = box(pcb_to_case(-40, 21.5)[0], pcb_to_case(-40, 29.3)[0], PCB_Y + PCB_T, PCB_Y + PCB_T + 4.8, z_edge - 9.0, z_edge + 2.0)
    bend = cylinder(7.0, 4.5, z_edge - 19.5).intersect(box(-12, 9, -6, 6, z_edge - 19.5, z_edge - 15.0))
    return [("Dupont-Buchse H2", dupont), ("PH-Stecker U4", ph), ("Kabelbögen", bend)]


if __name__ == "__main__":
    b, h = body(), head()
    cq.exporters.export(b, str(OUT / "body.stl"), tolerance=0.02, angularTolerance=0.1)
    cq.exporters.export(h, str(OUT / "head.stl"), tolerance=0.02, angularTolerance=0.1)
    cq.exporters.export(window_plug(), str(OUT / "window.stl"), tolerance=0.01, angularTolerance=0.1)
    cq.exporters.export(cq.Assembly().add(b, name="body").add(h, name="head").add(window_plug(), name="window").toCompound(), str(OUT / "case.step"))
    print(f"Außen Ø {2 * R_OUT:.1f} x {Z_HEAD_TOP + DOME_H:.1f} mm, Sonde ragt {PROBE_LEN - PROBE_INSIDE:.0f} mm heraus")
    print(f"Rohr 0..{Z_SPIGOT_TOP:.1f}, Kopf {Z_SHOULDER:.1f}..{Z_HEAD_TOP + DOME_H:.1f}, Zelle {Z_CELL0:.1f}..{Z_CELL_TOP:.1f}")
