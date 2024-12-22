# knwst
Knwst (pronounced know-est; standing for “kuilin’s net worth & stock tracker”) is a personal finance accounting system implemented as an ExpressJS & MySQL web application.

It includes:
* True double-entry accounting (previously I used Firefly, which doesn’t quite allow for as much flexibility as I wanted), including budgets, tags, etc, in a way that handles budget allocation per transaction, refunds that re-allocate money back to the budget, and whatnot as fluently and intuitively as possible
* Continuous mark-to-market price data import for the valuation of marketable assets and the measurement of current exposure to various factors
* Flexible price data input for manually priced assets
* Tracking of the performance of independent positions that include hedges across multiple accounts, with potentially multiple tax-advantage statuses, and heuristics on said groups of positions (separating day trading from stock picking, for example)
* Formal historical cost basis tracking for tax optimization only, including flexible adjustments for brokerage idiosyncrasies such as how a tax lot is split upon partial sale
* Graphs, charts, and UI conveniences like dropdowns, rounded buttons, etc
* Reconciliation tracking with references back to exact past statement or trade confirmation dates and lines, with support for daily reconciliation based on custom reports mirroring the web UIs of specific financial institutions 
* Credit card rewards points asset class, as well as easy entry for day-to-day purchase (merchant category codes manually entered per merchant) tracking and reconciliation

## Contribution

I have tried to structure this project so that others can potentially use it, for example, that the setup process is not closely integrated with the setup I had previously (google sheets, firefly, and glue logic in the form of a cardboard-and-duct-tape web app), that the README you are reading right now is legible and summarizes the project well, and etc. However, unless this project becomes more popular than anticipated, other peoples’ use cases are not an ongoing priority for me. Please read the code if you would like to use the code. Please fork the code if you would like to make material modifications, and, if you do, please hold zero expectations that I will read or merge new features (or refrain from adding conflicting or similar features) into your upstream.

The primary purpose of this project is to match how I, kuilin, personally mentally formalize and conceptualize the value of my assets and the financial risks that I am taking with my day-to-day decisions, both as a retail trader and as a participant in capitalism. Although some surface-level concepts and abstraction terminology are taken from other accounting systems and GAAP/IFRS practices, I would like to stress that I have never formally learned accounting, and this software makes no guarantees about being useful for any purpose other than assisting me ~~with how my own anxiety presents itself~~.

## Security

Beware! This web application explicitly makes no security guarantees. Please assume that all users of the web interface can execute arbitrary code inside the Docker container. More specifically, tradeoffs have been made that prioritize ease of implementation over formal correctness - notably, the fact that transactions can, and do, evaluate arbitrary JS to handle “special” actions that cannot otherwise easily be generalized in a more neat way. In my personal instance, the entire thing is behind authentication.

## License

Licensed AGPLv3.
