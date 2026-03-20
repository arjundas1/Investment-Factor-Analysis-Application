import { useState } from "react";

const factorList = [
  {
    name: "Value",
    description:
      "Focus on undervalued companies (low P/E, low P/B ratios).",
  },
  {
    name: "Momentum",
    description:
      "Focus on stocks with strong recent price performance.",
  },
  {
    name: "Profitability",
    description:
      "Focus on companies with strong earnings and margins.",
  },
  {
    name: "Size",
    description:
      "Focus on smaller companies (small-cap premium).",
  },
];

function Factors() {
  const [weights, setWeights] = useState({
    Value: 1,
    Momentum: 1,
    Profitability: 1,
    Size: 1,
  });

  const handleChange = (factor, value) => {
    setWeights({
      ...weights,
      [factor]: Number(value),
    });
  };

  const totalWeight = Object.values(weights).reduce(
    (sum, w) => sum + w,
    0
  );

  const normalizedWeights = Object.entries(weights).map(
    ([factor, value]) => ({
      factor,
      weight:
        totalWeight > 0
          ? ((value / totalWeight) * 100).toFixed(1)
          : 0,
    })
  );

  return (
    <div>
      <h2>Factor Explorer</h2>
      <p>
        Adjust the importance of each investment factor to
        match your strategy.
      </p>

      {factorList.map((factor) => (
        <div
          key={factor.name}
          style={{
            marginBottom: "30px",
            padding: "20px",
            border: "1px solid #ccc",
          }}
        >
          <h3>{factor.name}</h3>
          <p>{factor.description}</p>

          <input
            type="range"
            min="0"
            max="5"
            value={weights[factor.name]}
            onChange={(e) =>
              handleChange(factor.name, e.target.value)
            }
          />

          <p>Importance: {weights[factor.name]}</p>
        </div>
      ))}

      <div style={{ marginTop: "40px" }}>
        <h3>Factor Allocation (Normalized)</h3>
        {normalizedWeights.map((f) => (
          <p key={f.factor}>
            {f.factor}: {f.weight}%
          </p>
        ))}
      </div>
    </div>
  );
}

export default Factors;
