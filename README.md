# knwst

This is knwst, "kui's net worth/stock tracker".

There are many similar tools, but I couldn't find one that had everything I wanted, and so this is an extremely barebones implementation of only what I need out of such a tool.

## Workflow

Upon "Rebuild":

* Grabs all transactions from local [Firefly III](https://github.com/firefly-iii/firefly-iii) instance.
* Excludes the transactions tagged "Market" which are intended to approximate, for Firefly, the transactions here.
* Stock transactions are manually recorded using the Enter Transaction form.
* Editing, deleting, and otherwise manipulating existing stock transactions are all done directly using phpmyadmin.
* Grabs asset prices from Yahoo Finance and caches it in mysql. If any recent fetch returns data that does not match an older fetch, throws an error.
* Matches sells to specific tax lots to generate year-by-year sales report. (Historical buys must be manually split if split by a sell, because the program doesn't dictate how to split commissions)
* Treats short sales correctly (closing short sale generates a buy and a sell at the open price).
* Plots net worth over time based on closing prices of assets held that day.
* Exports sales tables and unrealized assets table to HTML tables for viewing or importing into Google Sheets.

## Security

There is no access control. I use Cloudflare Zero Trust to provide access control to internal resources such as this one and Firefly. Please add access control if you're going to expose this to the internet.

## Setup

Create `.env` while looking at `docker-compose.yml` and figuring stuff out.

## Acknowledgement

Thanks to [stock_tools](https://github.com/sebastian-ahmed/stock_tools) for inspiration. Although none of the code or logic landed in this project, the general idea did.

## Issues & Requests & License

Feel free to submit issues and whatnot.

I don't really expect anyone else to use this.

Licensed AGPLv3.
