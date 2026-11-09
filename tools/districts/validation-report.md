# State legislative districts: validation report

Page: `2027-roster/index.html`  |  99 chambers in 50 states  |  total 5.91 MB (budget 9 MB), largest file 243 KB (budget 700 KB)

**Status: 98 OK, 1 partial, 0 failed** (of 99 chambers).

## Not fully OK

- **NH lower: partial**. 52 of 382 members have no district shape: #13 Belknap 8; #14 Belknap 8; #27 Carroll 7; #28 Carroll 8; #29 Carroll 8; #45 Cheshire 15; #46 Cheshire 15; #47 Cheshire 16; #48 Cheshire 17; #49 Cheshire 18; #50 Cheshire 18; #58 Coos 7; #82 Grafton 17; #83 Grafton 18; #181 Hillsborough 37; #182 Hillsborough 38; #183 Hillsborough 38; #184 Hillsborough 39; #185 Hillsborough 40; #186 Hillsborough 40; #187 Hillsborough 40; #188 Hillsborough 41; #189 Hillsborough 41; #197 Hillsborough 44; #198 Hillsborough 44; #199 Hillsborough 45; #238 Merrimack 25; #239 Merrimack 26; #240 Merrimack 27; #241 Merrimack 27; #242 Merrimack 28; #243 Merrimack 29; #244 Merrimack 30; #323 Rockingham 33; #324 Rockingham 34; #325 Rockingham 35; #326 Rockingham 36; #327 Rockingham 37; #328 Rockingham 38; #329 Rockingham 39 ...

## Per state and chamber

`seats` is the chamber size from the page; `polys` the districts drawn; `members` the members in the data (fewer than seats means vacancies); `matched` how many of them sit on a drawn district (a New Hampshire floterial district counts); `memberless` the drawn districts with nobody in the data; `IoU` how well the districts together cover the page's own state shape; `overlap`/`gap` are the share of the state area covered twice / not covered by any district.

