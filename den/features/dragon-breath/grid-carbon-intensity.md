# Research: Cloud Region Carbon Intensity (gCO2eq/kWh)

## Summary

Grid carbon intensity varies enormously across cloud regions — from as low as 3 gCO2eq/kWh (Stockholm hydro/nuclear) to over 650 gCO2eq/kWh (South Africa, India coal). Google Cloud publishes the most complete official grid intensity data (via Electricity Maps, 2024 vintage). AWS and Azure do not publish per-region grid intensity publicly; best estimates come from EPA eGRID (US) and country-level IEA/EEA data. Real-time APIs (Electricity Maps, WattTime) enable dynamic workload scheduling to minimize carbon impact.

---

## Findings

1. **Google Cloud is the only hyperscaler with official per-region grid carbon intensity data.** GCP publishes both `CFE%` (carbon-free energy percentage) and `Grid carbon intensity (gCO2eq/kWh)` for all regions annually, sourced from [Electricity Maps](https://www.electricitymap.org/map). The 2024 data is the most authoritative per-region reference available. [Source](https://cloud.google.com/sustainability/region-carbon)

2. **AWS and Azure do not publish grid carbon intensity per region.** AWS reports company-level 100% renewable matching (2024) and PUE metrics but no per-region grid intensity values. Azure's Emissions Impact Dashboard and Carbon Optimization tool provide customer-specific consumption emissions but not raw grid intensity. For third-party estimates, the [Cloud Carbon Footprint (CCF)](https://www.cloudcarbonfootprint.org/docs/methodology/) project maps AWS/Azure regions to EPA eGRID NERC regions (US) and country-level EEA/carbonfootprint.com factors (international).

3. **EPA eGRID 2023 (released Jan 2025) provides US subregion-level data.** Values are in lb/MWh CO2e; multiply by 0.4536 to convert to gCO2eq/kWh. The US national average is 770.9 lb/MWh → **350 gCO2eq/kWh**. Key subregions: RFCE (Mid-Atlantic/Virginia) = 272 gCO2/kWh; MROW (Midwest/Iowa) ≈ 420 gCO2/kWh; NWPP (broad Northwest) = 288 gCO2/kWh. Note: Oregon's BPA-dominated grid is far cleaner than the NWPP average (GCP reports 79 gCO2/kWh for Oregon specifically). [Source](https://www.epa.gov/egrid/summary-data)

4. **Brazil and Canada are the cleanest non-European locations** due to massive hydroelectric capacity. GCP's southamerica-east1 (São Paulo) reports 67 gCO2/kWh and northamerica-northeast1 (Montréal) reports just 5 gCO2/kWh (99% CFE). CCF estimates Brazil at 61.7 gCO2/kWh and Canada at 120 gCO2/kWh (country-wide average; Québec specifically is near-zero). [Source](https://cloud.google.com/sustainability/region-carbon)

5. **Asia-Pacific regions are generally high-intensity**, driven by coal and LNG. GCP reports: Tokyo 453, Singapore 367, Taiwan 439, Sydney 498. India (Mumbai) reaches 679 gCO2/kWh. South Africa (Johannesburg) is the highest at 657 gCO2/kWh. [Source](https://cloud.google.com/sustainability/region-carbon)

6. **European regions span a wide range** — Finland (39), Belgium (103), Ireland (~103–279), Netherlands (209), Frankfurt (276), and Poland (Warsaw 643). Nuclear-heavy France is extremely clean (16 gCO2/kWh for GCP europe-west9/Paris). Renewable-rich Nordic countries are the cleanest zones globally. [Source](https://cloud.google.com/sustainability/region-carbon)

7. **Electricity Maps is the primary real-time data provider** used by Google Cloud, and optionally by the Cloud Carbon Footprint tool. The Electricity Maps API offers real-time carbon intensity, forecasts, and historical data at 5-min/hourly granularity. Commercial pricing starts at ~€6,000/country/year; a free public tier exists for non-commercial use. [Source](https://www.electricitymaps.com/pricing)

8. **WattTime provides marginal emissions rates** (the carbon intensity of the next unit of electricity consumed — more useful for demand-shifting decisions than average intensity). Used by the Green Software Foundation's Carbon Aware SDK for workload scheduling. [Source](https://watttime.org)

9. **AWS reached 100% renewable energy matching in 2024** (second consecutive year), achieved via RECs and PPAs globally. This is a market-based figure and does not change the underlying grid carbon intensity. AWS reports global PUE of 1.15 in 2024, among the best in the industry. [Source](https://sustainability.aboutamazon.com/products-services/the-cloud)

10. **The global average grid carbon intensity is approximately 436–475 gCO2eq/kWh** (IEA 2023 estimates for electricity generation; lifecycle figures including upstream emissions are ~475–500 gCO2eq/kWh). The US average is ~350 gCO2eq/kWh (EPA eGRID 2023). These are the appropriate defaults when no region-specific data is available.

---

## Lookup Table

### GCP Regions — Official Data (2024)
Source: [Google Cloud Region Carbon](https://cloud.google.com/sustainability/region-carbon) | Data provider: Electricity Maps | **Confidence: High**

| GCP Region | Location | Grid gCO2eq/kWh | Google CFE% | Energy Mix Notes |
|---|---|---|---|---|
| **us-central1** | Iowa | **413** | 87% | Wind-heavy grid; Google PPAs push CFE high |
| **us-east1** | South Carolina | **576** | 31% | Coal + natural gas heavy |
| us-east4 | Northern Virginia | 323 | 62% | Mixed gas/nuclear/some renewables |
| **us-west1** | Oregon | **79** | 87% | BPA hydro-dominated; very clean |
| us-west2 | Los Angeles | 169 | 63% | CA gas + solar mix |
| **europe-west1** | Belgium | **103** | 84% | Nuclear + wind |
| europe-west3 | Frankfurt | 276 | 68% | Gas + coal + renewables |
| **europe-west4** | Eemshaven, NL | **209** | 83% | Gas + wind, Google wind PPAs |
| europe-west9 | Paris | 16 | 96% | Nuclear-dominated |
| europe-north1 | Finland | 39 | 98% | Hydro + nuclear + wind |
| europe-north2 | Stockholm | 3 | 100% | Near-zero: hydro + nuclear |
| northamerica-northeast1 | Montréal | 5 | 99% | Québec hydro |
| northamerica-northeast2 | Toronto | 59 | 84% | Ontario hydro + nuclear |
| **asia-east1** | Taiwan | **439** | 17% | Coal + LNG heavy |
| **asia-northeast1** | Tokyo | **453** | 17% | LNG + coal; nuclear offline |
| asia-northeast2 | Osaka | 296 | 46% | Slightly better nuclear mix |
| **asia-southeast1** | Singapore | **367** | 4% | Almost entirely natural gas |
| australia-southeast1 | Sydney | 498 | 34% | Coal + gas (transitioning) |
| **southamerica-east1** | São Paulo | **67** | 88% | Hydro-dominated |
| africa-south1 | Johannesburg | 657 | 15% | Coal-dominated (Eskom) |
| asia-south1 | Mumbai | 679 | 9% | Coal-heavy Indian grid |

*Bold = regions requested. CFE% includes Google's carbon-free energy purchases (PPAs).*

---

### AWS Regions — Estimated Grid Intensity
Source: CCF (Cloud Carbon Footprint) + EPA eGRID 2023 + GCP data for same locations | **Confidence: Medium**

AWS does not publish per-region grid intensity. Estimates use the underlying national/regional grid. Where GCP operates in the same city, GCP's Electricity Maps data is the best available reference.

| AWS Region | Location | Est. Grid gCO2eq/kWh | Basis | Notes |
|---|---|---|---|---|
| **us-east-1** | N. Virginia | **272–323** | EPA eGRID RFCE 2023 (272) / GCP us-east4 (323) | Mid-Atlantic grid; gas + some nuclear |
| **us-west-2** | Oregon | **~79–288** | GCP us-west1 (79) / CCF WECC (322) | BPA hydro; GCP figure far more accurate for OR specifically |
| **eu-west-1** | Ireland | **~103–279** | GCP europe-west1 Belgium proxy (103); CCF EEA Ireland (279) | Wind-heavy but variable; 2024 grid improving |
| **eu-central-1** | Frankfurt | **276–339** | GCP europe-west3 (276); CCF Germany (339) | Gas + coal; 2024 GCP value preferred |
| **ap-northeast-1** | Tokyo | **453–466** | GCP asia-northeast1 (453); CCF Japan (466) | LNG/coal; nuclear largely offline |
| **ap-southeast-1** | Singapore | **367–408** | GCP asia-southeast1 (367); CCF Singapore (408) | Near-entirely gas |
| **ap-southeast-2** | Sydney | **498–760** | GCP australia-southeast1 (498); CCF Australia (760) | NSW coal-heavy grid; GCP 2024 value preferred |
| **sa-east-1** | São Paulo | **61–67** | GCP southamerica-east1 (67); CCF Brazil (61.7) | Hydro-dominated; one of cleanest globally |
| **ca-central-1** | Canada (central) | **59–120** | CCF Canada national avg (120); GCP Toronto (59); Montréal (5) | Ontario/Québec hydro+nuclear; very clean |

*Note: The wide ranges reflect methodology differences. GCP's Electricity Maps-derived figures (where available for the same grid zone) are more accurate than CCF NERC-region or country averages.*

---

### Azure Regions — Estimated Grid Intensity
Source: CCF methodology + EPA eGRID + EEA + carbonfootprint.com | **Confidence: Medium**

Azure co-locates datacenters in the same grid zones as AWS (Virginia, Washington state, Ireland, Netherlands, Tokyo, Singapore).

| Azure Region | Location | Est. Grid gCO2eq/kWh | Basis | Notes |
|---|---|---|---|---|
| **eastus** | Virginia | **272–379** | EPA eGRID RFCE 2023 (272); CCF SERC (379) | Same grid as AWS us-east-1 |
| **westus2** | Washington state | **~79–322** | GCP us-west1 Oregon proxy (79); CCF WECC (322) | BPA hydro; Pacific NW is much cleaner than WECC avg |
| **westeurope** | Netherlands | **209–328** | GCP europe-west4 NL (209); CCF EEA Netherlands (328) | Gas + wind; GCP 2024 value preferred |
| **northeurope** | Ireland | **103–279** | GCP europe-west1 Belgium proxy (103); CCF EEA Ireland (279) | Wind-heavy; use Electricity Maps for real-time |
| **japaneast** | Tokyo, Saitama | **453–466** | GCP asia-northeast1 (453); CCF Japan (466) | LNG/coal |
| **southeastasia** | Singapore | **367–408** | GCP asia-southeast1 (367); CCF Singapore (408) | Gas grid |

---

### EPA eGRID 2023 — US Subregion Reference
Source: [EPA eGRID Summary Data 2023](https://www.epa.gov/egrid/summary-data) | Released Jan 2025 | **Confidence: High (US only)**

Conversion: `lb/MWh × 0.4536 = gCO2eq/kWh`

| eGRID Subregion | CO2e lb/MWh | gCO2eq/kWh | Cloud Region Relevance |
|---|---|---|---|
| RFCE (RFC East, Mid-Atlantic) | 599.2 | **272** | AWS us-east-1, Azure eastus (Virginia) |
| SRVC (SE Virginia/Carolinas) | 596.3 | **270** | Carolinas-region workloads |
| MROW (Midwest West) | 926.6 | **420** | Iowa datacenter region |
| CAMX (California) | 430.0 | **195** | AWS us-west-1 (N. California) |
| NWPP (Northwest Power Pool) | 635.3 | **288** | Broad PNW average (OR/WA/ID/MT) — Oregon is far cleaner |
| ERCT (Texas ERCOT) | 736.6 | **334** | Texas cloud regions |
| NEWE (New England) | 543.2 | **246** | New England |
| FRCC (Florida) | 784.8 | **356** | Florida |
| SPSO (S. Plains South) | 875.6 | **397** | S. Plains |
| **US National Average** | **770.9** | **350** | Default when no US region data available |

---

## Clean vs. Dirty: Notable Regions

### 🟢 Cleanest (< 150 gCO2eq/kWh)

| Region | Location | gCO2eq/kWh | Why Clean |
|---|---|---|---|
| GCP europe-north2 | Stockholm | **3** | Hydro + nuclear |
| GCP northamerica-northeast1 | Montréal | **5** | Québec hydro |
| GCP europe-north1 | Finland | **39** | Hydro + nuclear + wind |
| GCP northamerica-northeast2 | Toronto | **59** | Ontario hydro + nuclear |
| GCP/AWS sa-east-1 | São Paulo | **67** | Brazilian hydro |
| GCP/AWS us-west-2 | Oregon | **~79** | BPA Columbia River hydro + wind |
| GCP europe-west9 | Paris | **16** | French nuclear (~70% of grid) |
| GCP europe-west6 | Zürich | **15** | Swiss hydro + nuclear |

### 🔴 Dirtiest (> 450 gCO2eq/kWh)

| Region | Location | gCO2eq/kWh | Why Dirty |
|---|---|---|---|
| GCP asia-south1 | Mumbai | **679** | Indian coal grid |
| GCP africa-south1 | Johannesburg | **657** | Eskom coal >70% |
| GCP asia-south2 | Delhi | **532** | Indian coal grid |
| GCP us-east1 | South Carolina | **576** | Coal + gas mix |
| GCP australia-southeast1 | Sydney | **498** | NSW coal/gas transitioning |
| GCP/AWS ap-northeast-1 | Tokyo | **453** | LNG + coal; post-Fukushima nuclear offline |
| GCP asia-east1 | Taiwan | **439** | Coal + LNG |
| GCP europe-central2 | Warsaw | **643** | Polish coal grid |

---

## Real-Time Carbon Intensity APIs

### 1. Electricity Maps API
- **URL:** https://electricitymaps.com / https://api.electricitymap.org
- **Used by:** Google Cloud (primary data source for GCP region data), Cloud Carbon Footprint (optional integration)
- **Signals:** Real-time carbon intensity, electricity mix by source, 24h forecasts, historical data
- **Granularity:** 5-minute, 15-minute, hourly; 200+ grid zones globally
- **Pricing:** Commercial from ~€6,000/country/year; free non-commercial tier available
- **Methodology:** Location-based, consumption-based (flow-tracing across interconnects), attributional per GHG Protocol Scope 2
- **Authentication:** API key (Bearer token)
- **Key endpoint:** `GET https://api.electricitymap.org/v3/carbon-intensity/latest?zone=US-NW-BPAT`

### 2. WattTime API
- **URL:** https://watttime.org / https://api2.watttime.org
- **Used by:** Green Software Foundation Carbon Aware SDK, some AWS sustainability tooling
- **Signals:** **Marginal** operating emissions rate (MOER) — what carbon is emitted by the next unit of electricity consumed. Better for demand-shifting; different from average intensity.
- **Coverage:** US balancing authorities + growing global coverage
- **Pricing:** Tiered; free tier for basic access; commercial for forecasts/history
- **Key endpoint:** `GET https://api2.watttime.org/v3/signal-types` + `/historical` or `/forecast`

### 3. Google Cloud Carbon Footprint API
- **URL:** https://cloud.google.com/carbon-footprint
- **Scope:** Customer-specific emissions for GCP workloads (not raw grid intensity)
- **Methodology:** Hourly location-based (uses Electricity Maps) + annual market-based (with Google PPAs)
- **Access:** Free for GCP customers; available via Cloud Console and API
- **Use case:** Reporting GCP Scope 3 emissions; NOT suitable as a general grid intensity lookup

### 4. Azure Carbon Optimization API
- **URL:** https://learn.microsoft.com/en-us/azure/carbon-optimization/
- **Scope:** Azure customer emissions by subscription/resource/region (monthly updates)
- **Access:** Free for Azure customers; REST API + CSV export
- **Limitations:** Updated monthly (not real-time); 12-month retention window

### 5. AWS Customer Carbon Footprint Tool
- **URL:** Available in AWS Cost Explorer
- **Scope:** Customer-specific AWS workload emissions (location-based + market-based)
- **Access:** Free via AWS Console; exportable via Cost and Usage Reports
- **Limitations:** Not a real-time API; data lags ~3 months; no raw grid intensity exposed

---

## Global Default Values

| Scope | gCO2eq/kWh | Source |
|---|---|---|
| Global electricity generation average | **~436** | IEA 2023 estimate |
| Global lifecycle (incl. upstream) | **~475–500** | Common ICT carbon accounting default |
| US national average (2023) | **~350** | EPA eGRID 2023 (770.9 lb/MWh CO2e) |
| EU average (2022) | **~230–280** | EEA data |
| **Recommended fallback (no region data)** | **~475** | Conservative global default for cloud workloads |

---

## Sources

**Kept:**
- `Google Cloud Region Carbon` (https://cloud.google.com/sustainability/region-carbon) — Official GCP grid intensity + CFE% for all regions, 2024 data from Electricity Maps. **Primary reference.**
- `Google Cloud Carbon Footprint Methodology` (https://cloud.google.com/carbon-footprint/docs/methodology) — Explains hourly Electricity Maps data use, GHG Protocol alignment, location vs market-based methods
- `Cloud Carbon Footprint Methodology` (https://www.cloudcarbonfootprint.org/docs/methodology/) — Complete AWS + Azure + GCP grid emission factor appendices; maps regions to EPA/EEA/carbonfootprint.com sources. **Best available for AWS/Azure per-region estimates.**
- `EPA eGRID Summary Data 2023` (https://www.epa.gov/egrid/summary-data) — US subregion CO2e rates in lb/MWh, released Jan 2025. Authoritative for US grid zones.
- `AWS Cloud Sustainability` (https://sustainability.aboutamazon.com/products-services/the-cloud) — PUE data, renewable matching status, efficiency claims
- `Azure Emissions Calculation Methodology` (https://learn.microsoft.com/en-us/power-bi/connect-data/azure-emissions-calculation-methodology) — Microsoft's Scope 1/2/3 methodology; uses grid emission factors per datacenter region
- `Azure Carbon Optimization` (https://learn.microsoft.com/en-us/azure/carbon-optimization/overview) — Customer-facing Azure emissions API
- `Electricity Maps Methodology` (https://www.electricitymaps.com/methodology) — Consumption-based, flow-tracing methodology; explains why hourly data differs from annual averages
- `GoogleCloudPlatform/region-carbon-info` (https://github.com/GoogleCloudPlatform/region-carbon-info) — Machine-readable GCP carbon data (JSON/CSV); same data as cloud.google.com page

**Dropped:**
- IEA WEO 2024 page — Too high-level; scenario analysis rather than per-country grid factors
- WattTime API docs — No content extractable; marginal vs average intensity requires separate consideration
- Ember Energy data page — CSV download available but requires processing; GCP data already uses best available sources

---

## Gaps

1. **AWS/Azure official per-region grid intensity is not public.** The ranges above are derived from the same underlying grid (matched by geography) rather than from AWS/Azure directly. For authoritative values, request via AWS/Azure sustainability teams or use Electricity Maps API with the correct grid zone for each datacenter.

2. **Oregon BPA grid zone vs NWPP average** — The 79 gCO2/kWh figure (GCP's Oregon data from Electricity Maps zone `US-NW-BPAT`) is far more accurate for Oregon datacenters than the CCF WECC average (322 gCO2/kWh). Similarly, Azure westus2 (Washington state) likely falls in the same BPA zone and is similarly clean. The CCF WECC figures significantly overstate emissions for Pacific Northwest regions.

3. **Data vintage varies.** GCP data is 2024; EPA eGRID is 2023; CCF uses 2020–2022 eGRID/EEA/carbonfootprint.com. Grids are changing rapidly (especially Australia, South Korea, Chile) — values may shift significantly year over year.

4. **Time-of-day variation is not captured.** Electricity Maps and WattTime provide real-time data that can vary 2–5× within a single day. Batch workloads scheduled to run during low-carbon periods (typically overnight when solar is off but wind and nuclear dominate) can significantly reduce effective emissions.

5. **Market-based vs location-based distinction.** The figures in this table are all **location-based** (actual grid mix). Market-based figures (after applying RECs, PPAs) will be lower for all three providers — near-zero for Google Cloud globally, and significantly reduced for AWS/Azure in regions with active PPA coverage.

**Suggested next steps:**
- For real-time workload scheduling: integrate [Electricity Maps API](https://electricitymaps.com) using GCP's zone mappings from [region-carbon-info repo](https://github.com/GoogleCloudPlatform/region-carbon-info)
- For AWS/Azure: query Electricity Maps using the known datacenter locations (e.g., `US-MIDA-PJM` for Virginia, `US-NW-BPAT` for Oregon/Washington)
- For IEA country-level data: download from https://iea.org/data-and-statistics/data-products (electricity generation + CO2 by country, annual)
