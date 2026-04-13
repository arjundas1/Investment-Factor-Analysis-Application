import { useState } from "react";

const ALLOCATION_STORAGE_KEY = "cis5500_allocation";
const API_BASE = "http://localhost:8080";

const readSavedAllocation = () => {
  try {
    const raw = sessionStorage.getItem(ALLOCATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const getCurrentAge = (birthDateIso) => {
  if (!birthDateIso) return null;

  const today = new Date();
  const birthDate = new Date(birthDateIso);
  if (Number.isNaN(birthDate.getTime())) return null;

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
};

function Allocation() {
  const [initialState] = useState(() => {
    const saved = readSavedAllocation();

    const savedRisk =
      saved?.risk_profile === "Conservative" ||
      saved?.risk_profile === "Moderate" ||
      saved?.risk_profile === "Aggressive"
        ? saved.risk_profile
        : "";

    const savedResult =
      Number.isFinite(saved?.stock_percentage) &&
      Number.isFinite(saved?.bond_percentage) &&
      Number.isFinite(saved?.current_age) &&
      Number.isFinite(saved?.years_to_retirement)
        ? {
            stocks: Number(saved.stock_percentage).toFixed(1),
            bonds: Number(saved.bond_percentage).toFixed(1),
            current_age: saved.current_age,
            years_to_retirement: saved.years_to_retirement,
          }
        : null;

    return {
      dateOfBirth: saved?.date_of_birth || "",
      retirementAge: Number.isFinite(saved?.retirement_age)
        ? String(saved.retirement_age)
        : "",
      risk: savedRisk,
      result: savedResult,
    };
  });

  const [dateOfBirth, setDateOfBirth] = useState(initialState.dateOfBirth);
  const [retirementAge, setRetirementAge] = useState(initialState.retirementAge);
  const [risk, setRisk] = useState(initialState.risk);
  const [result, setResult] = useState(initialState.result);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const calculateAllocation = async () => {
    setError("");

    const currentAge = getCurrentAge(dateOfBirth);
    if (currentAge === null || currentAge < 0) {
      setResult(null);
      setError("Please enter a valid date of birth.");
      return;
    }

    const parsedRetirementAge = Number(retirementAge);
    if (!Number.isFinite(parsedRetirementAge) || parsedRetirementAge <= currentAge) {
      setResult(null);
      setError("Retirement age must be greater than your current age.");
      return;
    }

    if (!risk) {
      setResult(null);
      setError("Please select a risk tolerance.");
      return;
    }

    const yearsToRetirement = parsedRetirementAge - currentAge;
    setLoading(true);

    try {
      const params = new URLSearchParams({
        years_to_retirement: String(yearsToRetirement),
        risk_profile: risk,
      });

      const response = await fetch(`${API_BASE}/asset-allocation?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Allocation lookup failed: ${response.status}`);
      }

      const allocation = await response.json();

      const calculated = {
        stocks: Number(allocation.stock_percentage).toFixed(1),
        bonds: Number(allocation.bond_percentage).toFixed(1),
        current_age: currentAge,
        years_to_retirement: yearsToRetirement,
      };

      setResult(calculated);

      sessionStorage.setItem(
        ALLOCATION_STORAGE_KEY,
        JSON.stringify({
          date_of_birth: dateOfBirth,
          current_age: currentAge,
          retirement_age: parsedRetirementAge,
          years_to_retirement: yearsToRetirement,
          risk_profile: risk,
          stock_percentage: Number(calculated.stocks),
          bond_percentage: Number(calculated.bonds),
        })
      );
    } catch (err) {
      setResult(null);
      setError(err.message || "Failed to load allocation from database");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Retirement Allocation Calculator</h2>

      <div>
        <label>Date of Birth:</label>
        <input
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
      </div>

      <div style={{ marginTop: "20px" }}>
        <label>Desired Retirement Age:</label>
        <input
          type="number"
          min="1"
          value={retirementAge}
          onChange={(e) => setRetirementAge(e.target.value)}
        />
      </div>

      <div style={{ marginTop: "20px" }}>
        <label>Risk Tolerance:</label>
        <select value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="">Select risk profile</option>
          <option>Conservative</option>
          <option>Moderate</option>
          <option>Aggressive</option>
        </select>
      </div>

      <button
        style={{ marginTop: "20px" }}
        onClick={calculateAllocation}
        disabled={loading}
      >
        {loading ? "Calculating..." : "Calculate Allocation"}
      </button>

      {error && (
        <p style={{ marginTop: "16px", color: "crimson" }}>{error}</p>
      )}

      {result && (
        <div style={{ marginTop: "30px" }}>
          <h3>Recommended Allocation</h3>
          <p>Current Age: {result.current_age}</p>
          <p>Years to Retirement: {result.years_to_retirement}</p>
          <p>Stocks: {result.stocks}%</p>
          <p>Bonds: {result.bonds}%</p>
          <p>Saved for Portfolio screen.</p>
        </div>
      )}
    </div>
  );
}

export default Allocation;
