-- Screener Results with Sector Diversification Analysis
-- Description: Takes the top-ranked stocks from the factor-weighted
-- screener (using P/B value, ROA profitability, 12-month momentum,
-- and size via PERCENT_RANK) and conducts sector-level
-- concentration analysis. Flags over-concentrated sectors to help
-- users understand portfolio risk before committing.

WITH

-- Step 1: Most recent financial statement per ticker
latest_fs AS (
    SELECT fs.*
    FROM financial_statements fs
    JOIN (
        SELECT ticker, MAX(statement_date) AS max_date
        FROM financial_statements
        GROUP BY ticker
    ) latest
      ON fs.ticker = latest.ticker
     AND fs.statement_date = latest.max_date
),

-- Step 2: Most recent adjusted close price per ticker
latest_price AS (
    SELECT DISTINCT ON (ticker) ticker, adjusted_close
    FROM stock_prices
    WHERE adjusted_close IS NOT NULL
    ORDER BY ticker, price_date DESC
),

-- Step 3: Adjusted close price from 12 months ago per ticker
price_12m_ago AS (
    SELECT DISTINCT ON (ticker) ticker, adjusted_close AS adjusted_close_12m_ago
    FROM stock_prices
    WHERE adjusted_close IS NOT NULL
      AND price_date <= CURRENT_DATE - INTERVAL '12 months'
    ORDER BY ticker, price_date DESC
),

-- Step 4: Compute raw factor values
-- INNER JOINs on price tables: exclude companies with no price data
raw_metrics AS (
    SELECT
        c.ticker,
        c.company_name,
        c.sector,
        c.market_cap_category,
        c.market_cap,

        CASE
            WHEN c.market_cap IS NOT NULL
             AND c.market_cap <> 0
             AND lf.shareholders_equity IS NOT NULL
            THEN lf.shareholders_equity / c.market_cap
            ELSE NULL
        END AS value_raw,

        CASE
            WHEN p12.adjusted_close_12m_ago IS NOT NULL
             AND p12.adjusted_close_12m_ago <> 0
             AND lp.adjusted_close IS NOT NULL
            THEN (lp.adjusted_close / p12.adjusted_close_12m_ago) - 1
            ELSE NULL
        END AS momentum_raw,

        CASE
            WHEN lf.total_assets IS NOT NULL
             AND lf.total_assets <> 0
             AND lf.net_income IS NOT NULL
            THEN lf.net_income / lf.total_assets
            ELSE NULL
        END AS profitability_raw,

        c.market_cap AS size_raw

    FROM companies c
    JOIN latest_fs lf      ON c.ticker = lf.ticker
    JOIN latest_price lp   ON c.ticker = lp.ticker
    JOIN price_12m_ago p12 ON c.ticker = p12.ticker
    WHERE c.market_cap IS NOT NULL
      AND c.market_cap_category = :market_cap_category
),

-- Step 5: Normalize using PERCENT_RANK, size inverted
ranked AS (
    SELECT
        ticker,
        company_name,
        sector,
        market_cap_category,
        market_cap,
        PERCENT_RANK() OVER (ORDER BY value_raw ASC)         AS value_score,
        PERCENT_RANK() OVER (ORDER BY momentum_raw ASC)      AS momentum_score,
        PERCENT_RANK() OVER (ORDER BY profitability_raw ASC) AS profitability_score,
        PERCENT_RANK() OVER (ORDER BY size_raw DESC)         AS size_score
    FROM raw_metrics
    WHERE value_raw IS NOT NULL
      AND momentum_raw IS NOT NULL
      AND profitability_raw IS NOT NULL
),

-- Step 6: Apply user weights and get top 25
top_stocks AS (
    SELECT
        ticker,
        company_name,
        sector,
        market_cap_category,
        market_cap,
        ROUND(
            (value_score         * :weight_value)         +
            (profitability_score * :weight_profitability) +
            (momentum_score      * :weight_momentum)      +
            (size_score          * :weight_size),
        4) AS composite_score
    FROM ranked
    ORDER BY composite_score DESC
    LIMIT 25
),

-- Step 7: Sector concentration across the top 25
sector_counts AS (
    SELECT
        sector,
        COUNT(*)                         AS stocks_in_sector,
        ROUND(COUNT(*) * 100.0 / 25, 1) AS pct_of_portfolio
    FROM top_stocks
    GROUP BY sector
)

-- Final output: each stock with its sector concentration stats
SELECT
    t.ticker,
    t.company_name,
    t.sector,
    t.market_cap_category,
    ROUND(t.market_cap, 0)                  AS market_cap_millions,
    ROUND(t.composite_score, 4)             AS composite_score,
    s.stocks_in_sector,
    s.pct_of_portfolio,
    CASE
        WHEN s.pct_of_portfolio > 30 THEN 'HIGH CONCENTRATION - consider trimming'
        WHEN s.pct_of_portfolio > 20 THEN 'MODERATE CONCENTRATION'
        ELSE 'DIVERSIFIED'
    END                                     AS concentration_flag,
    ROUND(100.0 / 25, 2)                    AS suggested_weight_pct
FROM top_stocks t
JOIN sector_counts s ON t.sector = s.sector
ORDER BY t.composite_score DESC;
