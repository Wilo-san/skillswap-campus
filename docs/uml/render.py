#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Rendu des sources PlantUML de SkillSwap Campus.

Pour chaque fichier docs/uml/src/*.puml, le script produit :
  - docs/uml/export/<nom>.svg  (vectoriel, via le service public kroki.io)
  - docs/uml/export/<nom>.png  (conversion locale du SVG, echelle 2.5 pour la netteté)

Si le réseau est indisponible, le script s'arrete avec un message explicite :
les sources .puml restent la reference et peuvent etre rendues hors ligne avec
    java -jar plantuml.jar -tpng docs/uml/src/*.puml

Usage :
    python3 docs/uml/render.py            # tous les diagrammes
    python3 docs/uml/render.py classes    # un seul diagramme (nom sans extension)
"""

import sys
import time
import pathlib
import requests

import cairosvg

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "export"
KROKI = "https://kroki.io/plantuml/svg"
SCALE = 2.5
TIMEOUT = 90


def render_svg(source: bytes) -> bytes:
    """Rendu PlantUML a distance via kroki.io (aucun Java requis)."""
    derniere = None
    for tentative in range(4):
        try:
            reponse = requests.post(
                KROKI,
                data=source,
                headers={
                    "Content-Type": "text/plain; charset=utf-8",
                    "User-Agent": "skillswap-campus-docs/1.0",
                },
                timeout=TIMEOUT,
            )
            if reponse.status_code != 200:
                raise RuntimeError(f"HTTP {reponse.status_code} : {reponse.text[:200]}")
            return reponse.content
        except (requests.RequestException, RuntimeError) as erreur:
            derniere = erreur
            time.sleep(2 + 2 * tentative)
    raise RuntimeError(f"echec du rendu distant : {derniere}")


def verifier(svg: bytes, nom: str) -> None:
    """Controle automatique : aucun texte ne doit depasser du cadre du diagramme."""
    import re

    entete = re.search(rb'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg)
    if not entete:
        return
    largeur, hauteur = float(entete.group(1)), float(entete.group(2))
    debordements = []
    for element in re.finditer(rb"<text ([^>]*)>", svg):
        attributs = element.group(1).decode("utf-8", "replace")
        x = re.search(r'x="([-\d.]+)"', attributs)
        y = re.search(r'y="([-\d.]+)"', attributs)
        longueur = re.search(r'textLength="([-\d.]+)"', attributs)
        if not (x and y and longueur):
            continue
        xv, yv, lv = float(x.group(1)), float(y.group(1)), float(longueur.group(1))
        if xv < -1 or yv < -1 or xv + lv > largeur + 1 or yv > hauteur + 1:
            debordements.append((round(xv), round(yv), round(lv)))
    if debordements:
        print(f"[ATTENTION] {nom} : {len(debordements)} texte(s) hors cadre {debordements[:3]}")
    else:
        print(f"[OK] {nom} : aucun debordement de texte")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cibles = sys.argv[1:]
    sources = sorted(SRC.glob("*.puml"))
    if cibles:
        sources = [p for p in sources if p.stem in cibles]
    if not sources:
        print("aucune source PlantUML trouvee")
        return 1

    echecs = []
    for source in sources:
        contenu = source.read_bytes()
        try:
            svg = render_svg(contenu)
        except RuntimeError as erreur:
            print(f"[ERREUR] {source.stem} : {erreur}")
            echecs.append(source.stem)
            continue
        if b"Syntax Error" in svg or b"error" in svg[:400].lower():
            print(f"[ATTENTION] {source.stem} : le rendu distant signale une erreur de syntaxe")
        fichier_svg = OUT / f"{source.stem}.svg"
        fichier_png = OUT / f"{source.stem}.png"
        fichier_svg.write_bytes(svg)
        # Fond blanc explicite : le PNG reste lisible dans un traitement de texte ou un PDF
        cairosvg.svg2png(
            bytestring=svg,
            write_to=str(fichier_png),
            scale=SCALE,
            background_color="white",
        )
        verifier(svg, source.stem)
        print(f"[OK] {source.stem} : {fichier_svg.name} + {fichier_png.name}")

    if echecs:
        print("Diagrammes en echec :", ", ".join(echecs))
        return 2
    print(f"{len(sources)} diagramme(s) rendu(s) dans {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
