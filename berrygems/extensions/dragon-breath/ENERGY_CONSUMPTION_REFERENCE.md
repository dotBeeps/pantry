# Energy Consumption Reference — Hardcoded Constants

**Last updated:** April 5, 2026 (Research by pi researcher agent)

---

## 1. Gaming PC (Mid-Range GPU, 1 Hour Under Load)

**Recommended Wh:** `300`

| Aspect | Value |
|---|---|
| Value | 300 Wh |
| Source | Lawrence Berkeley National Laboratory — *"Energy Use by U.S. Residential Gaming"* (2019) |
| Source URL | https://www.osti.gov/biblio/1505679 |
| Context | Mid-tier gaming desktop (NVIDIA RTX 3060–4060 equivalent) draws ~200–350 W at wall during active gameplay; LBNL 2019 measured 140–280 W on older generation, current efficiency per frame is similar. |
| Reliability | ⚠️ Moderate — No government rating exists; LBNL is peer-reviewed but 2019 data. Corroborated by ENERGY STAR GPU TDP specifications. |

---

## 2. Average US Household — 1 Day

**Recommended Wh:** `29563`

| Aspect | Value |
|---|---|
| Value | 29,563 Wh (29.56 kWh/day) |
| Source | U.S. Energy Information Administration (EIA) — FAQ #97: *"How much electricity does an American home use?"* |
| Source URL | https://www.eia.gov/tools/faqs/faq.php?id=97&t=3 |
| Context | 2022 annual average: 10,791 kWh/year ÷ 365 days = 29.56 kWh/day; based on metered utility data covering all US residential customers; varies widely by state (Louisiana ~40 kWh/day, Hawaii ~17 kWh/day). |
| Reliability | ✅ Highest — Direct metering data, U.S. government source, updated January 2024. |

---

## 3. Average US Household — 1 Month

**Recommended Wh:** `899000`

| Aspect | Value |
|---|---|
| Value | 899,000 Wh (899 kWh/month) |
| Source | U.S. Energy Information Administration (EIA) — FAQ #97: *"How much electricity does an American home use?"* |
| Source URL | https://www.eia.gov/tools/faqs/faq.php?id=97&t=3 |
| Context | 2022 annual average: 10,791 kWh/year ÷ 12 months = 899 kWh/month; same data as daily figure, directly stated in FAQ. |
| Reliability | ✅ Highest — Directly published government metering data, no calculation required. |

---

## 4. Average EV — Per Mile

**Recommended Wh/mile:** `300`

| Aspect | Value |
|---|---|
| Value | 300 Wh/mile (30 kWh/100 miles) |
| Source | U.S. EPA/DOE — *fueleconomy.gov* official EV efficiency ratings |
| Source URL | https://www.fueleconomy.gov/ws/rest/vehicle/{id} (API); https://www.fueleconomy.gov/feg/bymodel/2024_Tesla_Model_3.shtml (example) |
| Context | 2024 model year data: popular BEVs average 25.4–33.0 kWh/100 mi (Tesla Model 3 RWD most efficient at 254 Wh/mi, larger EVs at 320–330 Wh/mi); mainstream fleet average ≈300 Wh/mi. |
| Reliability | ✅ Highest — Official EPA ratings (identical to Monroney window sticker); fueleconomy.gov is the authoritative U.S. government source. |
| Note | Range: 250–340 Wh/mile for mainstream BEVs; trucks/full-size SUVs can exceed 400 Wh/mile. |

---

## 5. 10-Minute Hot Shower (Electric Water Heater)

**Recommended Wh:** `3180` *(storage tank)* or `1417` *(instant/tankless)*

### Storage Tank (Most Common in US Homes)

| Aspect | Value |
|---|---|
| Value | 3,180 Wh (3.18 kWh) |
| Source | DOE Energy Saver — *Water Heating*; EPA WaterSense — *Showerheads* |
| Source URLs | https://www.energy.gov/energysaver/water-heating; https://www.epa.gov/watersense/showerheads |
| Context | Calculated from thermal energy: WaterSense 2.0 GPM showerhead × 10 min × 65°F temperature rise (55°F inlet → 120°F delivery) = 3,180 Wh; DOE recommends tank set to 120°F. |
| Reliability | ✅ Good — DOE provides methodology and temperature standard; EPA sets the flow rate standard; calculation is thermodynamic physics. |
| Formula | `Energy(Wh) = GPM × minutes × 8.34 × ΔT°F ÷ 3.412` |

