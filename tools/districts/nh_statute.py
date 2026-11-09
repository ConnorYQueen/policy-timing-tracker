#!/usr/bin/env python3
"""Reads the enacted text of New Hampshire's RSA 662:5 (State Representative Districts) and writes nh_statute_662_5.json.

Source: the bill page for HB 50 (2022), "CHAPTER 9 HB 50 - FINAL VERSION", which repealed and reenacted RSA 662:5 and sets the
House districts used in 2022 to 2026: https://bills.nhliberty.org/bills/2022/HB50 (a copy of the chaptered bill; the official text is
https://gc.nh.gov/rsa/html/lxiii/662/662-5.htm). The page lists, by county, each "District No. N", the towns or city wards in it,
and its number of representatives. Usage: python3 nh_statute.py <saved HB50 page .html>"""
import sys, re, json, html, os
src = open(sys.argv[1], encoding='utf-8', errors='ignore').read()
paras = re.findall(r'<p [^>]*>(.*?)</p>', src, re.S)
out, county, cur = {}, None, None
for p in paras:
    t = html.unescape(re.sub(r'<[^>]+>', '', p)).replace('\xa0', ' ')
    t = t.replace('\r', '')
    m = re.match(r'^\s*[IVX]+\.\s*([A-Za-z]+) County\s*$', t)
    if m:
        county, cur = m.group(1), None; out.setdefault(county, {}); continue
    if county is None: continue
    parts = [x.strip() for x in t.split('\t') if x.strip()]
    if not parts: continue
    m = re.match(r'^District No\.\s*(\d+)$', parts[0])
    if m:
        cur = int(m.group(1)); out[county][cur] = {'towns': [], 'seats': None}; parts = parts[1:]
    elif cur is None or not out[county]: continue
    elif re.match(r'^(SECTION|9:2|Explanation|ANALYSIS|[0-9]+:[0-9]+ )', parts[0]): cur = None; continue
    for x in parts:
        if re.fullmatch(r'\d+', x): out[county][cur]['seats'] = int(x)
        else: out[county][cur]['towns'].append(x)
bad = [(c, n) for c, d in out.items() for n, v in d.items() if not v['towns'] or not v['seats']]
if bad: sys.exit(f'districts without towns or seats: {bad}')
res = {'about': 'RSA 662:5 as reenacted by chapter 9, Laws of 2022 (HB 50), read by nh_statute.py. county -> district number -> towns or city wards and number of representatives.',
       'source': {'label': 'HB 50 (2022), chaptered version that reenacted RSA 662:5, as shown by NH Liberty Alliance Bill Review',
                  'url': 'https://bills.nhliberty.org/bills/2022/HB50', 'official': 'https://gc.nh.gov/rsa/html/lxiii/662/662-5.htm'},
       'counties': {c: {str(n): v for n, v in d.items()} for c, d in out.items()}}
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nh_statute_662_5.json')
open(dst, 'w', encoding='utf-8').write(json.dumps(res, indent=1, ensure_ascii=False) + '\n')
print({c: len(d) for c, d in out.items()}, 'districts', sum(len(d) for d in out.values()), 'seats', sum(v['seats'] for d in out.values() for v in d.values()))
