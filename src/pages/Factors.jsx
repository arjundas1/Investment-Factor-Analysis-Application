import { useMemo, useState } from "react";

const FACTORS_STORAGE_KEY = "cis5500_factors";
const FACTOR_ORDER = ["Value", "Momentum", "Profitability", "Size"];

const normalizeWeightsToOneDecimal = (rawWeights) => {
  const totalWeight = FACTOR_ORDER.reduce(
    (sum, factor) => sum + Number(rawWeights[factor] ?? 0),
    0
  );

  if (totalWeight <= 0) {
    return {
      percentageByFactor: {
        Value: 25.0,
        Momentum: 25.0,
        Profitability: 25.0,
        Size: 25.0,
      },
      normalizedWeights: {
        value: 0.25,
        momentum: 0.25,
        profitability: 0.25,
        size: 0.25,
      },
    };
  }

  const percentageByFactor = {
    Value: 0,
    Momentum: 0,
    Profitability: 0,
    Size: 0,
  };

  const firstThree = FACTOR_ORDER.slice(0, 3);
  const lastFactor = FACTOR_ORDER[3];

  firstThree.forEach((factor) => {
    const rawPct = (Number(rawWeights[factor]) / totalWeight) * 100;
    percentageByFactor[factor] = Number(rawPct.toFixed(1));
  });

  const sumFirstThree = firstThree.reduce(
    (sum, factor) => sum + percentageByFactor[factor],
    0
  );

  let lastFactorPct = Number((100 - sumFirstThree).toFixed(1));

  if (lastFactorPct < 0 || lastFactorPct > 100) {
    const clampedLastFactorPct = Math.min(100, Math.max(0, lastFactorPct));
    const adjustment = Number((lastFactorPct - clampedLastFactorPct).toFixed(1));
    const largestFirstThreeFactor = firstThree.reduce((largest, factor) =>
      percentageByFactor[factor] > percentageByFactor[largest] ? factor : largest
    , firstThree[0]);

    percentageByFactor[largestFirstThreeFactor] = Number(
      (percentageByFactor[largestFirstThreeFactor] + adjustment).toFixed(1)
    );

    lastFactorPct = clampedLastFactorPct;
  }

  percentageByFactor[lastFactor] = lastFactorPct;

  return {
    percentageByFactor,
    normalizedWeights: {
      value: Number((percentageByFactor.Value / 100).toFixed(4)),
      momentum: Number((percentageByFactor.Momentum / 100).toFixed(4)),
      profitability: Number((percentageByFactor.Profitability / 100).toFixed(4)),
      size: Number((percentageByFactor.Size / 100).toFixed(4)),
    },
  };
};

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

    const normalized = normalizeWeightsToOneDecimal(nextWeights).normalizedWeights;

    sessionStorage.setItem(
      FACTORS_STORAGE_KEY,
      JSON.stringify({
        raw_weights: nextWeights,
        normalized_weights: normalized,
      })
    );
  };

  const normalizedWeights = useMemo(() => {
    const percentageByFactor = normalizeWeightsToOneDecimal(weights).percentageByFactor;

    return FACTOR_ORDER.map((factor) => ({
      factor,
      weight: percentageByFactor[factor].toFixed(1),
    }));
  }, [weights]);

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