**Breakdown by showerhead efficiency:**
- Standard (2.5 GPM): 3,970 Wh
- **WaterSense (2.0 GPM): 3,180 Wh** ← recommended default
- Low-flow (1.5 GPM): 2,380 Wh

### Instant/Tankless (Self-Contained Electric Heater at Showerhead)

| Aspect | Value |
|---|---|
| Value | 1,417 Wh (1.42 kWh) |
| Source | DOE Energy Saver — *Tankless or Demand-Type Water Heaters* |
| Source URL | https://www.energy.gov/energysaver/tankless-or-demand-type-water-heaters |
| Context | Point-of-use unit rated 8,500 W (typical range 6–12 kW) × 10 min ÷ 60 min/hr = 1,417 Wh; common outside US and sold in US as alternative to storage tanks. |
| Reliability | ✅ Good — DOE provides wattage range; direct calculation with no estimation. |

**Use case:** Choose `3180` for typical US household; use `1417` if modeling instant electric shower (European style).

---

## 6. 1500W Space Heater — 1 Hour

**Recommended Wh:** `1500`

| Aspect | Value |
|---|---|
| Value | 1,500 Wh (exact, by physics) |
| Source | DOE Energy Saver — *Electric Resistance Heating*; National Electrical Code (NEC 210.19) |
| Source URLs | https://www.energy.gov/energysaver/electric-resistance-heating; https://www.energy.gov/energysaver/estimating-appliance-and-home-electronic-energy-use |
| Context | 1,500 W is the de facto US standard for portable space heaters, constrained by household circuit limits (120 V × 12.5 A = 1,500 W continuous, 80% of 15 A breaker per NEC 210.19); direct calculation: 1,500 W × 1 hr = 1,500 Wh. |
| Reliability | ✅ Highest — Pure physics (P × t) plus DOE + electrical code confirmation. |

---

## Summary Table (For Code)

```typescript
// Energy consumption constants (Wh, updated 2026-04-05)
export const ENERGY = {
  // Gaming / Devices
  GAMING_PC_1_HOUR_WH: 300,
  SPACE_HEATER_1500W_1_HOUR_WH: 1500,
  
  // US Household (EIA)
  US_HOUSEHOLD_1_DAY_WH: 29563,
  US_HOUSEHOLD_1_MONTH_WH: 899000,
  
  // Transportation
  EV_AVERAGE_WH_PER_MILE: 300,
  
  // Hot Water
  ELECTRIC_SHOWER_10_MIN_WH: 3180,           // Storage tank (WaterSense 2.0 GPM)
  ELECTRIC_SHOWER_INSTANT_10_MIN_WH: 1417,  // Tankless/point-of-use
} as const;
```

---

## Research Notes

### Reliability Ranking (Best to Worst)

1. **✅ Highest** — EIA household data, EPA EV ratings, NEC/physics
2. **✅ Good** — DOE derived figures, peer-reviewed national lab
3. **⚠️ Moderate** — LBNL 2019 (slightly dated); corroborating specs help

### Caveats & Variations

- **Gaming PC:** Range 200–350 Wh depending on GPU class; 300 W is mid-range baseline
- **Household:** State variation enormous (Hawaii ~17 kWh/day, Louisiana ~40 kWh/day); 29.56 kWh/day is national average
- **EV:** 250–340 Wh/mile for common BEVs; trucks/SUVs higher; EPA ratings assume "combined" (city+highway blend)
- **Shower:** Inlet water temperature varies by season/region (45–75°F), introducing ±15% uncertainty; 65°F is national average assumption
- **Space heater:** 1,500 W is US standard due to circuit constraints; other countries/markets may use 2,000–3,000 W units

---

## Sources Cited

- U.S. EIA: https://www.eia.gov/tools/faqs/faq.php?id=97&t=3
- EPA fueleconomy.gov: https://www.fueleconomy.gov/
- DOE Energy Saver: https://www.energy.gov/energysaver/
- LBNL (2019): https://www.osti.gov/biblio/1505679
- EPA WaterSense: https://www.epa.gov/watersense/
