import { useState } from "react";
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

// Mock cumulative return data
const mockData = [
  { year: "2015", value: 100, momentum: 100, profitability: 100, size: 100, market: 100 },
  { year: "2016", value: 110, momentum: 115, profitability: 108, size: 105, market: 112 },
  { year: "2017", value: 125, momentum: 140, profitability: 120, size: 115, market: 135 },
  { year: "2018", value: 118, momentum: 130, profitability: 125, size: 108, market: 128 },
  { year: "2019", value: 140, momentum: 170, profitability: 150, size: 130, market: 160 },
  { year: "2020", value: 155, momentum: 210, profitability: 165, size: 145, market: 185 },
  { year: "2021", value: 170, momentum: 250, profitability: 185, size: 160, market: 210 },
  { year: "2022", value: 160, momentum: 220, profitability: 190, size: 150, market: 195 },
  { year: "2023", value: 185, momentum: 260, profitability: 215, size: 175, market: 230 },
];

function Backtest() {
  const [selectedFactor, setSelectedFactor] = useState("value");

  return (
    <div>
      <h2>Factor Strategy Backtest</h2>
      <p>Compare historical cumulative returns of factor strategies.</p>

      <div style={{ marginBottom: "20px" }}>
        <label>Select Factor Strategy: </label>
        <select
          value={selectedFactor}
          onChange={(e) => setSelectedFactor(e.target.value)}
        >
          <option value="value">Value</option>
          <option value="momentum">Momentum</option>
          <option value="profitability">Profitability</option>
          <option value="size">Size</option>
        </select>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={mockData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey={selectedFactor}
            stroke="#8884d8"
            strokeWidth={3}
            name="Selected Factor"
          />
          <Line
            type="monotone"
            dataKey="market"
            stroke="#82ca9d"
            strokeWidth={2}
            name="Market (S&P 500)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default Backtest;
