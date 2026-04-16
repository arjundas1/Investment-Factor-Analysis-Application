-- 1. SECTORS

CREATE TABLE sectors (
    gsector      TEXT PRIMARY KEY,
    sector_name  TEXT NOT NULL UNIQUE
);

-- 2. INDUSTRIES

CREATE TABLE industries (
    gind           TEXT PRIMARY KEY,
    gsector        TEXT NOT NULL REFERENCES sectors(gsector),
    industry_name  TEXT NOT NULL UNIQUE
);

-- 3. COMPANIES
--    Source: Fundamentals_data.csv (Compustat Fundamentals Annual)
--    gvkey added as stable permanent identifier alongside ticker

CREATE TABLE companies (
    ticker               TEXT PRIMARY KEY CHECK (ticker = BTRIM(ticker) AND ticker = UPPER(ticker)),
    gvkey                TEXT NOT NULL UNIQUE,
    company_name         TEXT NOT NULL,
    sector               TEXT REFERENCES sectors(gsector),    -- gsector (GICS sector code)
    industry             TEXT REFERENCES industries(gind),    -- gind (GICS industry code)
    sic                  TEXT,
    market_cap           NUMERIC
);

-- 4. STOCK_PRICES
--    Source: S&p1500_Daily.csv (Compustat Security Daily)

CREATE TABLE stock_prices (
    ticker               TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
    price_date           DATE NOT NULL,
    open                 NUMERIC,
    high                 NUMERIC,
    low                  NUMERIC,
    close                NUMERIC,
    volume               NUMERIC,
    adjusted_close       NUMERIC,
    shares_outstanding   NUMERIC,
    PRIMARY KEY (ticker, price_date),
    CHECK (open IS NULL OR open >= 0),
    CHECK (high IS NULL OR high >= 0),
    CHECK (low IS NULL OR low >= 0),
    CHECK (close IS NULL OR close >= 0),
    CHECK (volume IS NULL OR volume >= 0),
    CHECK (adjusted_close IS NULL OR adjusted_close >= 0),
    CHECK (shares_outstanding IS NULL OR shares_outstanding >= 0)
);

-- 5. FINANCIAL_STATEMENTS

CREATE TABLE financial_statements (
    ticker                          TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
    statement_date                  DATE NOT NULL,
    fiscal_year                     INT,
    total_revenue                   NUMERIC,
    net_sales                       NUMERIC,
    net_income                      NUMERIC,
    operating_income                NUMERIC,
    gross_profit                    NUMERIC,
    ebitda                          NUMERIC,
    total_assets                    NUMERIC,
    total_liabilities               NUMERIC,
    shareholders_equity             NUMERIC,
    operating_cash_flow             NUMERIC,
    research_development            NUMERIC,
    selling_general_administrative  NUMERIC,
    market_value                    NUMERIC,
    price_fiscal_year_end           NUMERIC,
    PRIMARY KEY (ticker, statement_date),
    CHECK (total_assets IS NULL OR total_assets >= 0)
);

-- 6. ASSET_ALLOCATIONS

CREATE TABLE asset_allocations (
    years_to_retirement  INT NOT NULL CHECK (years_to_retirement >= 0),
    risk_profile         TEXT NOT NULL CHECK (risk_profile IN ('Conservative', 'Moderate', 'Aggressive')),
    stock_percentage     NUMERIC NOT NULL CHECK (stock_percentage BETWEEN 0 AND 100),
    bond_percentage      NUMERIC NOT NULL CHECK (bond_percentage BETWEEN 0 AND 100),
    PRIMARY KEY (years_to_retirement, risk_profile),
    CHECK (stock_percentage + bond_percentage = 100)
);

-- ADD generated column (bond_percentage)
ALTER TABLE asset_allocations
  ADD COLUMN IF NOT EXISTS bond_percentage numeric GENERATED ALWAYS AS (100 - stock_percentage) STORED;

-- 2) ADD generated column (market_cap_category)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS market_cap_category text
    GENERATED ALWAYS AS (
      CASE
        WHEN market_cap IS NULL THEN NULL
        WHEN market_cap <= 2000 THEN 'Small'
        WHEN market_cap <= 10000 THEN 'Mid'
        ELSE 'Large'
      END
    ) STORED;
