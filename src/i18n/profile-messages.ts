export const profileCopy = {
  en: {
    title: "Company profile", notComputed: "Profiles not computed yet", noData: "No data",
    names: { sustained: "Sustained growth", event_driven: "Higher volatility, event-driven", mixed: "Mixed profile", no_data: "No data" },
    tags: { event_driven: "Short-term profile", mixed: "Mixed profile", note: "Event-driven profile: bigger price swings tied to company news. A positive rule status here describes a shorter horizon, not a long-term hold. Informational only." },
    shortNote: "Event-driven profile: a positive rule status on this name describes a shorter horizon, not a long-term hold. Mixed profiles can show both. Informational only, not advice.",
    growers: "Sustained growers", events: "Higher volatility, event-driven",
    description: "These lists group stored company profiles. The event-driven profile can show bigger price swings and results tied to company news. Status uses the same rules in both lists.",
    empty: "No names in this profile today.", ticker: "Company", status: "Status", profile: "Profile", risk: "Risk facts",
    revenue: "Revenue growth", cap: "Market cap", atr: "ATR", drawdown: "Drawdown", move: "5-day move", volume: "Volume ratio", billions: "bn USD",
    methodTitle: "Company profiles", methodBody: "Profiles describe stored revenue growth, size and price movement. Sustained growth requires four quarters of revenue growth, a large market cap, liquid trading and lower ATR. Higher volatility, event-driven covers smaller companies, larger swings or unusual recent movement. Mixed and No data appear when neither profile applies or inputs are missing. A profile does not change a ticker's status or score.",
  },
  sk: {
    title: "Profil spoločnosti", notComputed: "Profily ešte nie sú vypočítané", noData: "Bez údajov",
    names: { sustained: "Stabilný rast", event_driven: "Vyššia volatilita, viazané na udalosti", mixed: "Zmiešaný profil", no_data: "Bez údajov" },
    tags: { event_driven: "Krátkodobý profil", mixed: "Zmiešaný profil", note: "Profil viazaný na udalosti: väčšie cenové výkyvy spojené so správami o spoločnosti. Kladný stav pravidiel tu opisuje kratší horizont, nie dlhodobé držanie. Len informatívne." },
    shortNote: "Profil viazaný na udalosti: kladný stav pravidiel pri tejto spoločnosti opisuje kratší horizont, nie dlhodobé držanie. Zmiešaný profil môže mať obe vlastnosti. Len informatívne, nie je to poradenstvo.",
    growers: "Stabilne rastúce spoločnosti", events: "Vyššia volatilita, viazané na udalosti",
    description: "Zoznamy zoskupujú uložené profily spoločností. Profil viazaný na udalosti môže vykazovať väčšie cenové výkyvy a výsledky súvisiace so správami o spoločnosti. Stav sa v oboch zoznamoch riadi rovnakými pravidlami.",
    empty: "Dnes v tomto profile nie je žiadna spoločnosť.", ticker: "Spoločnosť", status: "Stav", profile: "Profil", risk: "Rizikové údaje",
    revenue: "Rast tržieb", cap: "Trhová kapitalizácia", atr: "ATR", drawdown: "Pokles od maxima", move: "5-dňový pohyb", volume: "Pomer objemu", billions: "mld. USD",
    methodTitle: "Profily spoločností", methodBody: "Profily opisujú uložený rast tržieb, veľkosť a pohyb ceny. Stabilný rast vyžaduje štyri štvrťroky rastu tržieb, veľkú trhovú kapitalizáciu, likvidné obchodovanie a nižšie ATR. Vyššia volatilita viazaná na udalosti zahŕňa menšie spoločnosti, väčšie výkyvy alebo nezvyčajný nedávny pohyb. Zmiešaný profil a Bez údajov sa zobrazia, keď sa neuplatní ani jeden profil alebo chýbajú vstupy. Profil nemení stav ani skóre tickeru.",
  },
} as const;
