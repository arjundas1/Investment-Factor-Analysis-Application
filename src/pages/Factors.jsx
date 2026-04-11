import { useMemo, useState } from "react";

const FACTORS_STORAGE_KEY = "cis5500_factors";

const readSavedFactors = () => {
  try {
    const raw = sessionStorage.getItem(FACTORS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

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
  const [weights, setWeights] = useState(() => {
    const saved = readSavedFactors();
    const savedRaw = saved?.raw_weights;

    if (
      savedRaw &&
      Number.isFinite(savedRaw.Value) &&
      Number.isFinite(savedRaw.Momentum) &&
      Number.isFinite(savedRaw.Profitability) &&
      Number.isFinite(savedRaw.Size)
    ) {
      return {
        Value: Number(savedRaw.Value),
        Momentum: Number(savedRaw.Momentum),
        Profitability: Number(savedRaw.Profitability),
        Size: Number(savedRaw.Size),
      };
    }

    return {
      Value: 1,
      Momentum: 1,
      Profitability: 1,
      Size: 1,
    };
  });

  const handleChange = (factor, value) => {
    const nextWeights = {
      ...weights,
      [factor]: Number(value),
    };

    setWeights(nextWeights);

    const nextTotalWeight = Object.values(nextWeights).reduce(
      (sum, w) => sum + w,
      0
    );

    const normalized = {
      value:
        nextTotalWeight > 0
          ? Number((nextWeights.Value / nextTotalWeight).toFixed(4))
          : 0,
      profitability:
        nextTotalWeight > 0
          ? Number((nextWeights.Profitability / nextTotalWeight).toFixed(4))
          : 0,
      momentum:
        nextTotalWeight > 0
          ? Number((nextWeights.Momentum / nextTotalWeight).toFixed(4))
          : 0,
      size:
        nextTotalWeight > 0
          ? Number((nextWeights.Size / nextTotalWeight).toFixed(4))
          : 0,
    };

    sessionStorage.setItem(
      FACTORS_STORAGE_KEY,
      JSON.stringify({
        raw_weights: nextWeights,
        normalized_weights: normalized,
      })
    );
  };

  const totalWeight = Object.values(weights).reduce(
    (sum, w) => sum + w,
    0
  );

  const normalizedWeights = useMemo(
    () =>
      Object.entries(weights).map(([factor, value]) => ({
        factor,
        weight:
          totalWeight > 0
            ? ((value / totalWeight) * 100).toFixed(1)
            : 0,
      })),
    [weights, totalWeight]
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
