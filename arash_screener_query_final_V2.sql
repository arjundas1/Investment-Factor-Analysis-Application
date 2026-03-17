-- Stock Screener Query 
-- Description: Computes a composite factor score for each stock
-- by ranking value (price-to-book), profitability (ROA), momentum
-- (12-month return), and size (market cap) using PERCENT_RANK
-- normalization across the filtered universe, then combines them
-- using user-defined weights. Returns the top 25 stocks.

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

        -- Value: book-to-market ratio (higher = more value)
        CASE
            WHEN c.market_cap IS NOT NULL
             AND c.market_cap <> 0
             AND lf.shareholders_equity IS NOT NULL
            THEN lf.shareholders_equity / c.market_cap
            ELSE NULL
        END AS value_raw,

        -- Momentum: 12-month return
        CASE
            WHEN p12.adjusted_close_12m_ago IS NOT NULL
             AND p12.adjusted_close_12m_ago <> 0
             AND lp.adjusted_close IS NOT NULL
            THEN (lp.adjusted_close / p12.adjusted_close_12m_ago) - 1
            ELSE NULL
        END AS momentum_raw,

        -- Profitability: return on assets
        CASE
            WHEN lf.total_assets IS NOT NULL
             AND lf.total_assets <> 0
             AND lf.net_income IS NOT NULL
            THEN lf.net_income / lf.total_assets
            ELSE NULL
        END AS profitability_raw,

        -- Size: raw market cap (inverted in ranking step)
        c.market_cap AS size_raw

    FROM companies c
    JOIN latest_fs lf      ON c.ticker = lf.ticker
    JOIN latest_price lp   ON c.ticker = lp.ticker      -- drop companies with no price data
    JOIN price_12m_ago p12 ON c.ticker = p12.ticker     -- drop companies with no 12m history
    WHERE c.market_cap IS NOT NULL
      AND c.market_cap_category = :market_cap_category  -- user input: 'Small', 'Mid', or 'Large'. They shouldn't be able to choose Micro, because that's not in the S&P 1500
),

-- Step 5: Normalize each factor to 0-1 using PERCENT_RANK
-- Higher rank = better score for all factors
-- Size is inverted: smaller market cap = higher score
ranked AS (
    SELECT
        ticker,
        company_name,
        sector,
        market_cap_category,
        market_cap,
        value_raw,
        momentum_raw,
        profitability_raw,
        size_raw,
        PERCENT_RANK() OVER (ORDER BY value_raw ASC)         AS value_score,
        PERCENT_RANK() OVER (ORDER BY momentum_raw ASC)      AS momentum_score,
        PERCENT_RANK() OVER (ORDER BY profitability_raw ASC) AS profitability_score,
        PERCENT_RANK() OVER (ORDER BY size_raw DESC)         AS size_score
    FROM raw_metrics
    WHERE value_raw IS NOT NULL
      AND momentum_raw IS NOT NULL
      AND profitability_raw IS NOT NULL
)

-- Step 6: Apply user-defined factor weights and return top 25
-- Weights come from frontend sliders and must sum to 1.0
SELECT
    ticker,
    company_name,
    sector,
    market_cap_category,
    ROUND(market_cap, 0)                                        AS market_cap_millions,
    ROUND(value_raw, 4)                                         AS book_to_market,
    ROUND(profitability_raw, 4)                                 AS return_on_assets,
    ROUND(momentum_raw * 100, 2)                                AS momentum_12m_pct,
    ROUND(value_score, 4)                                       AS value_score,
    ROUND(profitability_score, 4)                               AS profitability_score,
    ROUND(momentum_score, 4)                                    AS momentum_score,
    ROUND(size_score, 4)                                        AS size_score,
    ROUND(
        (value_score         * :weight_value)          +   -- e.g. 0.40
        (profitability_score * :weight_profitability)  +   -- e.g. 0.30
        (momentum_score      * :weight_momentum)       +   -- e.g. 0.20
        (size_score          * :weight_size),              -- e.g. 0.10
    4)                                                          AS composite_score
FROM ranked
ORDER BY composite_score DESC
LIMIT 25;
