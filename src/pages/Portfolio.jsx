import { useEffect, useMemo, useState } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const API_BASE = "http://localhost:8080";
const ALLOCATION_STORAGE_KEY = "cis5500_allocation";
const FACTORS_STORAGE_KEY = "cis5500_factors";
const PORTFOLIO_SETTINGS_STORAGE_KEY = "cis5500_portfolio_settings";
const SCREENER_RESULTS_STORAGE_KEY = "cis5500_screener_results";
const SCREENER_SETTINGS_STORAGE_KEY = "cis5500_screener_settings";
const PIE_COLORS = [
  "#1b4965",
  "#5fa8d3",
  "#62b6cb",
  "#bee9e8",
  "#cae9ff",
  "#ffa62b",
  "#d81159",
  "#8f2d56",
  "#218380",
  "#73d2de",
  "#1f7a8c",
  "#f4a261",
  "#e76f51",
  "#2a9d8f",
  "#264653",
];

const FACTOR_KEYS = ["value", "profitability", "momentum", "size"];
const DEFAULT_FACTOR_WEIGHTS = {
  value: 0.25,
  profitability: 0.25,
  momentum: 0.25,
  size: 0.25,
};

const weightsMatch = (a, b) => {
  if (!a || !b) return false;
  return FACTOR_KEYS.every((key) => Math.abs(Number(a[key]) - Number(b[key])) < 0.000001);
};

