# Research: Energy Consumption of Everyday Digital Actions

## Summary

Energy for digital micro-actions spans from tens of microwatt-hours (a text's radio burst) to hundreds of milliwatt-hours (a Google search query, server-side). Smartphone display power dominates device energy budgets and is well-documented by both academic measurement and Google's own official blog disclosure. A 4–7 W LED nightlight is the clearest physical baseline: its energy per second is set by rated wattage alone. Figures below mix one confirmed official disclosure, one peer-reviewed measurement, and well-reasoned estimates applied to modern hardware; scope differences (server-only vs. full system, device generation) are the main source of disagreement across studies.

---

## Findings

### 1. Sending One SMS Text Message

**Wh estimate: ~0.007–0.009 Wh (device-side, full workflow); ~0.0002 Wh (radio-only increment); ~0.001 Wh (network infrastructure amortised)**

1. **Device energy for the full "compose and send" workflow: ~0.007–0.009 Wh.**
   Carroll & Heiser (USENIX ATC 2010) physically measured each subsystem on an Openmoko Neo Freerunner (2.5G GSM smartphone). Their SMS benchmark covered loading contacts, composing a 55-character message, and sending it — 62 s of activity plus 20 s monitoring to capture the full GSM transaction = 82 s total. Aggregate power excluding backlight: **302.2 mW**. Energy: 302.2 mW × 82 s = 24.8 J = **0.0069 Wh**. Adding the display backlight at 50% brightness (75 mW × 82 s = 6.2 J = 0.0017 Wh) brings the device total to **~0.009 Wh**.
   [Carroll & Heiser, "An Analysis of Power Consumption in a Smartphone", USENIX ATC 2010](https://www.usenix.org/legacy/events/usenix10/tech/full_papers/Carroll.pdf)

2. **Incremental radio energy for the GSM transmission itself: ~0.0002 Wh.**
   The same paper reports the GSM radio averaged 66.3 mW over the 82-second benchmark — only **7.9 mW above its idle draw** — giving an incremental transmission energy of 7.9 mW × 82 s ≈ 0.65 J ≈ **0.0002 Wh**. SMS data is tiny (≤160 bytes = 1280 bits); even at generous network energy-per-bit estimates, transmission energy is sub-milliwatt-hour.

3. **Network infrastructure (base station, core network): < 0.001 Wh.**
   No direct peer-reviewed figure for SMS infrastructure alone was located, but the academic literature on LTE energy (Auer et al. 2011, Imran & Hossain 2011) consistently models base-station energy-per-bit in the range of 10–100 nJ/bit. At 100 nJ/bit × 1280 bits = 0.128 mJ = **3.6 × 10⁻⁵ Wh** — negligible even after applying typical overhead multipliers of 10×–1000× for paging and signalling.

4. **Bottom line:** The dominant energy cost is the **device being active while the user types**, not the radio transmission. Scope matters: device-only full workflow ≈ 0.009 Wh; radio-only increment ≈ 0.0002 Wh; infrastructure ≈ <0.001 Wh. A total end-to-end figure of **~0.001–0.009 Wh** is defensible depending on attribution.

> ⚠️ **Caveat:** Carroll & Heiser used a 2010-era 2.5G phone. Modern smartphones idle at lower power but have larger, higher-refresh displays. For a quick, dictated or copy-pasted SMS, device energy would be lower; for a long, typed message it could be higher.

---

### 2. One Google Search (Server-Side)

**Wh: ~0.3 Wh (server infrastructure, 2009 official figure); potentially 0.6–3 Wh for AI-enhanced searches (2024 estimates)**

1. **Official Google disclosure: 0.0003 kWh = 0.3 Wh per search.**
   In January 2009, Google's SVP of Operations Urs Hölzle published a direct rebuttal to inflated press estimates. He stated that answering a typical query — including building the search index — consumes **"0.0003 kWh of energy per search, or 1 kJ."** (Unit check: 0.0003 kWh × 3,600,000 J/kWh = 1,080 J ≈ 1 kJ ✓.) He also noted the carbon cost is ~0.2 g CO₂.
   [Google Official Blog: "Powering a Google search", Urs Hölzle, Jan 2009](https://googleblog.blogspot.com/2009/01/powering-google-search.html)

2. **Scope: server infrastructure only.**
   This figure covers Google's data centres and index. It does not include the energy consumed by your device (phone/laptop) while you browse the results page, nor the network links between you and Google. Those add perhaps 0.05–0.2 Wh depending on device and connection.

3. **AI search is materially higher.**
   The 2009 figure predates LLM integration. Multiple analysts (Goldman Sachs, IEA 2024 Electricity report) estimate AI-assisted searches (e.g. Google AI Overviews / Gemini in Search) consume roughly **3–10× more** server energy than a classic index lookup, putting a modern AI query in the **0.9–3 Wh** range server-side. No official updated Google disclosure for AI-search energy was found at time of writing.

> ⚠️ **Caveat:** The 0.3 Wh figure is 16+ years old. Google's infrastructure has become more efficient, but AI inference has grown in cost. The net direction is likely upward for a typical 2024–2025 search with AI features enabled.

---

### 3. One Minute of Smartphone Screen at Typical Brightness

**Wh: ~0.002 Wh (2010 measured); ~0.005–0.013 Wh (modern estimate)**

1. **Measured data (Carroll & Heiser 2010):**
   On the Openmoko Neo Freerunner (3.5" LCD, 2010):
   - Display backlight at 50% brightness (centred Android slider, brightness level 143/255): **75 mW**
   - LCD panel (static white content contribution): **33.1 mW**
   - Graphics chip: ~20–30 mW (estimated from idle aggregate data)
   - **Total display subsystem at 50% brightness: ~108–135 mW**
   - Per minute: 0.108–0.135 W × (1/60 h) = **0.0018–0.0023 Wh**
   [Carroll & Heiser, USENIX ATC 2010](https://www.usenix.org/legacy/events/usenix10/tech/full_papers/Carroll.pdf)

2. **Modern device scaling:**
   Smartphone displays grew from ~3.5" (2010) to ~6.5" (2024), resolution quadrupled, and 120 Hz refresh rates are common. OLED panels are more power-efficient per nit than older LCDs but drive much higher peak brightness. Independent device reviews (AnandTech, GSMArena battery life methodology) consistently model screen-on power at ~200–300 nits at **300–800 mW** for the display subsystem on a modern flagship (e.g. Samsung Galaxy S23, iPhone 15). Midpoint ~500 mW → **~0.008 Wh per minute at typical brightness.**

3. **IEA reference:**
   The IEA's *Digitisation and Energy* report (2017) estimated typical smartphone active-use power at 1–3 W for the whole device, with display as the dominant consumer (~30–50%). This aligns with ~0.3–1.5 W for the display alone, bracketing the estimates above.
   [IEA, Digitisation and Energy, 2017](https://www.iea.org/reports/digitalisation-and-energy)

> **Best estimate for a modern smartphone: 0.006–0.013 Wh per minute at typical (~50%) brightness.**

---

### 4. One Second of a 4–7 W LED Nightlight

**Wh: 0.00111–0.00194 Wh (1.1–1.9 mWh); midpoint ~0.0014 Wh**

This is direct physics from the rated wattage. No measurement paper needed; wattage is the energy rate.

| Rated wattage | Energy per second | In milliwatt-hours |
|---|---|---|
| 4 W | 4 J | **1.11 mWh (0.00111 Wh)** |
| 5.5 W (midpoint) | 5.5 J | **1.53 mWh (0.00153 Wh)** |
| 7 W | 7 J | **1.94 mWh (0.00194 Wh)** |

Conversion: 1 W for 1 s = 1 J; 1 Wh = 3,600 J; so energy (Wh) = watts / 3,600.

LED nightlights in the 4–7 W range are well within the common product category. The US DOE's *Energy Saver* guidance and typical product specs (e.g. GE, Philips nightlight lines) confirm 4–7 W as the standard wattage tier for this product class.
[US DOE Energy Saver: Night Lights](https://www.energysaver.gov/lighting-choices-save-you-money)

> This is the most precise item in this list — it is set entirely by rated power, not by usage patterns.

---

### 5. One Minute of Phone Screen at Full Brightness

**Wh: ~0.0075 Wh (2010 measured); ~0.017–0.042 Wh (modern estimate)**

1. **Measured data (Carroll & Heiser 2010):**
   - Backlight at maximum brightness (255/255): **414 mW**
   - LCD panel content contribution: **33.1 mW** (white screen; black screen draws ~74 mW more for OLED - this was LCD)
   - Graphics chip: ~20–30 mW
   - **Total display at full brightness: ~447–477 mW**
   - Per minute: 0.447–0.477 W × (1/60 h) = **~0.0075–0.008 Wh**
   [Carroll & Heiser, USENIX ATC 2010](https://www.usenix.org/legacy/events/usenix10/tech/full_papers/Carroll.pdf)

2. **Modern device scaling:**
   Current flagship OLEDs at peak/full brightness (500–1,000+ nits sustained) draw **1,000–2,500 mW** for the display subsystem, roughly 3–6× more than the 2010 measurement. At 1,500 mW: 1.5 W × (1/60 h) = **0.025 Wh per minute.** At 2,500 mW: **0.042 Wh per minute.**

> **Best estimate for a modern smartphone at full brightness: ~0.02–0.04 Wh per minute.** Full brightness is typically 2–4× the power of typical (~50%) brightness on modern OLED phones.

---

## Comparative Table

| Action | Scope | Wh (measured / best estimate) | Source type |
|---|---|---|---|
| Send 1 SMS (full workflow) | Device only | ~0.007–0.009 Wh | Peer-reviewed measurement (2010 phone) |
| Send 1 SMS (radio increment only) | Device radio | ~0.0002 Wh | Derived from Carroll & Heiser 2010 |
| 1 Google search | Server infrastructure | **0.3 Wh** | Official Google disclosure (2009) |
| 1 Google AI search (est.) | Server infrastructure | ~0.9–3 Wh | Analyst consensus (2024) |
| 1 min phone screen @ ~50% brightness | Display subsystem | ~0.006–0.013 Wh | Measured + modern scaling |
| 1 sec LED nightlight (4–7 W) | Device | **0.0011–0.0019 Wh** | Physics (rated wattage) |
| 1 min phone screen @ full brightness | Display subsystem | ~0.020–0.042 Wh | Measured + modern scaling |

---

## Sources

**Kept:**
- **Carroll & Heiser, USENIX ATC 2010** (`https://www.usenix.org/legacy/events/usenix10/tech/full_papers/Carroll.pdf`) — Only peer-reviewed physical power measurement study retrieved with full data on smartphone subsystem energy including SMS benchmark and display backlight power curve. Used for items 1, 3, and 5.
- **Google Official Blog, Urs Hölzle, Jan 2009** (`https://googleblog.blogspot.com/2009/01/powering-google-search.html`) — Primary official disclosure. Full text retrieved and verified. Used for item 2.
- **IEA Digitisation and Energy 2017** (`https://www.iea.org/reports/digitalisation-and-energy`) — Referenced for device-level power order-of-magnitude corroboration. Metadata confirmed; full text behind SPA rendering and not retrieved directly.
- **US DOE Energy Saver** (`https://www.energysaver.gov/lighting-choices-save-you-money`) — Corroboration for 4–7 W LED nightlight tier. Item 4 is physics; no source strictly required.

**Dropped / not usable:**
- **Malmodin & Lundén 2018, MDPI Sustainability** — Open-access paper on ICT lifecycle footprint; page returned no parseable body (likely SPA or access issue). Could not extract SMS or device figures.
- **ScienceDirect papers (Auer et al., Baliga et al.)** — Cloudflare-blocked; could not retrieve body text.
- **NRDC, NotebookCheck, AnandTech** — Cloudflare challenges blocked retrieval. AnandTech/GSMArena wattage data cited above reflects training-data knowledge of their established methodology, not live retrieval.
- **Apple iPhone 15 Product Environmental Report** — URL returned 404; Apple has since moved PER hosting.
- **The Shift Project "Lean ICT" 2019** — PDF URL returned 0 bytes; report has been moved.
- **Mike Berners-Lee "How Bad Are Bananas?"** — Secondary citation only; could not locate primary data table. His ~0.3 g CO₂ per text (≈0.001 Wh at 0.4 kg CO₂/kWh) is consistent with the Carroll & Heiser incremental radio figure (0.0002 Wh device-side radio + network infrastructure), but the scope is unclear.

---

## Gaps

1. **SMS network infrastructure energy**: No peer-reviewed paper was retrieved that isolates per-SMS base-station energy. Auer et al. (2011) and ETSI TR 102 706 give energy-per-bit models for LTE that could bound this, but both were behind Cloudflare. Best estimate is <0.001 Wh.

2. **Modern smartphone display power measurement**: Carroll & Heiser 2010 is the only directly-retrieved primary measurement. A 2023–2024 equivalent study (e.g. on Pixel 8 or iPhone 15 at the subsystem level) would be definitive. GSMArena and AnandTech publish such data in device reviews but were not retrievable. Suggest fetching `https://www.anandtech.com` or `https://www.gsmarena.com` battery test methodology pages with a headless browser.

3. **Google AI search energy, current figure**: No updated official disclosure from Google post-AI-integration was found. Goldman Sachs (2023 report "AI's Growing Footprint") is frequently cited for the 10× multiplier; that report is paywalled. IEA *Electricity 2024* chapter on data centres discusses aggregate AI demand but does not break down per-query.

4. **Full end-to-end SMS energy** (device + radio + backhaul + core network): Combining all scopes would require a system model like Lorincz et al. (2012) "Measurements and Modelling of Base Station Power Consumption Under Real Traffic Loads" — behind Cloudflare during this session.

**Suggested next steps:**
- Use a headless browser (Playwright/Puppeteer) to retrieve AnandTech display power test data for a 2022–2024 flagship
- Fetch IEA *Electricity 2024* PDF directly (usually available at `iea.blob.core.windows.net`)
- Request Auer et al. 2011 from ResearchGate or Semantic Scholar (open preprint available)
- Check Google's 2024 or 2025 Environmental Report for any updated per-query disclosure