| state | chamber | seats | polys | members | matched | unmatched | memberless | IoU | overlap | gap | file KB | status |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---|
| AK | upper | 20 | 20 | 20 | 20 | 0 | none | 0.9941 | 0.000% | 0.386% | 100 | OK |
| AK | lower | 40 | 40 | 40 | 40 | 0 | none | 0.9941 | 0.000% | 0.389% | 100 | OK |
| AL | upper | 35 | 35 | 35 | 35 | 0 | none | 0.9998 | -0.000% | 0.010% | 161 | OK |
| AL | lower | 105 | 105 | 105 | 105 | 0 | none | 0.9998 | -0.000% | 0.010% | 161 | OK |
| AR | upper | 35 | 35 | 33 | 33 | 0 | 1, 18 | 0.9996 | 0.000% | 0.019% | 146 | OK |
| AR | lower | 100 | 100 | 99 | 99 | 0 | 8 | 0.9996 | 0.000% | 0.019% | 146 | OK |
| AZ | upper | 30 | 30 | 30 | 30 | 0 | none | 0.9999 | -0.000% | 0.005% | 68 | OK |
| AZ | lower | 60 | 30 | 60 | 60 | 0 | none | 0.9999 | -0.000% | 0.005% | 68 | OK |
| CA | upper | 40 | 40 | 39 | 39 | 0 | 10 | 0.9995 | 0.000% | 0.023% | 118 | OK |
| CA | lower | 80 | 80 | 79 | 79 | 0 | 3 | 0.9995 | -0.000% | 0.022% | 118 | OK |
| CO | upper | 35 | 35 | 35 | 35 | 0 | none | 0.9999 | 0.000% | 0.003% | 98 | OK |
| CO | lower | 65 | 65 | 65 | 65 | 0 | none | 0.9999 | 0.000% | 0.003% | 98 | OK |
| CT | upper | 36 | 36 | 36 | 36 | 0 | none | 0.9994 | 0.000% | 0.029% | 171 | OK |
| CT | lower | 151 | 151 | 151 | 151 | 0 | none | 0.9994 | 0.000% | 0.029% | 171 | OK |
| DE | upper | 21 | 21 | 21 | 21 | 0 | none | 0.9991 | 0.000% | 0.044% | 56 | OK |
| DE | lower | 41 | 41 | 41 | 41 | 0 | none | 0.9991 | 0.000% | 0.045% | 56 | OK |
| FL | upper | 40 | 40 | 39 | 39 | 0 | 39 | 0.9989 | 0.000% | 0.066% | 106 | OK |
| FL | lower | 120 | 120 | 116 | 116 | 0 | 55, 78, 113, 116 | 0.9989 | 0.000% | 0.069% | 106 | OK |
| GA | upper | 56 | 56 | 56 | 56 | 0 | none | 0.9996 | 0.000% | 0.018% | 232 | OK |
| GA | lower | 180 | 180 | 180 | 180 | 0 | none | 0.9996 | 0.000% | 0.017% | 232 | OK |
| HI | upper | 25 | 25 | 25 | 25 | 0 | none | 0.9710 | 0.000% | 1.465% | 52 | OK |
| HI | lower | 51 | 51 | 51 | 51 | 0 | none | 0.9710 | -0.000% | 1.464% | 52 | OK |
| IA | upper | 50 | 50 | 49 | 49 | 0 | 11 | 0.9996 | 0.000% | 0.017% | 98 | OK |
| IA | lower | 100 | 100 | 99 | 99 | 0 | 38 | 0.9996 | 0.000% | 0.017% | 98 | OK |
| ID | upper | 35 | 35 | 35 | 35 | 0 | none | 0.9998 | 0.000% | 0.010% | 64 | OK |
| ID | lower | 70 | 35 | 70 | 70 | 0 | none | 0.9998 | 0.000% | 0.010% | 64 | OK |
| IL | upper | 59 | 59 | 59 | 59 | 0 | none | 0.9997 | -0.000% | 0.015% | 112 | OK |
| IL | lower | 118 | 118 | 118 | 118 | 0 | none | 0.9997 | 0.000% | 0.015% | 112 | OK |
| IN | upper | 50 | 50 | 50 | 50 | 0 | none | 0.9996 | 0.000% | 0.018% | 86 | OK |
| IN | lower | 100 | 100 | 100 | 100 | 0 | none | 0.9996 | 0.000% | 0.018% | 86 | OK |
| KS | upper | 40 | 40 | 40 | 40 | 0 | none | 0.9999 | 0.000% | 0.007% | 68 | OK |
| KS | lower | 125 | 125 | 125 | 125 | 0 | none | 0.9999 | 0.000% | 0.007% | 68 | OK |
| KY | upper | 38 | 38 | 38 | 38 | 0 | none | 0.9995 | 0.000% | 0.023% | 173 | OK |
| KY | lower | 100 | 100 | 100 | 100 | 0 | none | 0.9995 | 0.000% | 0.023% | 173 | OK |
| LA | upper | 39 | 39 | 38 | 38 | 0 | 14 | 0.9892 | 0.000% | 1.031% | 221 | OK |
| LA | lower | 105 | 105 | 103 | 103 | 0 | 77, 92 | 0.9990 | 0.000% | 0.045% | 221 | OK |
| MA | upper | 40 | 40 | 40 | 40 | 0 | none | 0.9993 | 0.000% | 0.044% | 137 | OK |
| MA | lower | 160 | 160 | 157 | 157 | 0 | 1st Franklin, 16th Middlesex, 17th Middlesex | 0.9992 | 0.000% | 0.045% | 137 | OK |
| MD | upper | 47 | 47 | 47 | 47 | 0 | none | 0.9978 | -0.000% | 0.114% | 156 | OK |
| MD | lower | 141 | 71 | 141 | 141 | 0 | none | 0.9977 | 0.000% | 0.115% | 156 | OK |
| ME | upper | 35 | 35 | 35 | 35 | 0 | none | 0.9978 | 0.000% | 0.131% | 110 | OK |
| ME | lower | 151 | 151 | 153 | 151 | 0 | none | 0.9978 | 0.000% | 0.133% | 110 | OK |
| MI | upper | 38 | 38 | 38 | 38 | 0 | none | 0.9987 | 0.000% | 0.067% | 88 | OK |
| MI | lower | 110 | 110 | 110 | 110 | 0 | none | 0.9987 | 0.000% | 0.066% | 88 | OK |
| MN | upper | 67 | 67 | 67 | 67 | 0 | none | 0.9994 | 0.000% | 0.029% | 105 | OK |
| MN | lower | 134 | 134 | 133 | 133 | 0 | 21A | 0.9994 | 0.000% | 0.029% | 105 | OK |
| MO | upper | 34 | 34 | 33 | 33 | 0 | 10 | 0.9997 | -0.000% | 0.013% | 137 | OK |
| MO | lower | 163 | 163 | 155 | 155 | 0 | 29, 95, 99, 110, 114, 149 (+2) | 0.9997 | -0.000% | 0.013% | 137 | OK |
| MS | upper | 52 | 52 | 51 | 51 | 0 | 34 | 0.9993 | 0.000% | 0.040% | 163 | OK |
| MS | lower | 122 | 122 | 120 | 120 | 0 | 70, 77 | 0.9993 | 0.000% | 0.040% | 163 | OK |
| MT | upper | 50 | 50 | 50 | 50 | 0 | none | 0.9999 | 0.000% | 0.007% | 147 | OK |
| MT | lower | 100 | 100 | 100 | 100 | 0 | none | 0.9999 | 0.000% | 0.008% | 147 | OK |
| NC | upper | 50 | 50 | 50 | 50 | 0 | none | 0.9991 | 0.000% | 0.043% | 162 | OK |
| NC | lower | 120 | 120 | 120 | 120 | 0 | none | 0.9991 | 0.000% | 0.043% | 162 | OK |
| ND | upper | 47 | 47 | 47 | 47 | 0 | none | 0.9996 | -0.000% | 0.023% | 65 | OK |
| ND | lower | 94 | 48 | 94 | 94 | 0 | none | 0.9996 | -0.000% | 0.023% | 65 | OK |
| NE | single chamber | 49 | 49 | 49 | 49 | 0 | none | 0.9998 | 0.000% | 0.008% | 23 | OK |
| NH | upper | 24 | 24 | 24 | 24 | 0 | none | 0.9988 | 0.000% | 0.056% | 80 | OK |
| NH | lower | 400 | 164 + 2 floterial | 382 | 330 | 52 | Cheshire 1, Coos 6, Grafton 9, Rockingham 22 | 0.9988 | 0.000% | 0.055% | 80 | partial |
| NJ | upper | 40 | 40 | 40 | 40 | 0 | none | 0.9997 | 0.000% | 0.016% | 86 | OK |
| NJ | lower | 80 | 40 | 80 | 80 | 0 | none | 0.9997 | 0.000% | 0.016% | 86 | OK |
| NM | upper | 42 | 42 | 42 | 42 | 0 | none | 0.9999 | 0.000% | 0.003% | 112 | OK |
| NM | lower | 70 | 70 | 67 | 67 | 0 | 37, 41, 64 | 0.9999 | 0.000% | 0.003% | 112 | OK |
| NV | upper | 21 | 21 | 21 | 21 | 0 | none | 0.9999 | 0.000% | 0.004% | 34 | OK |
| NV | lower | 42 | 42 | 42 | 42 | 0 | none | 0.9999 | 0.000% | 0.004% | 34 | OK |
| NY | upper | 63 | 63 | 62 | 62 | 0 | 12 | 0.9996 | -0.000% | 0.023% | 122 | OK |
| NY | lower | 150 | 150 | 150 | 150 | 0 | none | 0.9995 | 0.000% | 0.025% | 122 | OK |
| OH | upper | 33 | 33 | 32 | 32 | 0 | 13 | 0.9924 | 0.000% | 0.753% | 105 | OK |
| OH | lower | 99 | 99 | 98 | 98 | 0 | 89 | 0.9924 | 0.000% | 0.754% | 105 | OK |
| OK | upper | 48 | 48 | 47 | 47 | 0 | 24 | 0.9998 | -0.000% | 0.009% | 89 | OK |
| OK | lower | 101 | 101 | 99 | 99 | 0 | 77, 99 | 0.9998 | -0.000% | 0.009% | 89 | OK |
| OR | upper | 30 | 30 | 30 | 30 | 0 | none | 0.9999 | 0.000% | 0.006% | 89 | OK |
| OR | lower | 60 | 60 | 60 | 60 | 0 | none | 0.9999 | 0.000% | 0.007% | 89 | OK |
| PA | upper | 50 | 50 | 50 | 50 | 0 | none | 0.9999 | 0.000% | 0.005% | 181 | OK |
| PA | lower | 203 | 203 | 203 | 203 | 0 | none | 0.9999 | 0.000% | 0.006% | 181 | OK |
| RI | upper | 38 | 38 | 38 | 38 | 0 | none | 0.9978 | 0.000% | 0.109% | 85 | OK |
| RI | lower | 75 | 75 | 74 | 74 | 0 | 31 | 0.9978 | 0.000% | 0.109% | 85 | OK |
| SC | upper | 46 | 46 | 46 | 46 | 0 | none | 0.9995 | -0.000% | 0.027% | 243 | OK |
| SC | lower | 124 | 124 | 124 | 124 | 0 | none | 0.9995 | 0.000% | 0.028% | 243 | OK |
| SD | upper | 35 | 35 | 35 | 35 | 0 | none | 0.9998 | 0.000% | 0.010% | 55 | OK |
| SD | lower | 70 | 37 | 70 | 70 | 0 | none | 0.9998 | 0.000% | 0.010% | 55 | OK |
| TN | upper | 33 | 33 | 33 | 33 | 0 | none | 0.9998 | -0.000% | 0.012% | 156 | OK |
| TN | lower | 99 | 99 | 98 | 98 | 0 | 84 | 0.9998 | 0.000% | 0.013% | 156 | OK |
| TX | upper | 31 | 31 | 30 | 30 | 0 | 22 | 0.9994 | 0.000% | 0.032% | 149 | OK |
| TX | lower | 150 | 150 | 148 | 148 | 0 | 1, 93 | 0.9994 | 0.000% | 0.032% | 149 | OK |
| UT | upper | 29 | 29 | 29 | 29 | 0 | none | 0.9999 | 0.000% | 0.003% | 70 | OK |
| UT | lower | 75 | 75 | 74 | 74 | 0 | 16 | 0.9999 | 0.000% | 0.003% | 70 | OK |
| VA | upper | 40 | 40 | 40 | 40 | 0 | none | 0.9994 | 0.000% | 0.031% | 153 | OK |
| VA | lower | 100 | 100 | 99 | 99 | 0 | 20 | 0.9993 | -0.000% | 0.033% | 153 | OK |
| VT | upper | 30 | 16 | 30 | 30 | 0 | none | 0.9986 | 0.000% | 0.075% | 59 | OK |
| VT | lower | 150 | 109 | 150 | 150 | 0 | none | 0.9986 | 0.000% | 0.075% | 59 | OK |
| WA | upper | 49 | 49 | 49 | 49 | 0 | none | 0.9993 | 0.000% | 0.036% | 159 | OK |
| WA | lower | 98 | 49 | 98 | 98 | 0 | none | 0.9993 | 0.000% | 0.036% | 159 | OK |
| WI | upper | 33 | 33 | 33 | 33 | 0 | none | 0.9957 | 0.000% | 0.402% | 89 | OK |
| WI | lower | 99 | 99 | 99 | 99 | 0 | none | 0.9957 | 0.000% | 0.403% | 89 | OK |
| WV | upper | 34 | 17 | 34 | 34 | 0 | none | 0.9991 | 0.000% | 0.043% | 154 | OK |
| WV | lower | 100 | 100 | 100 | 100 | 0 | none | 0.9991 | 0.000% | 0.043% | 154 | OK |
| WY | upper | 31 | 31 | 31 | 31 | 0 | none | 0.9999 | 0.000% | 0.004% | 78 | OK |
| WY | lower | 62 | 62 | 62 | 62 | 0 | none | 0.9999 | 0.000% | 0.004% | 78 | OK |

