#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Recolorea el escudo de la Municipalidad del azul original al verde institucional
y genera los iconos de la PWA.

Entrada:  tools/logo-original-azul.jpg   (el escudo tal como lo entregó la Muni)
Salidas:  public/assets/logo-verde.png
          public/assets/icon-192.png
          public/assets/icon-512.png

POR QUÉ NO ES UN RECOLOREADO TRIVIAL
------------------------------------
El escudo NO es un logo plano de un color sobre fondo blanco: es una imagen
circular con una FOTO de agua de fondo y el texto calado en BLANCO encima.

El primer intento lo trató como monocromo ("todo lo que no sea blanco es el
trazo") y el resultado fue un desastre silencioso: el texto, al ser blanco, se
volvió transparente. Sobre fondo claro se veía el fondo a través de las letras.

Lo que sí funciona es no tocar los píxeles, sino su TONO: los azules del agua
se desplazan a verde y todo lo demás se deja como está. El texto tiene
saturación casi nula, así que queda intacto por construcción; y la franja de
"La Costa de Ñuble" ya venía en #78C030, prácticamente el verde oficial.

Uso:  python3 tools/generar-logo-verde.py
"""
import colorsys
import math
import os

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)

ORIGEN = os.path.join(AQUI, "logo-original-azul.jpg")
ASSETS = os.path.join(RAIZ, "public", "assets")

VERDE_HUE = 88 / 360.0          # tono del verde oficial #7DC040
AZUL_MIN, AZUL_MAX = 175, 265   # rango de tonos del agua original
SAT_MINIMA = 0.12               # por debajo de esto es texto o espuma: no se toca
FONDO_ICONO = (22, 51, 10, 255)  # --ink #16330A


def recolorear():
    im = Image.open(ORIGEN).convert("RGB")
    w, h = im.size
    src = im.load()
    cx, cy = (w - 1) / 2, (h - 1) / 2
    radio = min(w, h) / 2

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dst = out.load()
    convertidos = dentro = 0

    for y in range(h):
        for x in range(w):
            d = math.hypot(x - cx, y - cy)
            if d > radio - 1:
                continue                      # fuera del círculo: transparente
            alpha = 255
            if d > radio - 3:
                alpha = int(255 * (radio - d) / 3)   # borde suavizado

            r, g, b = src[x, y]
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if ss > SAT_MINIMA and AZUL_MIN <= hh * 360 <= AZUL_MAX:
                nr, ng, nb = colorsys.hsv_to_rgb(VERDE_HUE, min(1.0, ss * 1.05), vv)
                r, g, b = int(nr * 255), int(ng * 255), int(nb * 255)
                convertidos += 1
            dentro += 1
            dst[x, y] = (r, g, b, alpha)

    # Se muestra a 72 px: 200 px cubre pantallas retina de sobra, y cuantizado
    # pesa 14 KB en vez de 195 KB (es una foto, el PNG plano no la comprime).
    chico = out.resize((200, 200), Image.LANCZOS)
    chico.quantize(colors=128, method=Image.FASTOCTREE).save(
        os.path.join(ASSETS, "logo-verde.png"), optimize=True)
    print("logo-verde.png  — %d de %d píxeles pasaron de azul a verde (%.1f%%)"
          % (convertidos, dentro, 100 * convertidos / dentro))
    return out


def iconos(logo):
    for lado in (192, 512):
        base = Image.new("RGBA", (lado, lado), FONDO_ICONO)
        # 'purpose: any maskable' permite recortes de hasta un 20% en Android:
        # el logo va al 76% del lienzo para que nunca le corten el texto.
        d = int(lado * 0.76)
        escalado = logo.resize((d, d), Image.LANCZOS)
        base.paste(escalado, ((lado - d) // 2, (lado - d) // 2), escalado)
        base.convert("RGB").save(os.path.join(ASSETS, "icon-%d.png" % lado), optimize=True)
        print("icon-%d.png    — generado" % lado)


if __name__ == "__main__":
    iconos(recolorear())
