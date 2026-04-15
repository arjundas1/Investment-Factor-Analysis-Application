const { Pool, types } = require('pg');
const config = require('./config.json');

// Override the default parsing for BIGINT (PostgreSQL type ID 20)
types.setTypeParser(20, val => parseInt(val, 10)); //DO NOT DELETE THIS

// Create PostgreSQL connection using database credentials provided in config.json
// Do not edit. If the connection fails, make sure to check that config.json is filled out correctly
const connection = new Pool({
  host: config.rds_host,
  user: config.rds_user,
  password: config.rds_password,
  port: config.rds_port,
  database: config.rds_db,
  ssl: {
    rejectUnauthorized: false,
  },
});
connection.connect((err) => err && console.log(err));

const sectors = async function(req, res) {
    connection.query(`
    SELECT gsector, sector_name
    FROM sectors
    ORDER BY sector_name ASC`, (err, data) => {
    if (err) {
      console.log(err);
      res.json([]);
    } else {
      res.json(data.rows);
    }
  });
}

const industries = async function(req, res) {
    const sector = req.query.sector;
    const params = [];

    let query = `
        SELECT gind, industry_name, gsector
        FROM industries`;
    if (sector) {
        query += ` WHERE gsector = $1`;
        params.push(sector);
    }
    query += ` ORDER BY industry_name ASC`;

    connection.query(query, params, (err, data) => {
    if (err) {
      console.log(err);
      res.json([]);
    } else {
      res.json(data.rows);
    }
  });
}

const asset_allocation = async function(req, res) {
    const yearsToRetirement = Number.parseInt(req.query.years_to_retirement, 10);
    const riskProfile = req.query.risk_profile;
    const allowedRiskProfiles = new Set(['Conservative', 'Moderate', 'Aggressive']);

    if (!Number.isFinite(yearsToRetirement) || yearsToRetirement < 0) {
      res.status(400).json({ error: 'years_to_retirement must be a non-negative integer' });
      return;
    }

    if (!allowedRiskProfiles.has(riskProfile)) {
      res.status(400).json({ error: 'risk_profile must be Conservative, Moderate, or Aggressive' });
      return;
    }

    connection.query(
      `
      SELECT years_to_retirement, risk_profile, stock_percentage, bond_percentage
      FROM asset_allocations
      WHERE risk_profile = $1
      ORDER BY ABS(years_to_retirement - $2)
      LIMIT 1
      `,
      [riskProfile, yearsToRetirement],
      (err, data) => {
        if (err) {
          console.log(err);
          res.status(500).json({ error: 'Failed to fetch asset allocation' });
        } else if (!data.rows.length) {
          res.status(404).json({ error: 'No allocation found for the requested inputs' });
        } else {
          res.json(data.rows[0]);
        }
      }
    );
}

// ---------- Shared CTE used by screener and allocation routes ----------
// Optimized: LATERAL joins force per-ticker index lookups on stock_prices_pkey
// instead of sequential-scanning 7.7M rows. Brings CTE from ~20s to <1s.
// Mirrors the company_factor_base VIEW (see Queries/create_shared_view.sql).
const COMPANY_FACTOR_BASE_CTE = `
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
  ),
  base AS (
      SELECT
          c.ticker, c.company_name, c.sector,
          c.market_cap_category, c.market_cap,
          lf.statement_date, lf.total_revenue, lf.net_income,
          lf.total_assets, lf.shareholders_equity, lf.gross_profit,
          lp.adjusted_close AS latest_adj_close,
          lp.latest_price_date,
          p12.adjusted_close_12m_ago,
          CASE WHEN c.market_cap IS NOT NULL AND c.market_cap <> 0
                AND lf.shareholders_equity IS NOT NULL
               THEN lf.shareholders_equity / c.market_cap ELSE NULL
          END AS value_raw,
          CASE WHEN p12.adjusted_close_12m_ago IS NOT NULL
                AND p12.adjusted_close_12m_ago <> 0
                AND lp.adjusted_close IS NOT NULL
               THEN (lp.adjusted_close / p12.adjusted_close_12m_ago) - 1 ELSE NULL
          END AS momentum_raw,
          CASE WHEN lf.total_assets IS NOT NULL AND lf.total_assets <> 0
                AND lf.net_income IS NOT NULL
               THEN lf.net_income / lf.total_assets ELSE NULL
          END AS profitability_raw,
          c.market_cap AS size_raw
      FROM companies c
      JOIN latest_fs lf        ON c.ticker = lf.ticker
      JOIN latest_price lp     ON c.ticker = lp.ticker
      LEFT JOIN price_12m_ago p12 ON c.ticker = p12.ticker
      WHERE c.market_cap IS NOT NULL
  )`;

