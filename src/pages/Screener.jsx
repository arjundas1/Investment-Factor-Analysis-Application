import { useState, useEffect } from "react";

const API_BASE = "http://localhost:8080";
const FACTORS_STORAGE_KEY = "cis5500_factors";
const SCREENER_RESULTS_STORAGE_KEY = "cis5500_screener_results";
const SCREENER_SETTINGS_STORAGE_KEY = "cis5500_screener_settings";

function Screener() {
   const [marketCapCategory, setMarketCapCategory] = useState("Large");
   const [weights, setWeights] = useState({
    value: 0.25,
    profitability: 0.25,
    momentum: 0.25,
    size: 0.25,
  });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {

    try {
      const rawFactors = sessionStorage.getItem(FACTORS_STORAGE_KEY);

      if (rawFactors) {
        const parsed = JSON.parse(rawFactors);

        if (parsed.normalized_weights) {
          setWeights(parsed.normalized_weights);
        }
      }
    } catch {
    }

    try {
      const rawSettings = sessionStorage.getItem(SCREENER_SETTINGS_STORAGE_KEY);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        if (parsed.market_cap_category) {
          setMarketCapCategory(parsed.market_cap_category);
        }
      }
    } catch {
    }
  }, []); 

  const runScreener = () => {

    setLoading(true); 

    setError("");

    const url = `${API_BASE}/screener/ranked?market_cap_category=${marketCapCategory}` +
      `&weight_value=${weights.value}` +
      `&weight_profitability=${weights.profitability}` +
      `&weight_momentum=${weights.momentum}` +
      `&weight_size=${weights.size}`;
    
    fetch(url)
      .then(res => res.json())
      .then(resJson => {

        setResults(resJson);

        sessionStorage.setItem(
          SCREENER_RESULTS_STORAGE_KEY,
          JSON.stringify({
            results: resJson,
            market_cap_category: marketCapCategory,
            normalized_weights: {
              value: Number(weights.value),
              profitability: Number(weights.profitability),
              momentum: Number(weights.momentum),
              size: Number(weights.size),
            },
          })
        );
        
        // Save the user's current market cap selection 
        sessionStorage.setItem(
          SCREENER_SETTINGS_STORAGE_KEY,
          JSON.stringify({ market_cap_category: marketCapCategory })
        );

        setLoading(false);
      })
      .catch(err => {
        setError(err.message || "Failed to load screener results");
        setLoading(false);
      });
  };
  
    return (
    <div>
      <h2>Stock Screener</h2>
      <p>Rank stocks across value, profitability, momentum, and size factors.
        Weights are pulled from the Factors page if you've set them there.</p>

      <div style={{ marginBottom: "30px" }}>
        <div>
          <label>
            <strong>Market Cap Category (Billions):</strong> 
            <select 
            value={marketCapCategory}
            // onChange when user picks different value
            // e.target.value is new value of dropdown
            onChange={(e) => setMarketCapCategory(e.target.value)}
            // disable dropdown while fetch in progress
            disabled={loading}
            style={{marginLeft: "8px"}}
            >
            <option value="Large">Large</option>
            <option value="Mid">Mid</option>
            <option value="Small">Small</option>
            </select>
            </label>
        </div>
        </div>
        
        {/* show user factor weights */}
        <div style={{ marginBottom: "20px" }}>
          <strong>Current Factor Weights:</strong>
          <div style={{ marginTop: "6px", fontSize: "13px" }}>
            Value: {(weights.value * 100).toFixed(1)}% &nbsp;|&nbsp;
            Profitability: {(weights.profitability * 100).toFixed(1)}% &nbsp;|&nbsp;
            Momentum: {(weights.momentum * 100).toFixed(1)}% &nbsp;|&nbsp;
            Size: {(weights.size * 100).toFixed(1)}%
          </div>
        </div>

        {/* Run Screener button*/}
        <button
        onClick={runScreener}
        disabled={loading}
        style={{ marginBottom: "20px" }}
      >
        {loading ? "Loading..." : "Run Screener"}
      </button>

      {/*Error Message*/}
      {error && (
        <p style={{ color: "crimson" }}>{error}</p>
      )}

      <h3>Top 25 Ranked Stocks</h3>

      {results.length === 0 && !loading && (
        <p>Click "Run Screener" to fetch ranked stocks.</p>
      )}

      {results.length > 0 && (
        <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Ticker</th>
              <th>Company</th>
              <th>Sector</th>
              <th>Market Cap (M)</th>
              <th>Value Score</th>
              <th>Profitability Score</th>
              <th>Momentum Score</th>
              <th>Size Score</th>
              <th>Composite Score</th>
            </tr>
          </thead>
          <tbody>
       
            {/* .map() loops over the results array and returns one <tr> per stock. */}
            {results.map((stock, idx) => (
              <tr key={stock.ticker}>
                <td>{idx + 1}</td>
                <td><strong>{stock.ticker}</strong></td>
                <td>{stock.company_name}</td>
                <td>{stock.sector}</td>
                <td>{Number(stock.market_cap_millions).toLocaleString()}</td>
                <td>{Number(stock.value_score).toFixed(4)}</td>
                <td>{Number(stock.profitability_score).toFixed(4)}</td>
                <td>{Number(stock.momentum_score).toFixed(4)}</td>
                <td>{Number(stock.size_score).toFixed(4)}</td>
                <td><strong>{Number(stock.composite_score).toFixed(4)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Screener;
