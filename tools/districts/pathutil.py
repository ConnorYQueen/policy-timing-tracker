"""Tiny SVG path helpers shared by the pipeline: parse the page's paths, write compact paths.

The page's paths (and ours) use only M, m, L, l, H, h, V, v, Z, z with plain decimal numbers.
"""
import re

_TOK = re.compile(r'[MmLlHhVvZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?')


def parse_path(d):
    """Return a list of rings; each ring is a list of (x, y) (not repeated at the end)."""
    toks = _TOK.findall(d)
    rings, cur = [], []
    i, cmd, x, y = 0, None, 0.0, 0.0
    start = (0.0, 0.0)

    def close():
        nonlocal cur
        if len(cur) >= 3:
            rings.append(cur)
        cur = []

    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in 'Zz':
                close()
                x, y = start
            continue
        if cmd in ('M', 'm'):
            if cur:
                close()
            nx, ny = float(toks[i]), float(toks[i + 1])
            i += 2
            x, y = (nx, ny) if cmd == 'M' else (x + nx, y + ny)
            start = (x, y)
            cur = [(x, y)]
            cmd = 'L' if cmd == 'M' else 'l'  # extra pairs after a moveto are linetos
        elif cmd in ('L', 'l'):
            nx, ny = float(toks[i]), float(toks[i + 1])
            i += 2
            x, y = (nx, ny) if cmd == 'L' else (x + nx, y + ny)
            cur.append((x, y))
        elif cmd in ('H', 'h'):
            nx = float(toks[i]); i += 1
            x = nx if cmd == 'H' else x + nx
            cur.append((x, y))
        elif cmd in ('V', 'v'):
            ny = float(toks[i]); i += 1
            y = ny if cmd == 'V' else y + ny
            cur.append((x, y))
        else:
            raise ValueError(f'unexpected token {t!r} in path')
    close()
    return rings


def fmt(units, dec):
    """Integer count of 10**-dec units -> shortest decimal text ('0' for 0, '.5' for 0.5, '-.5', '12.34')."""
    neg = units < 0
    n = abs(units)
    if dec == 0:
        s = str(n)
    else:
        whole, frac = divmod(n, 10 ** dec)
        frac_s = str(frac).rjust(dec, '0').rstrip('0')
        s = (str(whole) if whole else '') + ('.' + frac_s if frac_s else '')
        if not s:
            s = '0'
    return ('-' + s) if neg and s != '0' else s


def join_nums(texts):
    """Join number texts with the fewest separators: a space only before a number that does not start with '-'
    (and not before a '.5'-style number following a number that already has a decimal point)."""
    out = ''
    prev = ''
    for s in texts:
        if out:
            if s.startswith('-'):
                pass
            elif s.startswith('.') and '.' in prev:
                pass
            else:
                out += ' '
        out += s
        prev = s
    return out


def ring_to_path(ring, dec=1):
    """Closed ring of points -> 'Mx yl dx dy ...Z': absolute start, then relative runs, in exact integer units.

    The ring is NOT repeated at the end; points are rounded to `dec` decimals first, so rounding never drifts.
    """
    q = 10 ** dec
    pts = [(round(x * q), round(y * q)) for x, y in ring]
    x0, y0 = pts[0]
    out = 'M' + join_nums([fmt(x0, dec), fmt(y0, dec)])
    deltas = []
    px, py = x0, y0
    for x, y in pts[1:]:
        deltas += [fmt(x - px, dec), fmt(y - py, dec)]
        px, py = x, y
    if deltas:
        out += 'l' + join_nums(deltas)
    return out + 'Z'
