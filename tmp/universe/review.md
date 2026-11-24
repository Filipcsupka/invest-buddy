# Universe selection review (d35-2026-10-draft), data as of 2026-10-18

Dry run. Nothing was written to the database. Thresholds are placeholders until the owner approves `docs/universe-criteria.md`.

- Target 150, selected 150: 36 core, 114 proposed adds (114 above 15% growth).
- Excluded 268. Sector cap 37 names.
- sha256 selected.csv ca1599d7562b3d138a763d01a32a4d293778807745740336515fb982fbf557f9
- sha256 excluded.csv 0d1276ac022fca45dfffb295642c6f906f93ab24cfa932c20cdb6d6feb752f06

## Excluded by reason

- below_cut: 138
- duplicate_filer: 1
- filer_unknown: 82
- not_common_stock: 4
- price_below_min: 17
- volume_below_floor: 26

## Selected by sector

- AI & semiconductors: 17
- Additional growth: 4
- Biotech: 18
- Cloud & SaaS: 12
- Cybersecurity: 4
- Discovery: 2
- Energy & EV: 10
- Fintech: 9
- Growth: 6
- Sample extension: 7
- Unclassified: 61

## Core names failing a criterion (kept anyway)

- ASML: kept as core, fails: foreign_filer
- ENPH: kept as core, fails: growth_not_positive
- PCVX: kept as core, fails: no_revenue_history
- SE: kept as core, fails: foreign_filer
- VRTX: kept as core, fails: growth_not_positive

## Proposed adds

Review only. Import after approval with `scripts/universe-change.ts` (D36), one row each:

