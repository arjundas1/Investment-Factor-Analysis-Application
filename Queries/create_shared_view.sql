-- Shared VIEW: company_factor_base
-- Authors: Peter Dankert & Arash Katirai
-- Used by: /screener/ranked, /allocation/risk_comparison, /allocation/enriched
--
-- Encapsulates the common joins (companies + latest financials + latest/12m prices)
-- and computes raw factor values. Does NOT include PERCENT_RANK scores — each
-- consuming query filters by market_cap_category first, then ranks within its
-- own universe.
--
-- Optimization: uses LATERAL joins instead of DISTINCT ON to force per-ticker
-- index lookups on stock_prices_pkey (ticker, price_date), avoiding a full
-- sequential scan + disk sort of 7.7M rows.
--
-- Run this with the group7 admin user (not the guest account):
--   psql -h <host> -U group7 -d investment -f create_shared_view.sql

DROP VIEW IF EXISTS company_factor_base;

CREATE VIEW company_factor_base AS
WITH
-- Most recent financial statement per ticker (LATERAL index scan)
latest_fs AS (
    SELECT fs.*
    FROM companies c
    CROSS JOIN LATERAL (
        SELECT *
        FROM financial_statements fs
        WHERE fs.ticker = c.ticker
        ORDER BY fs.statement_date DESC
        LIMIT 1
    ) fs
    WHERE c.market_cap IS NOT NULL
),

-- Most recent adjusted close price per ticker (LATERAL index scan)
latest_price AS (
    SELECT c.ticker, sp.adjusted_close, sp.price_date AS latest_price_date
    FROM companies c
    CROSS JOIN LATERAL (
        SELECT adjusted_close, price_date
        FROM stock_prices sp
        WHERE sp.ticker = c.ticker AND sp.adjusted_close IS NOT NULL
        ORDER BY sp.price_date DESC
        LIMIT 1
    ) sp
    WHERE c.market_cap IS NOT NULL
),

-- Adjusted close price from ~12 months ago per ticker (LATERAL index scan)
price_12m_ago AS (
    SELECT c.ticker, sp.adjusted_close AS adjusted_close_12m_ago,
           sp.price_date AS price_date_12m_ago
    FROM companies c
    CROSS JOIN LATERAL (
        SELECT adjusted_close, price_date
        FROM stock_prices sp
        WHERE sp.ticker = c.ticker
          AND sp.adjusted_close IS NOT NULL
          AND sp.price_date <= CURRENT_DATE - INTERVAL '12 months'
        ORDER BY sp.price_date DESC
        LIMIT 1
    ) sp
    WHERE c.market_cap IS NOT NULL
)

SELECT
    c.ticker,
    c.company_name,
    c.sector,
    c.market_cap_category,
    c.market_cap,

    -- Latest financial statement fields
    lf.statement_date,
    lf.total_revenue,
    lf.net_income,
    lf.total_assets,
    lf.shareholders_equity,
    lf.gross_profit,

    -- Price fields
    lp.adjusted_close       AS latest_adj_close,
    lp.latest_price_date,
    p12.adjusted_close_12m_ago,

    -- Raw factor: Value (book-to-market ratio)
    CASE
        WHEN c.market_cap IS NOT NULL AND c.market_cap <> 0 AND lf.shareholders_equity IS NOT NULL
        THEN lf.shareholders_equity / c.market_cap
        ELSE NULL
    END AS value_raw,

    -- Raw factor: Momentum (12-month return)
    CASE
        WHEN p12.adjusted_close_12m_ago IS NOT NULL AND p12.adjusted_close_12m_ago <> 0 AND lp.adjusted_close IS NOT NULL
        THEN (lp.adjusted_close / p12.adjusted_close_12m_ago) - 1
        ELSE NULL
    END AS momentum_raw,

    -- Raw factor: Profitability (return on assets)
    CASE
        WHEN lf.total_assets IS NOT NULL AND lf.total_assets <> 0 AND lf.net_income IS NOT NULL
        THEN lf.net_income / lf.total_assets
        ELSE NULL
    END AS profitability_raw,

    -- Raw factor: Size (market cap, inverted in ranking)
    c.market_cap AS size_raw

FROM companies c
JOIN latest_fs lf       ON c.ticker = lf.ticker
JOIN latest_price lp    ON c.ticker = lp.ticker
LEFT JOIN price_12m_ago p12 ON c.ticker = p12.ticker
WHERE c.market_cap IS NOT NULL;
