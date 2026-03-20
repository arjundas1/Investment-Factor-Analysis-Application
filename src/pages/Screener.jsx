import { useState } from "react";

const mockStocks = [
  { ticker: "AAPL", marketCap: 2800, pe: 28, margin: 25 },
  { ticker: "MSFT", marketCap: 2500, pe: 30, margin: 32 },
  { ticker: "NVDA", marketCap: 1800, pe: 55, margin: 40 },
  { ticker: "JPM", marketCap: 450, pe: 12, margin: 22 },
  { ticker: "XOM", marketCap: 400, pe: 10, margin: 18 },
  { ticker: "SMALL1", marketCap: 15, pe: 8, margin: 12 },
  { ticker: "SMALL2", marketCap: 10, pe: 14, margin: 9 },
];

function Screener() {
  const [minCap, setMinCap] = useState(0);
  const [maxPE, setMaxPE] = useState(100);
  const [minMargin, setMinMargin] = useState(0);

  const filteredStocks = mockStocks.filter((stock) => {
    return (
      stock.marketCap >= minCap &&
      stock.pe <= maxPE &&
      stock.margin >= minMargin
    );
  });

  return (
    <div>
      <h2>Stock Screener</h2>
      <p>Filter stocks based on financial criteria.</p>

      <div style={{ marginBottom: "30px" }}>
        <div>
          <label>Minimum Market Cap (Billions): </label>
          <input
            type="number"
            value={minCap}
            onChange={(e) => setMinCap(Number(e.target.value))}
          />
        </div>

        <div>
          <label>Maximum P/E Ratio: </label>
          <input
            type="number"
            value={maxPE}
            onChange={(e) => setMaxPE(Number(e.target.value))}
          />
        </div>

        <div>
          <label>Minimum Profit Margin (%): </label>
          <input
            type="number"
            value={minMargin}
            onChange={(e) => setMinMargin(Number(e.target.value))}
          />
        </div>
      </div>

      <h3>Results</h3>

      <table border="1" cellPadding="8">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Market Cap (B)</th>
            <th>P/E</th>
            <th>Profit Margin (%)</th>
          </tr>
        </thead>
        <tbody>
          {filteredStocks.map((stock) => (
            <tr key={stock.ticker}>
              <td>{stock.ticker}</td>
              <td>{stock.marketCap}</td>
              <td>{stock.pe}</td>
              <td>{stock.margin}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {filteredStocks.length === 0 && (
        <p>No stocks match your criteria.</p>
      )}
    </div>
  );
}

export default Screener;
