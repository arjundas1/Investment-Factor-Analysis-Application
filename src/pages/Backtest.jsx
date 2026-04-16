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
  // ✅ Read weights ONCE from sessionStorage (static)
  const [weights] = useState(() => {
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

  // ✅ Fetch data once using fixed weights
  useEffect(() => {
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
  }, [weights]);

  return (
    <div style={{ width: "100%", height: 450 }}>
      <h2>Factor Backtest</h2>

      <p>
        This backtest simulates a portfolio constructed using top-ranked stocks
        based on composite factor scores. Returns are compounded annually.
      </p>

      <p>Market = equal-weight average of all stocks</p>

      {/* ✅ STATIC WEIGHTS DISPLAY */}
      <div style={{ marginBottom: 20 }}>
        <h4>Factor Weights Used</h4>
        <p>
          Value: {(weights.value * 100).toFixed(1)}% |{" "}
          Momentum: {(weights.momentum * 100).toFixed(1)}% |{" "}
          Profitability: {(weights.profitability * 100).toFixed(1)}% |{" "}
          Size: {(weights.size * 100).toFixed(1)}%
        </p>
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