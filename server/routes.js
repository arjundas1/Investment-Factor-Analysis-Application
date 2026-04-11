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

    let query = `
        SELECT gind, industry_name, gsector
        FROM industries
        `;
    if (sector) {
        query += ` WHERE gsector = '${sector}'`; 
    } 
    query += ` ORDER BY industry_name ASC`; 

    connection.query(query, (err, data) => {
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

const screener_ranked = async function(req, res){
    const weightValue = parseFloat(req.query.weight_value ?? 0.25); 
    const weightProfitability = parseFloat(req.query.weight_profitability ?? 0.25);
    const weightMomentum = parseFloat(req.query.weight_momentum ?? 0.25); 
    const weightSize = parseFloat(req.query.weight_size ?? 0.25); 
    const marketCapCategory = req.query.market_cap_category ?? 'Large';

    connection.query(`
        WITH 
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
        latest_price AS (
            SELECT DISTINCT ON (ticker) ticker, adjusted_close
            FROM stock_prices
            WHERE adjusted_close IS NOT NULL
            ORDER BY ticker, price_date DESC
        ),
        price_12m_ago AS (
            SELECT DISTINCT ON (ticker) ticker, adjusted_close AS adjusted_close_12m_ago
            FROM stock_prices
            WHERE adjusted_close IS NOT NULL
                AND price_date <= CURRENT_DATE - INTERVAL '12 months'
            ORDER BY ticker, price_date DESC
),
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
        AND c.market_cap_category = '${marketCapCategory}'
),

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

SELECT
   ticker,
   company_name,
   sector,
   market_cap_category,
   ROUND(market_cap::numeric, 0)                                        AS market_cap_millions,
   ROUND(value_raw::numeric, 4)                                         AS book_to_market,
   ROUND(profitability_raw::numeric, 4)                                 AS return_on_assets,
   ROUND((momentum_raw * 100)::numeric, 2)                             AS momentum_12m_pct,
   ROUND(value_score::numeric, 4)                                       AS value_score,
   ROUND(profitability_score::numeric, 4)                               AS profitability_score,
   ROUND(momentum_score::numeric, 4)                                    AS momentum_score,
   ROUND(size_score::numeric, 4)                                        AS size_score,
   ROUND((
       (value_score         * ${weightValue})          +   
       (profitability_score * ${weightProfitability})  +   
       (momentum_score      * ${weightMomentum})       +   
       (size_score          * ${weightSize})              
   )::numeric, 4)                                                          AS composite_score
FROM ranked
ORDER BY composite_score DESC
LIMIT 25;
        `, (err, data) => {
    if (err) {
      console.log(err);
      res.json([]);
    } else {
      res.json(data.rows);
    }
  });
}

module.exports = {
  sectors,
  industries,
  asset_allocation,
  screener_ranked
}