## Notes

- ME lower: Brian Reynolds (Houlton Band of Maliseet Indians): non-geographic seat (non-voting tribal representative), no district shape; not counted as unmatched
- ME lower: Aaron Dana (Passamaquoddy Tribe): non-geographic seat (non-voting tribal representative), no district shape; not counted as unmatched
- NH lower: 2 floterial district(s) drawn as the union of the base districts they overlay: Rockingham 31 = Rockingham 2, Rockingham 3 (2 members); Rockingham 32 = Rockingham 6, Rockingham 7, Rockingham 8 (1 members). 52 members hold 37 other district names that have no shape (floterial districts whose composition is not in tools/districts/nh_floterials.json): Belknap 8, Carroll 7, Carroll 8, Cheshire 15, Cheshire 16, Cheshire 17, Cheshire 18, Coos 7, Grafton 17, Grafton 18, Hillsborough 37, Hillsborough 38, Hillsborough 39, Hillsborough 40, Hillsborough 41, Hillsborough 44, Hillsborough 45, Merrimack 25, Merrimack 26, Merrimack 27, Merrimack 28, Merrimack 29, Merrimack 30, Rockingham 33, Rockingham 34, Rockingham 35, Rockingham 36, Rockingham 37, Rockingham 38, Rockingham 39, Rockingham 40, Strafford 18, Strafford 19, Strafford 20, Strafford 21, Sullivan 7, Sullivan 8