const screener_ranked = async function(req, res) {
    const weightValue         = Number.parseFloat(req.query.weight_value         ?? '0.25');
    const weightProfitability = Number.parseFloat(req.query.weight_profitability ?? '0.25');
    const weightMomentum      = Number.parseFloat(req.query.weight_momentum      ?? '0.25');
    const weightSize          = Number.parseFloat(req.query.weight_size          ?? '0.25');

    const allowedMarketCaps = new Set(['Large', 'Mid', 'Small']);
    const marketCapCategory = allowedMarketCaps.has(req.query.market_cap_category)
        ? req.query.market_cap_category
        : 'Large';

    // Fall back to 0.25 if any weight came in as NaN
    const safeWV = Number.isFinite(weightValue)         ? weightValue         : 0.25;
    const safeWP = Number.isFinite(weightProfitability) ? weightProfitability : 0.25;
    const safeWM = Number.isFinite(weightMomentum)      ? weightMomentum      : 0.25;
    const safeWS = Number.isFinite(weightSize)          ? weightSize          : 0.25;

    connection.query(
        // COMPANY_FACTOR_BASE_CTE expands to the four CTEs: latest_fs, latest_price,
        // price_12m_ago, and base. "base" has all raw factor values ready to use.
        // We then add "ranked" on top to apply PERCENT_RANK normalization.
        `WITH ${COMPANY_FACTOR_BASE_CTE},
        ranked AS (
            SELECT
                ticker, company_name, sector, market_cap_category, market_cap,
                value_raw, momentum_raw, profitability_raw, size_raw,
                PERCENT_RANK() OVER (ORDER BY value_raw ASC)         AS value_score,
                PERCENT_RANK() OVER (ORDER BY momentum_raw ASC)      AS momentum_score,
                PERCENT_RANK() OVER (ORDER BY profitability_raw ASC) AS profitability_score,
                PERCENT_RANK() OVER (ORDER BY size_raw DESC)         AS size_score
            FROM base
            WHERE market_cap_category = $1
              AND value_raw IS NOT NULL
              AND momentum_raw IS NOT NULL
              AND profitability_raw IS NOT NULL
        )
        SELECT
            ticker, company_name, sector, market_cap_category,
            ROUND(market_cap::numeric, 0)           AS market_cap_millions,
            ROUND(value_raw::numeric, 4)            AS book_to_market,
            ROUND(profitability_raw::numeric, 4)    AS return_on_assets,
            ROUND((momentum_raw * 100)::numeric, 2) AS momentum_12m_pct,
            ROUND(value_score::numeric, 4)          AS value_score,
            ROUND(profitability_score::numeric, 4)  AS profitability_score,
            ROUND(momentum_score::numeric, 4)       AS momentum_score,
            ROUND(size_score::numeric, 4)           AS size_score,
            ROUND((
                (value_score         * $2) +
                (profitability_score * $3) +
                (momentum_score      * $4) +
                (size_score          * $5)
            )::numeric, 4) AS composite_score
        FROM ranked
        ORDER BY composite_score DESC
        LIMIT 25;`,
        [marketCapCategory, safeWV, safeWP, safeWM, safeWS],
        (err, data) => {
            if (err) {
                console.log(err);
                res.json([]);
            } else {
                res.json(data.rows);
            }
        }
    );
}