- 37. PGEN (Biotech, 6322.7% YoY)
- 38. LQDA (Biotech, 1842.7% YoY)
- 39. ONDS (Growth, 1235.4% YoY)
- 40. FLY (Growth, 656.9% YoY)
- 41. KYMR (Growth, 466.4% YoY)
- 42. MU (AI & semiconductors, 345.7% YoY)
- 43. LUNR (Growth, 309.8% YoY)
- 44. INSM (Biotech, 296.1% YoY)
- 45. RHLD (Fintech, 295.6% YoY)
- 46. FUBO (Unclassified, 290.0% YoY)
- 47. IONQ (Cloud & SaaS, 286.8% YoY)
- 48. SM (Growth, 215.3% YoY)
- 49. UNIT (Unclassified, 202.5% YoY)
- 50. URGN (Biotech, 199.2% YoY)
- 51. BE (Energy & EV, 165.5% YoY)
- 52. SUN (Energy & EV, 164.6% YoY)
- 53. NLST (AI & semiconductors, 163.4% YoY)
- 54. XE (Unclassified, 153.9% YoY)
- 55. INSW (Discovery, 138.8% YoY)
- 56. WBI (Energy & EV, 128.0% YoY)
- 57. VNOM (Energy & EV, 128.0% YoY)
- 58. SITM (AI & semiconductors, 126.5% YoY)
- 59. EVC (Unclassified, 126.2% YoY)
- 60. CDE (Unclassified, 125.9% YoY)
- 61. LPG (Unclassified, 123.1% YoY)
- 62. KLIC (AI & semiconductors, 122.6% YoY)
- 63. SNDA (Growth, 122.0% YoY)
- 64. ABTC (Fintech, 121.3% YoY)
- 65. HNI (Unclassified, 120.7% YoY)
- 66. BBIO (Biotech, 120.4% YoY)
- 67. RGLD (Unclassified, 114.9% YoY)
- 68. CDNL (Unclassified, 113.9% YoY)
- 69. WAT (Unclassified, 113.4% YoY)
- 70. LIFE (Unclassified, 113.3% YoY)
- 71. FIGR (Unclassified, 112.7% YoY)
- 72. CRWV (Cloud & SaaS, 112.5% YoY)
- 73. STAA (Unclassified, 111.0% YoY)
- 74. LGN (Unclassified, 110.7% YoY)
- 75. COMP (Unclassified, 109.0% YoY)
- 76. CORZ (Fintech, 108.8% YoY)
- 77. DNOW (Unclassified, 108.1% YoY)
- 78. ALAB (AI & semiconductors, 104.5% YoY)
- 79. TER (AI & semiconductors, 103.9% YoY)
- 80. AAON (Unclassified, 101.2% YoY)
- 81. IBRX (Biotech, 93.9% YoY)
- 82. RDN (Unclassified, 92.6% YoY)
- 83. ALSN (Unclassified, 92.4% YoY)
- 84. SNDX (Biotech, 91.8% YoY)
- 85. STRL (Unclassified, 90.1% YoY)
- 86. RDW (Unclassified, 89.6% YoY)
- 87. MP (Unclassified, 89.0% YoY)
- 88. ATLC (Fintech, 88.8% YoY)
- 89. BG (Unclassified, 88.3% YoY)
- 90. PHAT (Biotech, 88.0% YoY)
- 91. AAOI (AI & semiconductors, 86.4% YoY)
- 92. TIC (Unclassified, 86.1% YoY)
- 93. CHRD (Energy & EV, 84.0% YoY)
- 94. HUT (Fintech, 81.4% YoY)
- 95. BTGO (Fintech, 79.6% YoY)
- 96. LMND (Unclassified, 79.4% YoY)
- 97. ET (Energy & EV, 78.4% YoY)
- 98. CBRS (AI & semiconductors, 74.3% YoY)
- 99. RYZ (Unclassified, 71.6% YoY)
- 100. HCC (Unclassified, 71.3% YoY)
- 101. MDGL (Biotech, 71.2% YoY)
- 102. OSCR (Unclassified, 70.4% YoY)
- 103. QXO (Unclassified, 70.3% YoY)
- 104. FTK (Unclassified, 70.3% YoY)
- 105. TGTX (Biotech, 70.3% YoY)
- 106. SANM (Unclassified, 69.7% YoY)
- 107. TARS (Biotech, 69.4% YoY)
- 108. GPN (Unclassified, 68.6% YoY)
- 109. GNK (Unclassified, 68.5% YoY)
- 110. IOVA (Biotech, 65.7% YoY)
- 111. VSEC (Unclassified, 65.0% YoY)
- 112. ROCK (Unclassified, 64.6% YoY)
- 113. BLLN (Unclassified, 64.4% YoY)
- 114. WHD (Unclassified, 64.3% YoY)
- 115. LTC (Unclassified, 64.1% YoY)
- 116. OMC (Unclassified, 63.4% YoY)
- 117. ARX (Unclassified, 62.9% YoY)
- 118. CLS (Unclassified, 62.4% YoY)
- 119. LSCC (AI & semiconductors, 62.2% YoY)
- 120. RKLB (Unclassified, 62.0% YoY)
- 121. AGX (Unclassified, 61.5% YoY)
- 122. RDDT (Cloud & SaaS, 61.1% YoY)
- 123. EE (Energy & EV, 61.0% YoY)
- 124. BAM (Unclassified, 60.8% YoY)
- 125. ARQT (Biotech, 59.3% YoY)
- 126. NESR (Energy & EV, 59.1% YoY)
- 127. KRMN (Unclassified, 58.2% YoY)
- 128. PL (Unclassified, 58.1% YoY)
- 129. INOD (Cloud & SaaS, 57.8% YoY)
- 130. DELL (AI & semiconductors, 57.8% YoY)
- 131. WT (Unclassified, 57.3% YoY)
- 132. ESI (Unclassified, 56.4% YoY)
- 133. OUST (Unclassified, 55.9% YoY)
- 134. KNSA (Biotech, 55.4% YoY)
- 135. CRGY (Discovery, 55.3% YoY)
- 136. MXL (AI & semiconductors, 55.2% YoY)
- 137. MAMA (Unclassified, 55.0% YoY)
- 138. APH (Unclassified, 55.0% YoY)
- 139. PLMR (Unclassified, 54.6% YoY)
- 140. HLIT (Unclassified, 53.5% YoY)
- 141. DKS (Unclassified, 53.2% YoY)
- 142. SKWD (Unclassified, 53.0% YoY)
- 143. HNGE (Cloud & SaaS, 53.0% YoY)
- 144. CURB (Unclassified, 52.9% YoY)
- 145. APP (Cloud & SaaS, 52.8% YoY)
- 146. RUN (Unclassified, 52.8% YoY)
- 147. NVT (Unclassified, 52.8% YoY)
- 148. KALU (Unclassified, 52.7% YoY)
- 149. HL (Unclassified, 52.5% YoY)
- 150. CVNA (Unclassified, 52.4% YoY)
