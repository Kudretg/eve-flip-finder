# EVE Market Flip Finder

A live market tool for finding buy/sell spread opportunities in EVE Online. Pulls real-time data from [evetycoon.com](https://evetycoon.com) and surfaces the most profitable station trades across major trade hubs.

## Features

- **Live market data** — fetches current buy/sell orders across all major trade hubs (Jita, Amarr, Dodixie, Rens, Hek), refreshed every 60 seconds
- **Flip analysis** — shows best buy price, best sell price, profit in ISK, and margin % for every item in a category
- **Buy & sell volume** — displays daily trade volume for both sides of the market separately so you can see how fast each leg of a flip will fill
- **Red-to-green volume indicator** — each volume number is color-coded relative to the other side; both green means a healthy balanced market, the weaker side slides toward red so the bottleneck is immediately obvious
- **Top Trades panel** — highlights the 5 best current opportunities scored by margin weighted by liquidity, so high-margin items with dead volume don't float to the top
- **Category filtering** — browse by ship class, modules, drones, implants, skillbooks, and more; includes an All Items view that scans everything at once
- **Flexible sorting** — sort by margin, profit, or liquidity (high/low)
- **Pagination** — configurable page size (25 / 50 / 100 / All) with numbered page buttons

## Stack

- Vite + React 19 + TypeScript
- TanStack Query v5 for data fetching and caching
- Tailwind CSS v4
- Data from [evetycoon.com](https://evetycoon.com) (no API key required)

## Running locally

```bash
npm install
npm run dev   # starts at http://localhost:5173
```
