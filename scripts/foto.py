"""Maakt van de politiefoto een FreeCell-foto voor de landingspagina.

Elk stuk tekst waar POLITIE staat wordt overgeschilderd met de achtergrondkleur
van dat vlak en vervangen door FREECELL, in hetzelfde perspectief. De bron
(assets/jacqueline.jpeg) blijft ongemoeid; het resultaat is
assets/agent-freecell.jpg.

Uitvoeren:  python scripts/foto.py
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os, random, statistics

HIER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRON = os.path.join(HIER, "assets", "jacqueline.jpeg")
DOEL = os.path.join(HIER, "assets", "agent-freecell.jpg")
VET = "C:/Windows/Fonts/arialbd.ttf"
ZWART = "C:/Windows/Fonts/ariblk.ttf"

random.seed(7)


# ---------------------------------------------------------------- perspectief
def perspectief_coeffs(doel, bron):
    """Coëfficiënten voor Image.transform(PERSPECTIVE): doel -> bron."""
    m = []
    for (x, y), (u, v) in zip(doel, bron):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
        m.append([0, 0, 0, x, y, 1, -v * x, -v * y, v])
    # 8x9 stelsel oplossen met Gauss-Jordan
    for i in range(8):
        p = max(range(i, 8), key=lambda r: abs(m[r][i]))
        m[i], m[p] = m[p], m[i]
        d = m[i][i]
        m[i] = [w / d for w in m[i]]
        for r in range(8):
            if r == i:
                continue
            f = m[r][i]
            if f:
                m[r] = [a - f * b for a, b in zip(m[r], m[i])]
    return [rij[8] for rij in m]


def plak_tekst(foto, tekst, hoeken, font_pad, kleur=(252, 252, 250),
               schaduw=(0, 0, 0, 90), marge=0.06, blur=0.8, spatie=0):
    """Zet tekst in het vlak dat door vier hoeken wordt opgespannen.

    hoeken: linksboven, rechtsboven, rechtsonder, linksonder (in de foto).
    De tekst wordt eerst recht getekend en daarna in perspectief gelegd, zodat
    hij vanzelf meeloopt met het vlak: naar achteren kleiner, naar voren groter.
    """
    # De laag krijgt dezelfde verhouding als het doelvlak, anders wordt een
    # smal teken (zoals een schoppen) door de perspectiefstap platgedrukt.
    lb0, rb0, ro0, lo0 = hoeken
    breed = (abs(rb0[0] - lb0[0]) + abs(ro0[0] - lo0[0])) / 2
    hoog = (abs(lo0[1] - lb0[1]) + abs(ro0[1] - rb0[1])) / 2
    H = 400
    W = max(120, int(H * breed / max(1.0, hoog)))
    laag = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(laag)
    grootte = max(8, int(H * (1 - 2 * marge)))
    f = ImageFont.truetype(font_pad, grootte)
    if spatie:
        tekst = (" " * spatie).join(list(tekst))
    bb = d.textbbox((0, 0), tekst, font=f)
    # passend maken op de breedte
    if bb[2] - bb[0] > W:
        f = ImageFont.truetype(font_pad, int(grootte * W / (bb[2] - bb[0])))
        bb = d.textbbox((0, 0), tekst, font=f)
    x = (W - (bb[2] - bb[0])) / 2 - bb[0]
    y = (H - (bb[3] - bb[1])) / 2 - bb[1]
    if schaduw:
        d.text((x + grootte * 0.045, y + grootte * 0.05), tekst, font=f, fill=schaduw)
    d.text((x, y), tekst, font=f, fill=kleur + (255,))

    lb, rb, ro, lo = hoeken
    xs = [p[0] for p in hoeken]
    ys = [p[1] for p in hoeken]
    x0, y0 = int(min(xs)) - 2, int(min(ys)) - 2
    x1, y1 = int(max(xs)) + 2, int(max(ys)) + 2
    doel = [(lb[0] - x0, lb[1] - y0), (rb[0] - x0, rb[1] - y0),
            (ro[0] - x0, ro[1] - y0), (lo[0] - x0, lo[1] - y0)]
    bronhoeken = [(0, 0), (W, 0), (W, H), (0, H)]
    co = perspectief_coeffs(doel, bronhoeken)
    vlak = laag.transform((x1 - x0, y1 - y0), Image.PERSPECTIVE, co, Image.BICUBIC)
    if blur:
        vlak = vlak.filter(ImageFilter.GaussianBlur(blur))
    foto.alpha_composite(vlak, (x0, y0))


# ------------------------------------------------------------------ vlak vullen
def vul_vlak(foto, hoeken, monsters, ruis=4, blur=1.4):
    """Schildert een vierhoek dicht met de kleur van het vlak zelf.

    De kleur wordt uit de foto gehaald (monsters = punten op schoon vlak) en
    van links naar rechts geïnterpoleerd, zodat het licht blijft kloppen.
    """
    px = foto.load()
    kleuren = []
    for (mx, my) in monsters:
        buurt = [px[mx + dx, my + dy][:3] for dx in (-3, 0, 3) for dy in (-3, 0, 3)]
        kleuren.append(tuple(int(statistics.median(k[i] for k in buurt)) for i in range(3)))

    xs = [p[0] for p in hoeken]
    ys = [p[1] for p in hoeken]
    x0, y0, x1, y1 = int(min(xs)), int(min(ys)), int(max(xs)) + 1, int(max(ys)) + 1
    laag = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    d = ImageDraw.Draw(laag)
    # verloop van links naar rechts tussen de monsterkleuren
    n = len(kleuren)
    hoogte = y1 - y0
    for i in range(x1 - x0):
        t = i / max(1, x1 - x0 - 1) * (n - 1)
        a, b = int(t), min(n - 1, int(t) + 1)
        f = t - a
        basis = tuple(int(kleuren[a][k] + (kleuren[b][k] - kleuren[a][k]) * f) for k in range(3))
        for j in range(0, hoogte, 6):      # korte stukjes met eigen ruis: geen strepen
            kleur = tuple(max(0, min(255, c + random.randint(-ruis, ruis))) for c in basis)
            d.line([(i, j), (i, j + 6)], fill=kleur + (255,))
    laag = laag.filter(ImageFilter.GaussianBlur(blur))

    masker = Image.new("L", (x1 - x0, y1 - y0), 0)
    ImageDraw.Draw(masker).polygon([(p[0] - x0, p[1] - y0) for p in hoeken], fill=255)
    masker = masker.filter(ImageFilter.GaussianBlur(1.2))
    foto.paste(laag, (x0, y0), masker)


def main():
    foto = Image.open(BRON).convert("RGBA")

    # ---- 1. het grote bord boven de ingang -------------------------------
    # Het blauwe vlak loopt schuin: boven(x) = 148 - 0.592*(x-640),
    # onder(x) = 325 - 0.30*(x-640). We blijven er ruim binnen.
    bord = [(648, 152), (1028, 4), (1028, 202), (648, 316)]
    vul_vlak(foto, bord,
             monsters=[(670, 300), (760, 130), (860, 90), (950, 60), (1010, 40)],
             ruis=3, blur=2.0)
    # spade als "logo", daarna het woord
    plak_tekst(foto, "\u2660", [(664, 190), (754, 156), (756, 268), (666, 302)],
               VET, kleur=(236, 178, 60), schaduw=(0, 0, 0, 70), marge=0.05, blur=1.0)
    plak_tekst(foto, "FREECELL", [(770, 158), (1014, 62), (1014, 190), (770, 286)],
               ZWART, marge=0.10, blur=1.0)

    # ---- 2. naamplaatje op de borst --------------------------------------
    naam = [(247, 815), (330, 819), (330, 844), (247, 840)]
    vul_vlak(foto, naam, monsters=[(252, 828), (325, 832)], ruis=2, blur=0.8)
    plak_tekst(foto, "FREECELL", [(251, 819), (327, 823), (327, 840), (251, 836)],
               VET, kleur=(240, 228, 196), schaduw=None, marge=0.22, blur=0.5)

    # ---- 3. schouderembleem ----------------------------------------------
    patch = [(706, 752), (800, 745), (802, 779), (708, 786)]
    vul_vlak(foto, patch, monsters=[(715, 800), (790, 800)], ruis=2, blur=1.0)
    plak_tekst(foto, "FREECELL", [(710, 754), (798, 748), (799, 776), (711, 782)],
               VET, kleur=(238, 232, 214), schaduw=None, marge=0.26, blur=0.6)

    # ---- 4. borstinsigne --------------------------------------------------
    insigne = [(513, 762), (578, 758), (579, 783), (514, 787)]
    vul_vlak(foto, insigne, monsters=[(505, 800), (585, 800)], ruis=2, blur=1.0)
    plak_tekst(foto, "FREECELL", [(516, 764), (576, 761), (577, 781), (517, 784)],
               VET, kleur=(60, 48, 20), schaduw=None, marge=0.28, blur=0.5)

    # ---- 5. de auto -------------------------------------------------------
    auto = [(968, 771), (1063, 773), (1063, 800), (968, 798)]
    vul_vlak(foto, auto, monsters=[(960, 760), (1070, 762)], ruis=2, blur=1.0)
    plak_tekst(foto, "FREECELL", [(970, 774), (1061, 776), (1061, 797), (970, 795)],
               VET, kleur=(30, 52, 120), schaduw=None, marge=0.24, blur=0.6)

    foto.convert("RGB").save(DOEL, quality=90, subsampling=1)
    print("klaar ->", DOEL)


if __name__ == "__main__":
    main()
