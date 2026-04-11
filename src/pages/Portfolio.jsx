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

function Portfolio() {
  const [stocks, setStocks] = useState([]);
  const [selectedByTicker, setSelectedByTicker] = useState({});
  const [topNSelection, setTopNSelection] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [marketCapCategory, setMarketCapCategory] = useState("Large");
  const [weightValue, setWeightValue] = useState(0.25);
  const [weightProfitability, setWeightProfitability] = useState(0.25);
  const [weightMomentum, setWeightMomentum] = useState(0.25);
  const [weightSize, setWeightSize] = useState(0.25);
  const [savedFactorWeights, setSavedFactorWeights] = useState(null);

  const [stockAllocationPct, setStockAllocationPct] = useState(70);
  const [savedStockAllocationPct, setSavedStockAllocationPct] = useState(null);
  const [allocationMeta, setAllocationMeta] = useState(null);

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
      setSavedFactorWeights(clamped);

      return clamped;
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

      const params = new URLSearchParams({
        market_cap_category: marketCapCategory,
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
    fetchScreenerStocks(loadedFactors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleStockAllocationChange = (value) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;
    setStockAllocationPct(Math.min(100, Math.max(0, parsed)));
  };

  const handleFactorPercentChange = (setter, value) => {
    const parsedPercent = Number(value);
    if (Number.isNaN(parsedPercent)) return;
    const clampedPercent = Math.min(100, Math.max(0, parsedPercent));
    setter(clampedPercent / 100);
  };

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
      ? `Recommended allocation for a ${String(
          allocationMeta.risk_profile || ""
        ).toLowerCase()} strategy with ${allocationMeta.years_to_retirement} years to retirement.`
      : "Using a custom allocation override instead of the recommended allocation."
    : "No saved Allocation found yet. Using default 70/30 until you calculate on the Allocation screen.";

  return (
    <div>
      <h2>Portfolio Recommendations</h2>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <label>
            <strong>Market Cap Bucket:</strong>{" "}
          </label>
          <select
            value={marketCapCategory}
            onChange={(e) => setMarketCapCategory(e.target.value)}
          >
            <option value="Large">Large</option>
            <option value="Mid">Mid</option>
            <option value="Small">Small</option>
          </select>
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
          {savedStockAllocationPct !== null && !usingSavedAllocation && (
            <button
              style={{ marginLeft: 8 }}
              onClick={() => setStockAllocationPct(savedStockAllocationPct)}
            >
              Reset to Allocation
            </button>
          )}
          <div style={{ marginTop: 6, fontSize: 13 }}>
            <span>{allocationStatusMessage}</span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <strong>Factors:</strong>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, marginLeft: 12 }}>
          <label>
            Value (%)
            <input
              style={{ marginLeft: 8, width: 70 }}
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={(weightValue * 100).toFixed(2)}
              onChange={(e) => handleFactorPercentChange(setWeightValue, e.target.value)}
            />
          </label>
          <label>
            Profitability (%)
            <input
              style={{ marginLeft: 8, width: 70 }}
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={(weightProfitability * 100).toFixed(2)}
              onChange={(e) => handleFactorPercentChange(setWeightProfitability, e.target.value)}
            />
          </label>
          <label>
            Momentum (%)
            <input
              style={{ marginLeft: 8, width: 70 }}
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={(weightMomentum * 100).toFixed(2)}
              onChange={(e) => handleFactorPercentChange(setWeightMomentum, e.target.value)}
            />
          </label>
          <label>
            Size (%)
            <input
              style={{ marginLeft: 8, width: 70 }}
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={(weightSize * 100).toFixed(2)}
              onChange={(e) => handleFactorPercentChange(setWeightSize, e.target.value)}
            />
          </label>
          <button onClick={fetchScreenerStocks} disabled={loading}>
            {loading ? "Loading..." : "Refresh Top 25"}
          </button>
          {savedFactorWeights !== null && !usingSavedFactors && (
            <button
              onClick={() => {
                setWeightValue(savedFactorWeights.value);
                setWeightProfitability(savedFactorWeights.profitability);
                setWeightMomentum(savedFactorWeights.momentum);
                setWeightSize(savedFactorWeights.size);
              }}
            >
              Reset to Factors
            </button>
          )}
        </div>
        <div style={{ marginTop: 6, marginLeft: 12, fontSize: 13 }}>
          {savedFactorWeights === null ? (
            <span>No saved factor preferences found yet. Using equal default factor weights.</span>
          ) : usingSavedFactors ? (
            <span>Using factor weights from the Factors screen.</span>
          ) : (
            <span>Using a custom factor override instead of Factors-screen weights.</span>
          )}
        </div>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

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
            <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} />
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
            <span>{row.company_name}</span>
          </label>
        ))}
      </div>

      <h3 style={{ marginTop: 20 }}>Final Weights</h3>
      <table border="1" cellPadding="8" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Ticker</th>
            <th>Company</th>
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
              <td>{row.company_name}</td>
              <td>{row.composite_score.toFixed(4)}</td>
              <td>{row.stock_side_weight_pct.toFixed(2)}</td>
              <td>{row.final_weight_pct.toFixed(2)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan="5" style={{ textAlign: "right", fontWeight: 700 }}>
              Stock Allocation
            </td>
            <td style={{ fontWeight: 700 }}>{stockAllocationPct.toFixed(2)}</td>
          </tr>
          <tr>
            <td colSpan="5" style={{ textAlign: "right", fontWeight: 700 }}>
              Bond Allocation
            </td>
            <td style={{ fontWeight: 700 }}>{bondAllocationPct.toFixed(2)}</td>
          </tr>
          <tr>
            <td colSpan="5" style={{ textAlign: "right", fontWeight: 700 }}>
              Total Portfolio
            </td>
            <td style={{ fontWeight: 700 }}>
              {(bondAllocationPct + weightedStocks.reduce((s, r) => s + r.final_weight_pct, 0)).toFixed(2)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default Portfolio;
