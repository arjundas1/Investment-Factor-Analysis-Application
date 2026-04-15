import { useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";

const ALLOCATION_STORAGE_KEY = "cis5500_allocation";
const API_BASE = "http://localhost:8080";

const PIE_COLORS = ["#1b4965", "#5fa8d3"];
const PROFILE_COLORS = {
  Conservative: "#2a9d8f",
  Moderate: "#264653",
  Aggressive: "#e76f51",
};

const readSavedAllocation = () => {
  try {
    const raw = sessionStorage.getItem(ALLOCATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const getCurrentAge = (birthDateIso) => {
  if (!birthDateIso) return null;
  const today = new Date();
  const birthDate = new Date(birthDateIso);
  if (Number.isNaN(birthDate.getTime())) return null;
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
};

function Allocation() {
  const [initialState] = useState(() => {
    const saved = readSavedAllocation();
    const savedRisk =
      saved?.risk_profile === "Conservative" ||
      saved?.risk_profile === "Moderate" ||
      saved?.risk_profile === "Aggressive"
        ? saved.risk_profile
        : "";
    const savedResult =
      Number.isFinite(saved?.stock_percentage) &&
      Number.isFinite(saved?.bond_percentage) &&
      Number.isFinite(saved?.current_age) &&
      Number.isFinite(saved?.years_to_retirement)
        ? {
            stocks: Number(saved.stock_percentage).toFixed(1),
            bonds: Number(saved.bond_percentage).toFixed(1),
            current_age: saved.current_age,
            years_to_retirement: saved.years_to_retirement,
          }
        : null;
    return {
      dateOfBirth: saved?.date_of_birth || "",
      retirementAge: Number.isFinite(saved?.retirement_age) ? String(saved.retirement_age) : "",
      risk: savedRisk,
      result: savedResult,
    };
  });

  const [dateOfBirth, setDateOfBirth] = useState(initialState.dateOfBirth);
  const [retirementAge, setRetirementAge] = useState(initialState.retirementAge);
  const [risk, setRisk] = useState(initialState.risk);
  const [result, setResult] = useState(initialState.result);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Enriched data state
  const [enrichedData, setEnrichedData] = useState(null);
  const [riskComparison, setRiskComparison] = useState(null);
  const [glidePath, setGlidePath] = useState(null);

  const calculateAllocation = async () => {
    setError("");

    const currentAge = getCurrentAge(dateOfBirth);
    if (currentAge === null || currentAge < 0) {
      setResult(null);
      setError("Please enter a valid date of birth.");
      return;
    }

    const parsedRetirementAge = Number(retirementAge);
    if (!Number.isFinite(parsedRetirementAge) || parsedRetirementAge <= currentAge) {
      setResult(null);
      setError("Retirement age must be greater than your current age.");
      return;
    }

    if (!risk) {
      setResult(null);
      setError("Please select a risk tolerance.");
      return;
    }

    const yearsToRetirement = parsedRetirementAge - currentAge;
    const retirementYear = new Date().getFullYear() + yearsToRetirement;

    setLoading(true);
    setEnrichedData(null);
    setRiskComparison(null);
    setGlidePath(null);

    try {
      // Fetch all three endpoints in parallel
      const [allocRes, enrichedRes, comparisonRes, glideRes] = await Promise.all([
        fetch(`${API_BASE}/asset-allocation?${new URLSearchParams({
          years_to_retirement: String(yearsToRetirement),
          risk_profile: risk,
        })}`),
        fetch(`${API_BASE}/allocation/enriched?${new URLSearchParams({
          retirement_year: String(retirementYear),
          risk_profile: risk,
        })}`),
        fetch(`${API_BASE}/allocation/risk_comparison?${new URLSearchParams({
          retirement_year: String(retirementYear),
        })}`),
        fetch(`${API_BASE}/allocation/glide_path?${new URLSearchParams({
          risk_profile: risk,
        })}`),
      ]);

      if (!allocRes.ok) throw new Error(`Allocation lookup failed: ${allocRes.status}`);
      const allocation = await allocRes.json();

      const calculated = {
        stocks: Number(allocation.stock_percentage).toFixed(1),
        bonds: Number(allocation.bond_percentage).toFixed(1),
        current_age: currentAge,
        years_to_retirement: yearsToRetirement,
      };
      setResult(calculated);

      sessionStorage.setItem(
        ALLOCATION_STORAGE_KEY,
        JSON.stringify({
          date_of_birth: dateOfBirth,
          current_age: currentAge,
          retirement_age: parsedRetirementAge,
          years_to_retirement: yearsToRetirement,
          risk_profile: risk,
          stock_percentage: Number(calculated.stocks),
          bond_percentage: Number(calculated.bonds),
        })
      );

      // Process enriched data
      if (enrichedRes.ok) {
        setEnrichedData(await enrichedRes.json());
      }

      // Process risk comparison
      if (comparisonRes.ok) {
        setRiskComparison(await comparisonRes.json());
      }

      // Process glide path
      if (glideRes.ok) {
        setGlidePath(await glideRes.json());
      }
    } catch (err) {
      setResult(null);
      setError(err.message || "Failed to load allocation from database");
    } finally {
      setLoading(false);
    }
  };

  // Prepare pie chart data
  const pieData = result
    ? [
        { name: "Stocks", value: Number(result.stocks) },
        { name: "Bonds", value: Number(result.bonds) },
      ]
    : [];

  // Group risk comparison data by profile
  const comparisonByProfile = {};
  if (riskComparison) {
    for (const row of riskComparison) {
      if (!comparisonByProfile[row.risk_profile]) {
        comparisonByProfile[row.risk_profile] = {
          stock_percentage: row.stock_percentage,
          bond_percentage: row.bond_percentage,
          sectors: [],
        };
      }
      comparisonByProfile[row.risk_profile].sectors.push(row);
    }
  }

  // Prepare glide path chart data (sample every 5 years for readability)
  const glideChartData = glidePath
    ? glidePath
        .filter((r) => r.years_to_retirement % 5 === 0 || r.years_to_retirement === 0)
        .map((r) => ({
          years: r.years_to_retirement,
          stocks: Number(r.stock_percentage),
          bonds: Number(r.bond_percentage),
        }))
    : [];

  return (
    <div>
      <h2>Retirement Allocation Planner</h2>
      <p style={{ color: "#666", maxWidth: 700 }}>
        Enter your details below to see your recommended stock/bond allocation,
        historical market context, risk profile comparison, and allocation glide path.
      </p>

      {/* ---- Input Form ---- */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <label><strong>Date of Birth:</strong></label><br />
          <input
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            style={{ marginTop: 4, padding: "6px 10px" }}
          />
        </div>
        <div>
          <label><strong>Desired Retirement Age:</strong></label><br />
          <input
            type="number"
            min="1"
            value={retirementAge}
            onChange={(e) => setRetirementAge(e.target.value)}
            style={{ marginTop: 4, padding: "6px 10px", width: 80 }}
          />
        </div>
        <div>
          <label><strong>Risk Tolerance:</strong></label><br />
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            style={{ marginTop: 4, padding: "6px 10px" }}
          >
            <option value="">Select risk profile</option>
            <option>Conservative</option>
            <option>Moderate</option>
            <option>Aggressive</option>
          </select>
        </div>
      </div>

      <button
        onClick={calculateAllocation}
        disabled={loading}
        style={{ padding: "10px 28px", fontSize: 16, cursor: loading ? "wait" : "pointer" }}
      >
        {loading ? "Calculating..." : "Calculate Allocation"}
      </button>

      {error && <p style={{ marginTop: 16, color: "crimson" }}>{error}</p>}

      {/* ---- Primary Result + Pie Chart ---- */}
      {result && (
        <div style={{ marginTop: 30, display: "flex", gap: 40, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <h3>Recommended Allocation</h3>
            <p>Current Age: {result.current_age}</p>
            <p>Years to Retirement: {result.years_to_retirement}</p>
            <p><strong>Stocks: {result.stocks}%</strong></p>
            <p><strong>Bonds: {result.bonds}%</strong></p>
            <p style={{ fontSize: 13, color: "#888" }}>Saved for Portfolio screen.</p>
          </div>

          <div style={{ width: 280, height: 250 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  label={({ name, value }) => `${name}: ${value}%`}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ---- Historical Market Context (enriched) ---- */}
      {enrichedData && (
        <div style={{ marginTop: 30, padding: 20, background: "#f8f9fa", border: "1px solid #dee2e6" }}>
          <h3>Historical Market Context</h3>
          <p style={{ color: "#666", fontSize: 14 }}>
            Based on {enrichedData.trading_days} trading days over your {enrichedData.years_to_retirement}-year horizon:
          </p>
          <table border="1" cellPadding="10" style={{ borderCollapse: "collapse", marginTop: 10 }}>
            <thead>
              <tr style={{ background: "#e9ecef" }}>
                <th>Metric</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Historical Annualized Return</td>
                <td><strong>{enrichedData.historical_annual_return_pct}%</strong></td>
              </tr>
              <tr>
                <td>Historical Volatility</td>
                <td>{enrichedData.historical_volatility_pct}%</td>
              </tr>
              <tr>
                <td>Sharpe Ratio</td>
                <td>{enrichedData.sharpe_ratio}</td>
              </tr>
              <tr>
                <td>Blended Expected Return</td>
                <td><strong>{enrichedData.blended_return_pct}%</strong></td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: 13, color: "#888", marginTop: 8 }}>
            Blended return assumes stocks earn the historical market rate and bonds earn 3%.
          </p>
        </div>
      )}

      {/* ---- Risk Profile Comparison ---- */}
      {riskComparison && riskComparison.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <h3>Risk Profile Comparison</h3>
          <p style={{ color: "#666", fontSize: 14 }}>
            All three risk profiles for your time horizon, with the top 5 sectors by composite factor score.
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
            {["Conservative", "Moderate", "Aggressive"].map((profile) => {
              const data = comparisonByProfile[profile];
              if (!data) return null;
              const isSelected = profile === risk;
              return (
                <div
                  key={profile}
                  style={{
                    flex: "1 1 280px",
                    padding: 16,
                    border: isSelected ? "2px solid #264653" : "1px solid #dee2e6",
                    background: isSelected ? "#e8f4f8" : "#fff",
                  }}
                >
                  <h4 style={{ margin: "0 0 8px", color: PROFILE_COLORS[profile] }}>
                    {profile} {isSelected && "(Selected)"}
                  </h4>
                  <p style={{ margin: "4px 0" }}>
                    Stocks: {data.stock_percentage}% / Bonds: {data.bond_percentage}%
                  </p>
                  <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginTop: 8 }}>
                    <thead>
                      <tr style={{ background: "#f1f3f5" }}>
                        <th>Rank</th>
                        <th>Sector</th>
                        <th>Score</th>
                        <th>Companies</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sectors.map((s) => (
                        <tr key={s.sector_rank}>
                          <td>{s.sector_rank}</td>
                          <td>{s.sector}</td>
                          <td>{s.avg_composite_score}</td>
                          <td>{s.num_companies}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Glide Path Chart ---- */}
      {glideChartData.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <h3>Allocation Glide Path ({risk})</h3>
          <p style={{ color: "#666", fontSize: 14 }}>
            How your stock/bond split evolves as you approach retirement.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={glideChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="years"
                reversed
                label={{ value: "Years to Retirement", position: "insideBottom", offset: -5 }}
              />
              <YAxis
                domain={[0, 100]}
                label={{ value: "Allocation %", angle: -90, position: "insideLeft" }}
              />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              <Line
                type="monotone"
                dataKey="stocks"
                stroke="#1b4965"
                strokeWidth={2}
                name="Stocks %"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="bonds"
                stroke="#5fa8d3"
                strokeWidth={2}
                name="Bonds %"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default Allocation;
