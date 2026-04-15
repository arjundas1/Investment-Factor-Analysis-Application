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
  const [data, setData] = useState([]);
  const [selectedFactor, setSelectedFactor] = useState("value");

  useEffect(() => {
    fetch(`http://localhost:8080/factors/performance?factor=${selectedFactor}`)
      .then(res => res.json())
      .then(resJson => {
        let factorCum = 1;
        let marketCum = 1;

        const formatted = resJson.map(d => {
          factorCum *= (1 + Number(d.factor_return));
          marketCum *= (1 + Number(d.market_return));

          return {
            year: d.year,
            factor: (factorCum - 1) * 100,
            market: (marketCum - 1) * 100,
          };
        });
        setData(formatted);
      });
  }, [selectedFactor]);

  return (
    <div style={{ width: "100%", height: 400 }}>
      <h2>Factor Backtest</h2>

      <select onChange={(e) => setSelectedFactor(e.target.value)}>
        <option value="value">Value</option>
        <option value="momentum">Momentum</option>
        <option value="profitability">Profitability</option>
        <option value="size">Size</option>
      </select>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" />
          <YAxis label={{ value: "Cumulative Return (%)", angle: -90 }} />
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