function Portfolio() {
  const [stocks, setStocks] = useState([]);
  const [selectedByTicker, setSelectedByTicker] = useState({});
  const [topNSelection, setTopNSelection] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [portfolioSettingsLoaded, setPortfolioSettingsLoaded] = useState(false);

  const [marketCapCategory, setMarketCapCategory] = useState("Large");
  const [weightValue, setWeightValue] = useState(0.25);
  const [weightProfitability, setWeightProfitability] = useState(0.25);
  const [weightMomentum, setWeightMomentum] = useState(0.25);
  const [weightSize, setWeightSize] = useState(0.25);
  const [factorInputs, setFactorInputs] = useState({
    value: "25.0",
    profitability: "25.0",
    momentum: "25.0",
    size: "25.0",
  });
  const [savedFactorWeights, setSavedFactorWeights] = useState(null);

  const [stockAllocationPct, setStockAllocationPct] = useState(70);
  const [savedStockAllocationPct, setSavedStockAllocationPct] = useState(null);
  const [allocationMeta, setAllocationMeta] = useState(null);
  const [appliedMarketCapInfo, setAppliedMarketCapInfo] = useState({
    source: "default",
    category: "Large",
  });
  const [webQuery, setWebQuery] = useState("");
  const [webLabel, setWebLabel] = useState("");
  const [webSummary, setWebSummary] = useState("");
  const [webResults, setWebResults] = useState([]);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState("");
  const [webPopupOpen, setWebPopupOpen] = useState(false);

  const loadAllocationFromStorage = () => {
    try {
      const raw = sessionStorage.getItem(ALLOCATION_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const parsedStockPct = Number(parsed.stock_percentage);

      if (!Number.isNaN(parsedStockPct)) {
        const clampedPct = Math.min(100, Math.max(0, parsedStockPct));
        setStockAllocationPct(clampedPct);
        setSavedStockAllocationPct(clampedPct);
      }

      setAllocationMeta({
        risk_profile: parsed.risk_profile,
        years_to_retirement: parsed.years_to_retirement,
      });
    } catch {
      // Ignore malformed local storage and keep fallback defaults.
    }
  };

  const loadFactorsFromStorage = () => {
    try {
      const raw = sessionStorage.getItem(FACTORS_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const normalized = parsed?.normalized_weights;

      if (
        !normalized ||
        !Number.isFinite(normalized.value) ||
        !Number.isFinite(normalized.profitability) ||
        !Number.isFinite(normalized.momentum) ||
        !Number.isFinite(normalized.size)
      ) {
        return null;
      }

      const clamped = {
        value: Math.min(1, Math.max(0, Number(normalized.value))),
        profitability: Math.min(1, Math.max(0, Number(normalized.profitability))),
        momentum: Math.min(1, Math.max(0, Number(normalized.momentum))),
        size: Math.min(1, Math.max(0, Number(normalized.size))),
      };

      setWeightValue(clamped.value);
      setWeightProfitability(clamped.profitability);
      setWeightMomentum(clamped.momentum);
      setWeightSize(clamped.size);
      setFactorInputs({
        value: (clamped.value * 100).toFixed(1),
        profitability: (clamped.profitability * 100).toFixed(1),
        momentum: (clamped.momentum * 100).toFixed(1),
        size: (clamped.size * 100).toFixed(1),
      });
      setSavedFactorWeights(clamped);

      return clamped;
    } catch {
      return null;
    }
  };

  const loadPortfolioSettingsFromStorage = () => {
    try {
      const raw = sessionStorage.getItem(PORTFOLIO_SETTINGS_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const portfolioNormalized = parsed?.normalized_weights;
      const portfolioMarketCap = parsed?.market_cap_category;
      const portfolioStockAllocation = Number(parsed?.stock_allocation_pct);
      const portfolioTopN = Number(parsed?.top_n_selection);

      const nextSettings = {};

      if (portfolioMarketCap === "Large" || portfolioMarketCap === "Mid" || portfolioMarketCap === "Small") {
        nextSettings.marketCapCategory = portfolioMarketCap;
      }

      if (!Number.isNaN(portfolioStockAllocation)) {
        nextSettings.stockAllocationPct = Math.min(100, Math.max(0, portfolioStockAllocation));
      }

      if (!Number.isNaN(portfolioTopN)) {
        nextSettings.topNSelection = Math.max(1, Math.floor(portfolioTopN));
      }

      if (
        portfolioNormalized &&
        Number.isFinite(portfolioNormalized.value) &&
        Number.isFinite(portfolioNormalized.profitability) &&
        Number.isFinite(portfolioNormalized.momentum) &&
        Number.isFinite(portfolioNormalized.size)
      ) {
        const clamped = {
          value: Math.min(1, Math.max(0, Number(portfolioNormalized.value))),
          profitability: Math.min(1, Math.max(0, Number(portfolioNormalized.profitability))),
          momentum: Math.min(1, Math.max(0, Number(portfolioNormalized.momentum))),
          size: Math.min(1, Math.max(0, Number(portfolioNormalized.size))),
        };

        nextSettings.normalizedWeights = clamped;
        nextSettings.factorInputs = {
          value: (clamped.value * 100).toFixed(1),
          profitability: (clamped.profitability * 100).toFixed(1),
          momentum: (clamped.momentum * 100).toFixed(1),
          size: (clamped.size * 100).toFixed(1),
        };
      }

      return Object.keys(nextSettings).length > 0 ? nextSettings : null;
    } catch {
      return null;
    }
  };

  const loadScreenerSettingsFromStorage = () => {
    try {
      const raw = sessionStorage.getItem(SCREENER_SETTINGS_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const savedMarketCap = parsed?.market_cap_category;

      if (savedMarketCap === "Large" || savedMarketCap === "Mid" || savedMarketCap === "Small") {
        return { marketCapCategory: savedMarketCap };
      }

      return null;
    } catch {
      return null;
    }
  };

  const loadScreenerResultsFromStorage = () => {
    try {
      const raw = sessionStorage.getItem(SCREENER_RESULTS_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return null;
        return {
          results: parsed,
          marketCapCategory: null,
          normalizedWeights: null,
          hasMetadata: false,
        };
      }

      const parsedResults = parsed?.results;
      const parsedMarketCap = parsed?.market_cap_category;
      const parsedWeights = parsed?.normalized_weights;

      const hasValidMarketCap =
        parsedMarketCap === "Large" || parsedMarketCap === "Mid" || parsedMarketCap === "Small";
      const hasValidWeights =
        parsedWeights &&
        Number.isFinite(parsedWeights.value) &&
        Number.isFinite(parsedWeights.profitability) &&
        Number.isFinite(parsedWeights.momentum) &&
        Number.isFinite(parsedWeights.size);

      if (!Array.isArray(parsedResults) || parsedResults.length === 0) return null;

      return {
        results: parsedResults,
        marketCapCategory: hasValidMarketCap ? parsedMarketCap : null,
        normalizedWeights: hasValidWeights
          ? {
              value: Number(parsedWeights.value),
              profitability: Number(parsedWeights.profitability),
              momentum: Number(parsedWeights.momentum),
              size: Number(parsedWeights.size),
            }
          : null,
        hasMetadata: hasValidMarketCap && hasValidWeights,
      };
    } catch {
      return null;
    }
  };

  const fetchScreenerStocks = async (overrides = null) => {
    setLoading(true);
    setError("");

    try {
      const requestWeights = {
        value: overrides?.value ?? weightValue,
        profitability: overrides?.profitability ?? weightProfitability,
        momentum: overrides?.momentum ?? weightMomentum,
        size: overrides?.size ?? weightSize,
      };
      const requestMarketCapCategory = overrides?.marketCapCategory ?? marketCapCategory;

      const params = new URLSearchParams({
        market_cap_category: requestMarketCapCategory,
        weight_value: String(requestWeights.value),
        weight_profitability: String(requestWeights.profitability),
        weight_momentum: String(requestWeights.momentum),
        weight_size: String(requestWeights.size),
      });

      const response = await fetch(`${API_BASE}/screener/ranked?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = await response.json();
      setStocks(data);
      const latestScreenerSettings = loadScreenerSettingsFromStorage();
      const appliedSource =
        latestScreenerSettings?.marketCapCategory === requestMarketCapCategory
          ? "Screener"
          : "Portfolio";
      setAppliedMarketCapInfo({
        source: appliedSource,
        category: requestMarketCapCategory,
      });

      const defaultSelection = Object.fromEntries(
        data.map((row) => [row.ticker, true])
      );
      setSelectedByTicker(defaultSelection);
    } catch (err) {
      setError(err.message || "Unable to load screener data");
      setStocks([]);
      setSelectedByTicker({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllocationFromStorage();
    const loadedFactors = loadFactorsFromStorage();
    const loadedPortfolioSettings = loadPortfolioSettingsFromStorage();
    const loadedScreenerSettings = loadScreenerSettingsFromStorage();
    const loadedScreenerResults = loadScreenerResultsFromStorage();

    const initialMarketCapCategory =
      loadedPortfolioSettings?.marketCapCategory ?? loadedScreenerSettings?.marketCapCategory ?? "Large";

    if (initialMarketCapCategory) {
      setMarketCapCategory(initialMarketCapCategory);
    }

    if (loadedPortfolioSettings?.stockAllocationPct !== undefined) {
      setStockAllocationPct(loadedPortfolioSettings.stockAllocationPct);
    }

    if (loadedPortfolioSettings?.topNSelection !== undefined) {
      setTopNSelection(loadedPortfolioSettings.topNSelection);
    }

    if (loadedPortfolioSettings?.normalizedWeights) {
      const nextWeights = loadedPortfolioSettings.normalizedWeights;
      setWeightValue(nextWeights.value);
      setWeightProfitability(nextWeights.profitability);
      setWeightMomentum(nextWeights.momentum);
      setWeightSize(nextWeights.size);
      setFactorInputs(loadedPortfolioSettings.factorInputs);
    }

    setPortfolioSettingsLoaded(true);
    setAppliedMarketCapInfo({
      source: loadedPortfolioSettings?.marketCapCategory
        ? "Portfolio"
        : loadedScreenerSettings?.marketCapCategory
          ? "Screener"
          : "default",
      category: initialMarketCapCategory,
    });

    const requestOverrides = loadedPortfolioSettings?.normalizedWeights ?? loadedFactors ?? DEFAULT_FACTOR_WEIGHTS;

    const shouldUseSavedScreenerResults = Boolean(
      loadedScreenerResults && (
        loadedScreenerResults.hasMetadata
          ? loadedScreenerResults.marketCapCategory === initialMarketCapCategory &&
            weightsMatch(loadedScreenerResults.normalizedWeights, requestOverrides)
          : !loadedPortfolioSettings?.normalizedWeights &&
            !loadedPortfolioSettings?.marketCapCategory &&
            !loadedFactors
      )
    );

    if (shouldUseSavedScreenerResults && loadedScreenerResults) {
      setStocks(loadedScreenerResults.results);
      const defaultSelection = Object.fromEntries(
        loadedScreenerResults.results.map((row) => [row.ticker, true])
      );
      setSelectedByTicker(defaultSelection);
    } else {
      fetchScreenerStocks(
        {
          ...requestOverrides,
          marketCapCategory: initialMarketCapCategory,
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!portfolioSettingsLoaded) return;

    sessionStorage.setItem(
      PORTFOLIO_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        market_cap_category: marketCapCategory,
        stock_allocation_pct: stockAllocationPct,
        top_n_selection: topNSelection,
        factor_inputs: factorInputs,
        normalized_weights: {
          value: weightValue,
          profitability: weightProfitability,
          momentum: weightMomentum,
          size: weightSize,
        },
      })
    );
  }, [
    portfolioSettingsLoaded,
    marketCapCategory,
    stockAllocationPct,
    topNSelection,
    factorInputs,
    weightValue,
    weightProfitability,
    weightMomentum,
    weightSize,
  ]);

  useEffect(() => {
    if (stocks.length > 0) {
      const nextSelection = Object.fromEntries(
        stocks.map((row, index) => [row.ticker, index < topNSelection])
      );
      setSelectedByTicker(nextSelection);
    }
  }, [stocks, topNSelection]);

  const selectedStocks = useMemo(
    () => stocks.filter((row) => selectedByTicker[row.ticker]),
    [stocks, selectedByTicker]
  );

  const bondAllocationPct = Math.max(0, 100 - stockAllocationPct);

  const weightedStocks = useMemo(() => {
    const totalComposite = selectedStocks.reduce(
      (sum, row) => sum + Number(row.composite_score),
      0
    );

    if (!totalComposite) return [];

    return selectedStocks.map((row, index) => {
      const stockSideWeightPct =
        Number(row.composite_score) / totalComposite;
      const finalPortfolioWeightPct = stockSideWeightPct * stockAllocationPct;

      return {
        id: row.ticker,
        rank: index + 1,
        ticker: row.ticker,
        company_name: row.company_name,
        sector: row.sector,
        composite_score: Number(row.composite_score),
        stock_side_weight_pct: stockSideWeightPct * 100,
        final_weight_pct: finalPortfolioWeightPct,
      };
    });
  }, [selectedStocks, stockAllocationPct]);

  const pieData = useMemo(() => {
    const stockSlices = weightedStocks.map((row) => ({
      name: row.ticker,
      value: Number(row.final_weight_pct.toFixed(4)),
    }));

    return [
      { name: "Bonds", value: Number(bondAllocationPct.toFixed(4)) },
      ...stockSlices,
    ];
  }, [weightedStocks, bondAllocationPct]);

  const toggleTicker = (ticker) => {
    setSelectedByTicker((prev) => ({ ...prev, [ticker]: !prev[ticker] }));
  };

  const selectAll = () => {
    setSelectedByTicker(Object.fromEntries(stocks.map((row) => [row.ticker, true])));
  };

  const clearAll = () => {
    setSelectedByTicker(Object.fromEntries(stocks.map((row) => [row.ticker, false])));
  };

  const selectTopN = (n) => {
    const nextSelection = Object.fromEntries(
      stocks.map((row, index) => [row.ticker, index < n])
    );
    setSelectedByTicker(nextSelection);
  };

  const searchCompanyOnWeb = async (companyName, ticker) => {
    const query = `${companyName} ${ticker} stock`;
    const label = `${companyName} (${String(ticker).toUpperCase()})`;
    setWebPopupOpen(true);
    setWebLabel(label);
    setWebQuery(query);
    setWebSummary("");
    setWebLoading(true);
    setWebError("");

    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`${API_BASE}/search/web?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        const detailsText = typeof data?.details === "string" ? data.details : "";
        let providerMessage = "";

        if (detailsText) {
          try {
            const parsed = JSON.parse(detailsText);
            providerMessage = parsed?.error?.message || detailsText;
          } catch {
            providerMessage = detailsText;
          }
        }

        throw new Error(
          providerMessage
            ? `${data?.error || `Web search failed: ${response.status}`} ${providerMessage}`
            : data?.error || `Web search failed: ${response.status}`
        );
      }

      setWebSummary(typeof data?.summary === "string" ? data.summary : "");
      setWebResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      setWebSummary("");
      setWebResults([]);
      setWebError(err.message || "Failed to fetch web search results");
    } finally {
      setWebLoading(false);
    }
  };

  const handleStockAllocationChange = (value) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;
    setStockAllocationPct(Math.min(100, Math.max(0, parsed)));
  };

  const handleFactorPercentChange = (changedKey, value) => {
    setFactorInputs((prev) => ({ ...prev, [changedKey]: value }));

    const parsedPercent = Number(value);
    if (Number.isNaN(parsedPercent)) return;

    const clampedPercent = Math.min(100, Math.max(0, parsedPercent));
    const nextWeight = clampedPercent / 100;

    if (changedKey === "value") setWeightValue(nextWeight);
    if (changedKey === "profitability") setWeightProfitability(nextWeight);
    if (changedKey === "momentum") setWeightMomentum(nextWeight);
    if (changedKey === "size") setWeightSize(nextWeight);
  };

  const factorTotalPct = FACTOR_KEYS.reduce((sum, key) => {
    const parsed = Number(factorInputs[key]);
    if (Number.isNaN(parsed)) return sum;
    return sum + Math.min(100, Math.max(0, parsed));
  }, 0);
  const normalizedFactorTotalPct =
    (weightValue + weightProfitability + weightMomentum + weightSize) * 100;
  const isFactorTotalValid = Math.abs(normalizedFactorTotalPct - 100) < 0.05;
  const hasCustomPortfolioFactors = FACTOR_KEYS.some((key) => {
    const parsed = Number(factorInputs[key]);
    if (Number.isNaN(parsed)) return false;
    return Math.abs(parsed - 25) > 0.05;
  });
  const factorResetWeights = savedFactorWeights ?? {
    value: 0.25,
    profitability: 0.25,
    momentum: 0.25,
    size: 0.25,
  };
  const allocationResetPct = savedStockAllocationPct ?? 70;
  const usingFactorResetTarget =
    Math.abs(weightValue - factorResetWeights.value) < 0.0001 &&
    Math.abs(weightProfitability - factorResetWeights.profitability) < 0.0001 &&
    Math.abs(weightMomentum - factorResetWeights.momentum) < 0.0001 &&
    Math.abs(weightSize - factorResetWeights.size) < 0.0001;
  const usingAllocationResetTarget =
    Math.abs(stockAllocationPct - allocationResetPct) < 0.0001;

  const usingSavedAllocation =
    savedStockAllocationPct !== null &&
    Math.abs(stockAllocationPct - savedStockAllocationPct) < 0.0001;

  const usingSavedFactors =
    savedFactorWeights !== null &&
    Math.abs(weightValue - savedFactorWeights.value) < 0.0001 &&
    Math.abs(weightProfitability - savedFactorWeights.profitability) < 0.0001 &&
    Math.abs(weightMomentum - savedFactorWeights.momentum) < 0.0001 &&
    Math.abs(weightSize - savedFactorWeights.size) < 0.0001;

  const allocationStatusMessage = allocationMeta
    ? usingSavedAllocation
      ? "Using saved allocation from Allocation screen."
      : "Using custom allocation override in Portfolio screen."
    : "Using default 70/30 allocation.";

  const factorStatusMessage = savedFactorWeights === null
    ? hasCustomPortfolioFactors
      ? "Using custom factor override in Portfolio screen."
      : "Using default equal factor weights."
    : usingSavedFactors
      ? "Using saved factor weights from Factors screen."
      : "Using custom factor override in Portfolio screen.";

  return (
    <div>
      <h2>Portfolio Recommendations</h2>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <label>
            <strong>Market Cap Category:</strong>{" "}
          </label>
          <select
            value={marketCapCategory}
            onChange={(e) => setMarketCapCategory(e.target.value)}
            disabled={loading}
          >
            <option value="Large">Large</option>
            <option value="Mid">Mid</option>
            <option value="Small">Small</option>
          </select>
          <div style={{ marginTop: 6, fontSize: 13 }}>
            <span>
              {appliedMarketCapInfo.source === "default"
                ? "Using default market cap."
                : appliedMarketCapInfo.source === "Screener"
                  ? "Using saved market cap from Screener screen."
                  : "Using custom market cap override in Portfolio screen."}
            </span>
          </div>
        </div>

        <div>
          <label>
            <strong>Stock Allocation (%):</strong>{" "}
          </label>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginLeft: 8 }}>
            <span style={{ minWidth: 90, textAlign: "right" }}>
              Bonds {bondAllocationPct.toFixed(1)}%
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={stockAllocationPct}
              onChange={(e) => handleStockAllocationChange(e.target.value)}
            />
            <span style={{ minWidth: 90 }}>
              Stocks {stockAllocationPct.toFixed(1)}%
            </span>
          </div>
          {!usingAllocationResetTarget && (
            <button
              style={{ marginLeft: 8 }}
              onClick={() => setStockAllocationPct(allocationResetPct)}
            >
              Reset Allocation
            </button>
          )}
          <div style={{ marginTop: 4, fontSize: 13 }}>
            <span>{allocationStatusMessage}</span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <strong>Factors:</strong>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <label>
            Value (%)
            <input
              style={{ marginLeft: 8, width: 70 }}
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={factorInputs.value}
              onChange={(e) => handleFactorPercentChange("value", e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Profitability (%)
            <input
              style={{ marginLeft: 8, width: 70 }}
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={factorInputs.profitability}
              onChange={(e) => handleFactorPercentChange("profitability", e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Momentum (%)
            <input
              style={{ marginLeft: 8, width: 70 }}
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={factorInputs.momentum}
              onChange={(e) => handleFactorPercentChange("momentum", e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Size (%)
            <input
              style={{ marginLeft: 8, width: 70 }}
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={factorInputs.size}
              onChange={(e) => handleFactorPercentChange("size", e.target.value)}
              disabled={loading}
            />
          </label>
          {!usingFactorResetTarget && (
            <button
              disabled={loading}
              onClick={() => {
                setWeightValue(factorResetWeights.value);
                setWeightProfitability(factorResetWeights.profitability);
                setWeightMomentum(factorResetWeights.momentum);
                setWeightSize(factorResetWeights.size);
                setFactorInputs({
                  value: (factorResetWeights.value * 100).toFixed(1),
                  profitability: (factorResetWeights.profitability * 100).toFixed(1),
                  momentum: (factorResetWeights.momentum * 100).toFixed(1),
                  size: (factorResetWeights.size * 100).toFixed(1),
                });
              }}
            >
              Reset Factors
            </button>
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: 13 }}>
          <span>Total factor weight: {factorTotalPct.toFixed(1)}%</span>
        </div>
        {!isFactorTotalValid && (
          <div style={{ marginTop: 4, fontSize: 13, color: "crimson" }}>
            Factor weights must add up to 100.0% before refreshing screener results.
          </div>
        )}
        <div style={{ marginTop: 4, fontSize: 13 }}>
          <span>{factorStatusMessage}</span>
        </div>
        <div style={{ marginTop: 22 }}>
          <button onClick={fetchScreenerStocks} disabled={loading || !isFactorTotalValid}>
            {loading ? "Loading..." : "Refresh Recommendations"}
          </button>
        </div>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {webPopupOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 2000,
          }}
        >
          <div
            style={{
              width: "min(900px, 95vw)",
              maxHeight: "85vh",
              overflowY: "auto",
              backgroundColor: "#fff",
              borderRadius: 10,
              border: "1px solid #ddd",
              padding: 16,
              boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{webLabel || "Web Results"}</strong>
              <button onClick={() => setWebPopupOpen(false)}>Close</button>
            </div>
            {webLoading && <p style={{ marginTop: 8 }}>Searching web...</p>}
            {webError && <p style={{ marginTop: 8, color: "crimson" }}>{webError}</p>}
            {!webLoading && !webError && webSummary && (
              <p style={{ marginTop: 8, marginBottom: 10, lineHeight: 1.45 }}>
                {webSummary}
              </p>
            )}
            {!webLoading && !webError && webQuery && webResults.length === 0 && (
              <p style={{ marginTop: 8 }}>No results found.</p>
            )}
            {!webLoading && !webError && webResults.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 13, marginBottom: 0 }}>
                  <strong>Sources:</strong>{" "}
                  {webResults.map((row, index) => (
                    <span key={row.url}>
                      <a href={row.url} target="_blank" rel="noreferrer">
                        {row.name}
                      </a>
                      {index < webResults.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ width: "100%", height: 460, marginBottom: 24 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              outerRadius={165}
              label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
            >
              {pieData.map((entry, index) => (
                <Cell
                  key={`${entry.name}-${index}`}
                  fill={index === 0 ? "#3f3f46" : PIE_COLORS[index % PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <h3>Selected Stocks ({selectedStocks.length})</h3>
      <p>
        Use the slider to automatically select the top n ranked stocks.
        You can then add or remove any additional stocks by checking or unchecking the checkboxes. The final stock and bond weights in your portfolio will
        update automatically within your stock allocation.
      </p>
      <div style={{ marginBottom: 10 }}>
        <label>
          Top Stocks to Select: {Math.min(topNSelection, stocks.length)}
          <input
            style={{ marginLeft: 8, width: 220, verticalAlign: "middle" }}
            type="range"
            min="1"
            max={Math.max(stocks.length, 1)}
            step="1"
            value={Math.min(topNSelection, Math.max(stocks.length, 1))}
            onChange={(e) => {
              const nextN = Number(e.target.value);
              setTopNSelection(nextN);
              selectTopN(nextN);
            }}
            disabled={loading || stocks.length === 0}
          />
        </label>
        <button onClick={selectAll} disabled={loading || stocks.length === 0}>
          Select all
        </button>
        <button style={{ marginLeft: 8 }} onClick={clearAll} disabled={loading || stocks.length === 0}>
          Clear all
        </button>
      </div>
      <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid #ddd", padding: 12 }}>
        {stocks.map((row) => (
          <label
            key={row.ticker}
            style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}
          >
            <input
              type="checkbox"
              checked={Boolean(selectedByTicker[row.ticker])}
              onChange={() => toggleTicker(row.ticker)}
            />
            <span style={{ minWidth: 56, fontWeight: 700 }}>{row.ticker}</span>
            <button
              onClick={() => searchCompanyOnWeb(row.company_name, row.ticker)}
              style={{
                background: "none",
                border: "none",
                color: "#0a66c2",
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {row.company_name}
            </button>
          </label>
        ))}
      </div>

      <h3 style={{ marginTop: 20 }}>Final Portfolio</h3>
      <table border="1" cellPadding="8" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Ticker</th>
            <th>Company</th>
            <th>Sector</th>
            <th>Composite Score</th>
            <th>Stock-Side Weight (%)</th>
            <th>Portfolio Weight (%)</th>
          </tr>
        </thead>
        <tbody>
          {weightedStocks.map((row) => (
            <tr key={row.id}>
              <td>{row.rank}</td>
              <td>{row.ticker}</td>
              <td>
                <button
                  onClick={() => searchCompanyOnWeb(row.company_name, row.ticker)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#0a66c2",
                    textDecoration: "underline",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {row.company_name}
                </button>
              </td>
              <td>{row.sector}</td>
              <td>{row.composite_score.toFixed(4)}</td>
              <td>{row.stock_side_weight_pct.toFixed(1)}</td>
              <td>{row.final_weight_pct.toFixed(1)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan="5" style={{ textAlign: "right", fontWeight: 700 }}>
              Stock Allocation
            </td>
            <td style={{ fontWeight: 700 }}>{stockAllocationPct.toFixed(1)}</td>
          </tr>
          <tr>
            <td colSpan="5" style={{ textAlign: "right", fontWeight: 700 }}>
              Bond Allocation
            </td>
            <td style={{ fontWeight: 700 }}>{bondAllocationPct.toFixed(1)}</td>
          </tr>
          <tr>
            <td colSpan="5" style={{ textAlign: "right", fontWeight: 700 }}>
              Total Portfolio
            </td>
            <td style={{ fontWeight: 700 }}>
              {(bondAllocationPct + weightedStocks.reduce((s, r) => s + r.final_weight_pct, 0)).toFixed(1)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default Portfolio;
