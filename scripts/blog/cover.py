"""Gera capas padronizadas do blog MKTP Fácil (1200x630, imagem + título).
Uso: python3 cover.py "Título do post" categoria-slug saida.png
"""
import sys, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
FONT_B = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
FONT_S = "/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf"

# cor de destaque por categoria (fundo azul da marca é comum a todas)
ACCENT = {
    "mercado-livre": (255, 230, 0),
    "shopee": (238, 77, 45),
    "precificacao-e-taxas": (34, 197, 94),
    "frete-e-logistica": (251, 146, 60),
    "campanhas-e-datas": (236, 72, 153),
    "gestao-e-operacao": (168, 85, 247),
    "funcionalidades": (255, 255, 255),
    "default": (255, 230, 0),
}
BG1, BG2 = (0, 158, 227), (0, 72, 140)  # #009EE3 -> azul profundo

def gradient():
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        for x in range(W):
            t = (x / W) * 0.6 + (y / H) * 0.4
            px[x, y] = tuple(int(BG1[i] + (BG2[i] - BG1[i]) * t) for i in range(3))
    return img

def motif(img, accent, seed):
    rnd = random.Random(seed)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # círculos grandes translúcidos à direita
    for _ in range(3):
        r = rnd.randint(160, 320)
        cx, cy = rnd.randint(820, 1250), rnd.randint(-80, 700)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 18))
    # grade de pontos
    for gx in range(860, 1180, 34):
        for gy in range(60, 580, 34):
            d.ellipse([gx - 2, gy - 2, gx + 2, gy + 2], fill=(255, 255, 255, 40))
    # barra de destaque
    d.rounded_rectangle([70, 92, 190, 104], radius=6, fill=accent + (255,))
    # mini gráfico de barras estilizado (identidade de "dados")
    base = 540
    for i, h in enumerate([90, 150, 120, 210, 260]):
        x = 900 + i * 52
        d.rounded_rectangle([x, base - h, x + 34, base], radius=8,
                            fill=accent + (220,) if i == 4 else (255, 255, 255, 70))
    img.paste(layer, (0, 0), layer)
    return img

def wrap(draw, text, font, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if draw.textlength(test, font=font) <= maxw:
            cur = test
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def make(title, cat, out):
    accent = ACCENT.get(cat, ACCENT["default"])
    img = motif(gradient(), accent, title)
    d = ImageDraw.Draw(img)
    maxw = 760
    for size in (64, 58, 52, 46, 42):
        f = ImageFont.truetype(FONT_B, size)
        lines = wrap(d, title, f, maxw)
        if len(lines) <= 4: break
    lh = int(size * 1.18)
    y = 140 + max(0, (4 - len(lines)) * lh // 2)
    for ln in lines:
        d.text((70, y), ln, font=f, fill=(255, 255, 255))
        y += lh
    # assinatura da marca
    fs = ImageFont.truetype(FONT_S, 26)
    d.rounded_rectangle([70, 548, 108, 586], radius=9, fill=(255, 255, 255))
    for i, h in enumerate([10, 18, 26]):
        d.rectangle([78 + i * 9, 578 - h, 84 + i * 9, 578], fill=BG1)
    d.text((122, 549), "MKTP Fácil", font=fs, fill=(255, 255, 255))
    img.save(out, optimize=True)

if __name__ == "__main__":
    make(sys.argv[1], sys.argv[2], sys.argv[3])