const allocation_enriched = async function(req, res) {
    const retirementYear = Number.parseInt(req.query.retirement_year, 10);
    const riskProfile = req.query.risk_profile;
    const currentYear = new Date().getFullYear();

    if (!Number.isFinite(retirementYear) || retirementYear <= currentYear) {
      return res.status(400).json({ error: 'retirement_year must be a future year' });
    }

    const allowedProfiles = new Set(['Conservative', 'Moderate', 'Aggressive']);
    if (!allowedProfiles.has(riskProfile)) {
      return res.status(400).json({ error: 'risk_profile must be Conservative, Moderate, or Aggressive' });
    }

    const yearsToRetirement = retirementYear - currentYear;

    connection.query(
      `WITH target_allocation AS (
          SELECT years_to_retirement, risk_profile, stock_percentage, bond_percentage
          FROM asset_allocations
          WHERE risk_profile = $1
          ORDER BY ABS(years_to_retirement - $2)
          LIMIT 1
      ),
      top_tickers AS (
          SELECT ticker FROM companies
          WHERE market_cap IS NOT NULL
          ORDER BY market_cap DESC
          LIMIT 25
      ),
      market_daily AS (
          SELECT sp.price_date, AVG(sp.adjusted_close) AS market_value
          FROM top_tickers t
          CROSS JOIN LATERAL (
              SELECT adjusted_close, price_date
              FROM stock_prices sp
              WHERE sp.ticker = t.ticker
                AND sp.price_date >= CURRENT_DATE - ($2 * INTERVAL '1 year')
                AND sp.adjusted_close IS NOT NULL
              ORDER BY sp.price_date
          ) sp
          GROUP BY sp.price_date
      ),
      market_returns AS (
          SELECT
              price_date,
              market_value,
              CASE
                  WHEN LAG(market_value) OVER (ORDER BY price_date) > 0
                  THEN (market_value - LAG(market_value) OVER (ORDER BY price_date))
                       / LAG(market_value) OVER (ORDER BY price_date)
                  ELSE NULL
              END AS daily_return
          FROM market_daily
      ),
      market_stats AS (
          SELECT
              AVG(daily_return) * 252            AS annualized_return,
              STDDEV(daily_return) * SQRT(252)   AS annualized_volatility,
              CASE
                  WHEN STDDEV(daily_return) > 0
                  THEN (AVG(daily_return) * 252) / (STDDEV(daily_return) * SQRT(252))
                  ELSE NULL
              END AS sharpe_ratio,
              COUNT(*) AS trading_days
          FROM market_returns
          WHERE daily_return IS NOT NULL
      )
      SELECT
          ta.years_to_retirement,
          ta.risk_profile,
          ta.stock_percentage,
          ta.bond_percentage,
          ROUND(ms.annualized_return::NUMERIC * 100, 2)      AS historical_annual_return_pct,
          ROUND(ms.annualized_volatility::NUMERIC * 100, 2)  AS historical_volatility_pct,
          ROUND(ms.sharpe_ratio::NUMERIC, 3)                 AS sharpe_ratio,
          ROUND(
              (ta.stock_percentage / 100 * ms.annualized_return +
               ta.bond_percentage  / 100 * 0.03)::NUMERIC * 100, 2
          ) AS blended_return_pct,
          ms.trading_days
      FROM target_allocation ta
      CROSS JOIN market_stats ms;`,
      [riskProfile, yearsToRetirement],
      (err, data) => {
        if (err) {
          console.log(err);
          return res.status(500).json({ error: 'Failed to fetch enriched allocation' });
        }
        if (!data.rows.length) {
          return res.status(404).json({ error: 'No allocation found' });
        }
        res.json(data.rows[0]);
      }
    );
};

