-- 1. Get stock returns over a time period
SELECT 
    ticker,
    price_date,
    adjusted_close,
    LAG(adjusted_close) OVER (PARTITION BY ticker ORDER BY price_date) AS prev_price,
    (adjusted_close - LAG(adjusted_close) OVER (PARTITION BY ticker ORDER BY price_date)) 
        / LAG(adjusted_close) OVER (PARTITION BY ticker ORDER BY price_date) AS daily_return
FROM stock_prices
WHERE price_date >= CURRENT_DATE - INTERVAL '1 year';

-- 2. Average return for all stocks
SELECT 
    AVG((adjusted_close - open) / open) AS avg_return
FROM stock_prices
WHERE price_date >= CURRENT_DATE - INTERVAL '1 year';

-- 3. Compare returns by market cap category
SELECT 
    c.market_cap_category,
    AVG((sp.adjusted_close - sp.open) / sp.open) AS avg_return
FROM stock_prices sp
JOIN companies c ON sp.ticker = c.ticker
WHERE sp.price_date >= CURRENT_DATE - INTERVAL '5 years'
GROUP BY c.market_cap_category
ORDER BY avg_return DESC;

-- 4. Join factor scores with returns
SELECT 
    fs.calculation_date,
    AVG(fs.value_score) AS avg_value_score,
    AVG((sp.adjusted_close - sp.open) / sp.open) AS avg_return
FROM factor_scores fs
JOIN stock_prices sp 
    ON fs.ticker = sp.ticker 
    AND fs.calculation_date = sp.price_date
WHERE fs.calculation_date >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY fs.calculation_date
ORDER BY fs.calculation_date;

-- 5. Factor-based portfolio construction
WITH top_value_stocks AS (
    SELECT ticker
    FROM factor_scores
    WHERE calculation_date = (
        SELECT MAX(calculation_date) FROM factor_scores
    )
    ORDER BY value_score DESC
    LIMIT 50
)
SELECT 
    sp.price_date,
    AVG((sp.adjusted_close - sp.open) / sp.open) AS portfolio_return
FROM stock_prices sp
JOIN top_value_stocks tvs ON sp.ticker = tvs.ticker
WHERE sp.price_date >= CURRENT_DATE - INTERVAL '5 years'
GROUP BY sp.price_date
ORDER BY sp.price_date;

-- 6. Compare multiple factor portfolios
WITH ranked_stocks AS (
    SELECT 
        ticker,
        calculation_date,
        value_score,
        momentum_score,
        profitability_score,
        NTILE(5) OVER (ORDER BY value_score DESC) AS value_quintile,
        NTILE(5) OVER (ORDER BY momentum_score DESC) AS momentum_quintile
    FROM factor_scores
    WHERE calculation_date = (
        SELECT MAX(calculation_date) FROM factor_scores
    )
),
top_value AS (
    SELECT ticker FROM ranked_stocks WHERE value_quintile = 1
),
top_momentum AS (
    SELECT ticker FROM ranked_stocks WHERE momentum_quintile = 1
)
SELECT 
    sp.price_date,
    'Value' AS factor_type,
    AVG((sp.adjusted_close - sp.open) / sp.open) AS return
FROM stock_prices sp
JOIN top_value tv ON sp.ticker = tv.ticker
GROUP BY sp.price_date
UNION ALL
SELECT 
    sp.price_date,
    'Momentum' AS factor_type,
    AVG((sp.adjusted_close - sp.open) / sp.open) AS return
FROM stock_prices sp
JOIN top_momentum tm ON sp.ticker = tm.ticker
GROUP BY sp.price_date
ORDER BY price_date;

-- 7. Cumulative returns
WITH daily_returns AS (
    SELECT 
        sp.price_date,
        AVG((sp.adjusted_close - sp.open) / sp.open) AS daily_return
    FROM stock_prices sp
    GROUP BY sp.price_date
)
SELECT 
    price_date,
    EXP(SUM(LN(1 + daily_return)) OVER (ORDER BY price_date)) - 1 AS cumulative_return
FROM daily_returns
ORDER BY price_date;

-- 8. Volatility and Sharpe Ratio
WITH returns AS (
    SELECT 
        ticker,
        (adjusted_close - open) / open AS daily_return
    FROM stock_prices
    WHERE price_date >= CURRENT_DATE - INTERVAL '1 year'
)
SELECT 
    AVG(daily_return) AS avg_return,
    STDDEV(daily_return) AS volatility,
    (AVG(daily_return) / NULLIF(STDDEV(daily_return), 0)) AS sharpe_ratio
FROM returns;

-- 9. Time horizon comparison (1Y vs 5Y vs 10Y)
SELECT 
    CASE 
        WHEN price_date >= CURRENT_DATE - INTERVAL '1 year' THEN '1Y'
        WHEN price_date >= CURRENT_DATE - INTERVAL '5 years' THEN '5Y'
        WHEN price_date >= CURRENT_DATE - INTERVAL '10 years' THEN '10Y'
    END AS period,
    AVG((adjusted_close - open) / open) AS avg_return
FROM stock_prices
WHERE price_date >= CURRENT_DATE - INTERVAL '10 years'
GROUP BY period;

