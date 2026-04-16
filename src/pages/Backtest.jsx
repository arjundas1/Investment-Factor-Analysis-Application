import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

function Backtest() {
  // ✅ Initialize weights directly (NO useEffect needed)
  const [weights, setWeights] = useState(() => {
    const saved = sessionStorage.getItem("cis5500_factors");

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.normalized_weights) {
          return parsed.normalized_weights;
        }
      } catch {}
    }

    // fallback
    return {
      value: 0.25,
      momentum: 0.25,
      profitability: 0.25,
      size: 0.25,
    };
  });

  const [data, setData] = useState([]);

  // Fetch backtest data
  useEffect(() => {
    const timeout = setTimeout(() => {
      fetch(
        `http://localhost:8080/factors/performance?` +
          `value=${weights.value}&` +
          `momentum=${weights.momentum}&` +
          `profitability=${weights.profitability}&` +
          `size=${weights.size}`
      )
        .then((res) => res.json())
        .then((resJson) => {
          let factorCum = 1;
          let marketCum = 1;

          const formatted = resJson.map((d) => {
            factorCum *= 1 + Number(d.factor_return);
            marketCum *= 1 + Number(d.market_return);

            return {
              year: d.year,
              factor: (factorCum - 1) * 100,
              market: (marketCum - 1) * 100,
            };
          });

          setData(formatted);
        })
        .catch(() => setData([]));
    }, 400); // debounce

    return () => clearTimeout(timeout);
  }, [weights]);

  return (
    <div style={{ width: "100%", height: 450 }}>
      <h2>Factor Backtest</h2>
      <p>
      This backtest simulates a portfolio constructed using top-ranked stocks based on composite factor scores.
      Each year, top-ranked stocks are selected and returns are compounded.
      </p>
      <p>Market = equal-weight average of all stocks</p>
      <div style={{ marginBottom: 20 }}>
  <h4>Adjust Factor Weights</h4>

  {["value", "momentum", "profitability", "size"].map((factor) => (
    <div key={factor}>
      <label>
        {factor}: {(weights[factor] * 100).toFixed(0)}%
      </label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={weights[factor]}
        onChange={(e) => {
          const newWeights = {
            ...weights,
            [factor]: parseFloat(e.target.value),
          };

          setWeights(newWeights);

          sessionStorage.setItem(
            "cis5500_factors",
            JSON.stringify({
              normalized_weights: newWeights,
            })
          );
        }}
        style={{ width: "300px", marginLeft: "10px" }}
      />
    </div>
  ))}
</div>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" />
          <YAxis
            label={{
              value: "Cumulative Return (%)",
              angle: -90,
              position: "insideLeft",
            }}
          />
          <Tooltip formatter={(value) => value.toFixed(2) + "%"} />
          <Legend />
          <Line type="monotone" dataKey="factor" name="Factor Strategy" />
          <Line type="monotone" dataKey="market" name="Market" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default Backtest;