import { useState } from "react";

// Mock stock factor scores
const stockUniverse = [
  { ticker: "AAPL", value: 3, momentum: 5, profitability: 5, size: 1 },
  { ticker: "MSFT", value: 2, momentum: 4, profitability: 5, size: 1 },
  { ticker: "NVDA", value: 1, momentum: 5, profitability: 4, size: 1 },
  { ticker: "JPM", value: 5, momentum: 3, profitability: 4, size: 2 },
  { ticker: "XOM", value: 5, momentum: 2, profitability: 3, size: 2 },
  { ticker: "SMALL1", value: 4, momentum: 3, profitability: 3, size: 5 },
  { ticker: "SMALL2", value: 4, momentum: 4, profitability: 2, size: 5 },
  { ticker: "MID1", value: 3, momentum: 3, profitability: 4, size: 3 },
  { ticker: "MID2", value: 2, momentum: 4, profitability: 3, size: 3 },
  { ticker: "BIG1", value: 1, momentum: 2, profitability: 5, size: 1 },
];

function Portfolio() {
  const [weights, setWeights] = useState({
    value: 1,
    momentum: 1,
    profitability: 1,
    size: 1,
  });

  const [portfolio, setPortfolio] = useState([]);

  const generatePortfolio = () => {
    const scored = stockUniverse.map((stock) => {
      const score =
        stock.value * weights.value +
        stock.momentum * weights.momentum +
        stock.profitability * weights.profitability +
        stock.size * weights.size;

      return { ...stock, score };
    });

    // Sort descending
    scored.sort((a, b) => b.score - a.score);

    // Select top 5 (expand to 20 later with real dataset)
    const selected = scored.slice(0, 5);

    const totalScore = selected.reduce((sum, s) => sum + s.score, 0);

    const weightedPortfolio = selected.map((stock) => ({
      ticker: stock.ticker,
      weight: ((stock.score / totalScore) * 100).toFixed(2),
    }));

    setPortfolio(weightedPortfolio);
  };

  return (
    <div>
      <h2>Portfolio Generator</h2>
      <p>Adjust factor weights and generate your portfolio.</p>

      {Object.keys(weights).map((factor) => (
        <div key={factor}>
          <label>{factor.toUpperCase()} Weight: </label>
          <input
            type="number"
            min="0"
            max="5"
            value={weights[factor]}
            onChange={(e) =>
              setWeights({
                ...weights,
                [factor]: Number(e.target.value),
              })
            }
          />
        </div>
      ))}

      <button
        style={{ marginTop: "20px" }}
        onClick={generatePortfolio}
      >
        Generate Portfolio
      </button>

      {portfolio.length > 0 && (
        <div style={{ marginTop: "30px" }}>
          <h3>Recommended Portfolio</h3>
          <table border="1" cellPadding="8">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Weight (%)</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.map((stock) => (
                <tr key={stock.ticker}>
                  <td>{stock.ticker}</td>
                  <td>{stock.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Portfolio;