const allocation_glide_path = async function(req, res) {
    const riskProfile = req.query.risk_profile;

    const allowedProfiles = new Set(['Conservative', 'Moderate', 'Aggressive']);
    if (!allowedProfiles.has(riskProfile)) {
      return res.status(400).json({ error: 'risk_profile must be Conservative, Moderate, or Aggressive' });
    }

    connection.query(
      `SELECT
          years_to_retirement,
          risk_profile,
          stock_percentage,
          bond_percentage,
          stock_percentage - LAG(stock_percentage)
              OVER (ORDER BY years_to_retirement DESC) AS stock_pct_change
      FROM asset_allocations
      WHERE risk_profile = $1
      ORDER BY years_to_retirement DESC;`,
      [riskProfile],
      (err, data) => {
        if (err) {
          console.log(err);
          return res.status(500).json({ error: 'Failed to fetch glide path' });
        }
        res.json(data.rows);
      }
    );
};

const allocation_risk_comparison = async function(req, res) {
    const retirementYear = Number.parseInt(req.query.retirement_year, 10);
    const currentYear = new Date().getFullYear();

    if (!Number.isFinite(retirementYear) || retirementYear <= currentYear) {
      return res.status(400).json({ error: 'retirement_year must be a future year' });
    }

    const yearsToRetirement = retirementYear - currentYear;

    connection.query(
      `WITH ${COMPANY_FACTOR_BASE_CTE},
      ranked_in_universe AS (
          SELECT
              ticker, sector,
              PERCENT_RANK() OVER (ORDER BY value_raw ASC)         AS value_score,
              PERCENT_RANK() OVER (ORDER BY momentum_raw ASC)      AS momentum_score,
              PERCENT_RANK() OVER (ORDER BY profitability_raw ASC) AS profitability_score,
              PERCENT_RANK() OVER (ORDER BY size_raw DESC)         AS size_score
          FROM base
          WHERE value_raw IS NOT NULL
            AND momentum_raw IS NOT NULL
            AND profitability_raw IS NOT NULL
      ),
      sector_scores AS (
          SELECT
              sector,
              ROUND(AVG(
                  value_score * 0.25 + profitability_score * 0.25 +
                  momentum_score * 0.25 + size_score * 0.25
              )::numeric, 4) AS avg_composite_score,
              COUNT(*) AS num_companies
          FROM ranked_in_universe
          GROUP BY sector
      ),
      sector_ranked AS (
          SELECT sector, avg_composite_score, num_companies,
              RANK() OVER (ORDER BY avg_composite_score DESC) AS sector_rank
          FROM sector_scores
      ),
      top_sectors AS (
          SELECT sector, avg_composite_score, num_companies, sector_rank
          FROM sector_ranked
          WHERE sector_rank <= 5
      ),
      all_profiles AS (
          SELECT risk_profile, stock_percentage, bond_percentage
          FROM asset_allocations
          WHERE years_to_retirement = $1
      )
      SELECT
          ap.risk_profile,
          ap.stock_percentage,
          ap.bond_percentage,
          s.sector_name AS sector,
          ts.avg_composite_score,
          ts.num_companies,
          ts.sector_rank
      FROM all_profiles ap
      CROSS JOIN top_sectors ts
      JOIN sectors s ON ts.sector = s.gsector
      ORDER BY ap.risk_profile, ts.sector_rank;`,
      [yearsToRetirement],
      (err, data) => {
        if (err) {
          console.log(err);
          return res.status(500).json({ error: 'Failed to fetch risk comparison' });
        }
        res.json(data.rows);
      }
    );
};

