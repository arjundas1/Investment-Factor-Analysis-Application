import { useState } from "react";

function Allocation() {
  const [years, setYears] = useState(60);
  const [risk, setRisk] = useState("Medium");
  const [result, setResult] = useState(null);

  const calculateAllocation = () => {
    let stockWeight;

    if (risk === "High") {
      stockWeight = Math.min(90, 100 - years * 0.5);
    } else if (risk === "Medium") {
      stockWeight = Math.min(75, 100 - years * 0.7);
    } else {
      stockWeight = Math.min(60, 100 - years);
    }

    const bondWeight = 100 - stockWeight;

    setResult({
      stocks: stockWeight.toFixed(1),
      bonds: bondWeight.toFixed(1),
    });
  };

  return (
    <div>
      <h2>Retirement Allocation Calculator</h2>

      <div>
        <label>Years to Retirement:</label>
        <input
          type="number"
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
        />
      </div>

      <div style={{ marginTop: "20px" }}>
        <label>Risk Tolerance:</label>
        <select value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>
      </div>

      <button
        style={{ marginTop: "20px" }}
        onClick={calculateAllocation}
      >
        Calculate Allocation
      </button>

      {result && (
        <div style={{ marginTop: "30px" }}>
          <h3>Recommended Allocation</h3>
          <p>Stocks: {result.stocks}%</p>
          <p>Bonds: {result.bonds}%</p>
        </div>
      )}
    </div>
  );
}

export default Allocation;