const screener_diversification = async function(req, res) {
    const weightValue         = Number.parseFloat(req.query.weight_value         ?? '0.25');
    const weightProfitability = Number.parseFloat(req.query.weight_profitability ?? '0.25');
    const weightMomentum      = Number.parseFloat(req.query.weight_momentum      ?? '0.25');
    const weightSize          = Number.parseFloat(req.query.weight_size          ?? '0.25');

    const allowedMarketCaps = new Set(['Large', 'Mid', 'Small']);
    const marketCapCategory = allowedMarketCaps.has(req.query.market_cap_category)
        ? req.query.market_cap_category
        : 'Large';

    const safeWV = Number.isFinite(weightValue)         ? weightValue         : 0.25;
    const safeWP = Number.isFinite(weightProfitability) ? weightProfitability : 0.25;
    const safeWM = Number.isFinite(weightMomentum)      ? weightMomentum      : 0.25;
    const safeWS = Number.isFinite(weightSize)          ? weightSize          : 0.25;

    connection.query(
        `WITH ${COMPANY_FACTOR_BASE_CTE},
        ranked AS (
            SELECT
                ticker, company_name, sector, market_cap_category, market_cap,
                PERCENT_RANK() OVER (ORDER BY value_raw ASC)         AS value_score,
                PERCENT_RANK() OVER (ORDER BY momentum_raw ASC)      AS momentum_score,
                PERCENT_RANK() OVER (ORDER BY profitability_raw ASC) AS profitability_score,
                PERCENT_RANK() OVER (ORDER BY size_raw DESC)         AS size_score
            FROM base
            WHERE market_cap_category = $1
              AND value_raw IS NOT NULL
              AND momentum_raw IS NOT NULL
              AND profitability_raw IS NOT NULL
        ),
        top_stocks AS (
            SELECT
                ticker, company_name, sector,
                ROUND((
                    (value_score         * $2) +
                    (profitability_score * $3) +
                    (momentum_score      * $4) +
                    (size_score          * $5)
                )::numeric, 4) AS composite_score
            FROM ranked
            ORDER BY composite_score DESC
            LIMIT 25
        )
        SELECT
            s.sector_name                                                   AS sector,
            COUNT(*)                                                        AS stock_count,
            ROUND(COUNT(*) * 100.0 / 25, 1)                                AS sector_pct,
            ROUND(AVG(ts.composite_score)::numeric, 4)                     AS avg_score,
            STRING_AGG(ts.ticker, ', ' ORDER BY ts.composite_score DESC)   AS tickers
        FROM top_stocks ts
        JOIN sectors s ON ts.sector = s.gsector
        GROUP BY s.sector_name
        ORDER BY stock_count DESC;`,
        [marketCapCategory, safeWV, safeWP, safeWM, safeWS],
        (err, data) => {
            if (err) {
                console.log(err);
                res.json([]);
            } else {
                res.json(data.rows);
            }
        }
    );
}

const factor_performance = async function (req, res) {
  const factor = req.query.factor; // value, momentum, profitability, size
  const startYear = parseInt(req.query.start_year) || 2015;
  const endYear = parseInt(req.query.end_year) || 2023;

  if (!["value", "momentum", "profitability", "size"].includes(factor)) {
    return res.status(400).json({ error: "Invalid factor" });
  }

  const factorColumn = `${factor}_score`;

  const query = `
    WITH yearly_returns AS (
  SELECT
    ticker,
    EXTRACT(YEAR FROM price_date) AS year,
    (MAX(adjusted_close) / MIN(adjusted_close) - 1) AS annual_return
  FROM stock_prices
  WHERE adjusted_close IS NOT NULL
  GROUP BY ticker, year
),
market_returns AS (
  SELECT
    year,
    AVG(annual_return) AS market_return
  FROM yearly_returns
  GROUP BY year
)
SELECT
  year,
  ROUND(AVG(annual_return)::numeric, 4) AS factor_return,
  ROUND(AVG(annual_return)::numeric, 4) AS market_return
FROM yearly_returns
GROUP BY year
ORDER BY year;
  `;

  connection.query(query, (err, data) => {
    if (err) {
      console.log(err);
      res.json([]);
    } else {
      res.json(data.rows);
    }
  });
//   console.log("FACTOR PERFORMANCE ROUTE HIT");
};

const factors_comparison = async function (req, res) {
  const startYear = parseInt(req.query.start_year) || 2015;
  const endYear = parseInt(req.query.end_year) || 2023;

  const query = `
    WITH yearly_returns AS (
      SELECT
        c.ticker,
        EXTRACT(YEAR FROM sp.price_date) AS year,
        (MAX(sp.adjusted_close) / MIN(sp.adjusted_close) - 1) AS annual_return
      FROM stock_prices sp
      JOIN companies c ON sp.ticker = c.ticker
      WHERE EXTRACT(YEAR FROM sp.price_date) BETWEEN $1 AND $2
      GROUP BY c.ticker, year
    ),
    latest_scores AS (
      SELECT *
      FROM factor_scores
      WHERE calculation_date = (SELECT MAX(calculation_date) FROM factor_scores)
    ),
    joined AS (
      SELECT
        yr.year,
        yr.annual_return,
        fs.value_score,
        fs.momentum_score,
        fs.profitability_score,
        fs.size_score
      FROM yearly_returns yr
      JOIN latest_scores fs ON yr.ticker = fs.ticker
    )
    SELECT
      year,
      AVG(CASE WHEN value_score >= 0.8 THEN annual_return END) AS value_return,
      AVG(CASE WHEN momentum_score >= 0.8 THEN annual_return END) AS momentum_return,
      AVG(CASE WHEN profitability_score >= 0.8 THEN annual_return END) AS profitability_return,
      AVG(CASE WHEN size_score >= 0.8 THEN annual_return END) AS size_return,
      AVG(annual_return) AS market_return
    FROM joined
    GROUP BY year
    ORDER BY year;
  `;

  connection.query(query, [startYear, endYear], (err, data) => {
    if (err) {
      console.log(err);
      res.json([]);
    } else {
      res.json(data.rows);
    }
  });
};


const web_search = async function(req, res) {
    const query = String(req.query.q ?? '').trim();
    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter q' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY || config.gemini_api_key;
    const geminiModel = process.env.GEMINI_MODEL || config.gemini_model || 'gemini-2.5-flash';

    if (!geminiApiKey) {
      return res.status(500).json({
        error: 'Search is not configured. Set GEMINI_API_KEY in environment or set gemini_api_key in server/config.json.',
      });
    }

    try {
      const toSingleLine = (value) => String(value || '').replace(/\s+/g, ' ').trim();

      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
      const geminiPayload = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Provide a very brief description of what the company ${query} does. Summarize recent financial news related to ${query}. If analyst sentiment or a clear consensus is available, state whether the stock is generally viewed as a Buy, Hold, or Sell; otherwise say that no clear consensus was found. Keep the answer to a maximum of 4 sentences and synthesize multiple sources.`,
              },
            ],
          },
        ],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.2,
        },
      };

      const geminiResponse = await fetch(`${geminiEndpoint}?key=${encodeURIComponent(geminiApiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiPayload),
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        return res.status(502).json({
          error: `Gemini grounded search request failed (${geminiResponse.status}).`,
          details: errorText,
        });
      }

      const geminiData = await geminiResponse.json();
      const candidate = geminiData?.candidates?.[0] || null;
      const fullText = (candidate?.content?.parts || [])
        .map((part) => part?.text)
        .filter(Boolean)
        .join('\n')
        .trim();

      const chunks = candidate?.groundingMetadata?.groundingChunks || [];
      const uniqueResults = [];
      const seenUrls = new Set();

      for (const chunk of chunks) {
        const url = chunk?.web?.uri;
        const title = chunk?.web?.title;
        if (!url || seenUrls.has(url)) continue;
        seenUrls.add(url);

        let sourceLabel = title || url;
        try {
          const host = new URL(url).hostname;
          sourceLabel = title || host;
        } catch {
          // Keep existing label if URL parsing fails.
        }

        uniqueResults.push({
          name: sourceLabel,
          url,
        });
        if (uniqueResults.length >= 5) break;
      }

      return res.json({
        query,
        provider: 'gemini-grounded-search',
        summary: toSingleLine(fullText) || null,
        results: uniqueResults,
      });
    } catch (err) {
      console.log(err);
      return res.status(500).json({
        error: err.message || 'Failed to fetch web search results',
      });
    }
}

module.exports = {
  sectors,
  industries,
  asset_allocation,
  screener_ranked,
  allocation_enriched,
  allocation_glide_path,
  allocation_risk_comparison,
  screener_diversification,
  factor_performance,
  factors_comparison,
  web_search,
}