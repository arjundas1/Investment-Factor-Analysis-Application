import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const API_BASE = "http://localhost:8080";

function Navbar() {
  const [query, setQuery] = useState("");
  const [validTickers, setValidTickers] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [results, setResults] = useState([]);
  const [label, setLabel] = useState("");
  const [popupOpen, setPopupOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPopupOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const loadTickers = async () => {
      try {
        const response = await fetch(`${API_BASE}/tickers`);
        if (!response.ok) return;

        const data = await response.json();
        if (!Array.isArray(data)) return;

        const tickerSet = new Set(
          data
            .map((row) => String(row.ticker || "").trim().toUpperCase())
            .filter(Boolean)
        );
        setValidTickers(tickerSet);
      } catch {
        // If the ticker lookup fails, keep the input disabled from autocomplete only.
      }
    };

    loadTickers();
  }, []);

  const runSearch = async (event) => {
    event.preventDefault();

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setError("Enter a ticker first.");
      setPopupOpen(true);
      return;
    }

    const normalizedTicker = trimmedQuery.toUpperCase();
    if (!validTickers.has(normalizedTicker)) {
      const suggestions = Array.from(validTickers)
        .filter((ticker) => ticker.startsWith(normalizedTicker) || normalizedTicker.startsWith(ticker))
        .slice(0, 5);
      const suggestionMessage = suggestions.length > 0
        ? ` Did you mean: ${suggestions.join(", ")}?`
        : "";
      setError(`That ticker is not in the companies database.${suggestionMessage}`);
      setPopupOpen(true);
      return;
    }

    setPopupOpen(true);
    setLoading(true);
    setError("");
    setSummary("");
    setResults([]);
    setLabel(normalizedTicker);

    try {
      const response = await fetch(`${API_BASE}/search/web?q=${encodeURIComponent(normalizedTicker)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `Search failed with status ${response.status}`);
      }

      setSummary(data?.summary || "");
      setResults(Array.isArray(data?.results) ? data.results : []);
    } catch (err) {
      setError(err.message || "Failed to fetch Gemini results");
    } finally {
      setLoading(false);
    }
  };

  return (
    <nav
      style={{
        padding: "16px 20px",
        background: "#111",
        color: "white",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        <Link to="/" style={linkStyle}>Allocation</Link>
        <Link to="/factors" style={linkStyle}>Factors</Link>
        <Link to="/screener" style={linkStyle}>Screener</Link>
        <Link to="/backtest" style={linkStyle}>Backtest</Link>
        <Link to="/portfolio" style={linkStyle}>Portfolio</Link>
      </div>

      <form onSubmit={runSearch} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          placeholder="Enter ticker (e.g. AAPL)"
          aria-label="Search ticker"
          list="ticker-options"
          style={{
            width: 240,
            maxWidth: "42vw",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #444",
            outline: "none",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid #444",
            background: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          Search
        </button>
        <datalist id="ticker-options">
          {Array.from(validTickers).slice(0, 500).map((ticker) => (
            <option key={ticker} value={ticker} />
          ))}
        </datalist>
      </form>

      {popupOpen && (
        <div
          onClick={() => setPopupOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 2000,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(900px, 95vw)",
              maxHeight: "85vh",
              overflowY: "auto",
              backgroundColor: "#fff",
              color: "#111",
              borderRadius: 10,
              border: "1px solid #ddd",
              padding: 16,
              boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{label || "Web Results"}</strong>
              <button onClick={() => setPopupOpen(false)}>Close</button>
            </div>
            {loading && <p style={{ marginTop: 8 }}>Searching web...</p>}
            {error && <p style={{ marginTop: 8, color: "crimson" }}>{error}</p>}
            {!loading && !error && summary && (
              <p style={{ marginTop: 8, marginBottom: 10, lineHeight: 1.45 }}>{summary}</p>
            )}
            {!loading && !error && label && results.length === 0 && (
              <p style={{ marginTop: 8 }}>No results found.</p>
            )}
            {!loading && !error && results.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 13, marginBottom: 0 }}>
                  <strong>Sources:</strong>{" "}
                  {results.map((row, index) => (
                    <span key={row.url}>
                      <a href={row.url} target="_blank" rel="noreferrer">
                        {row.name}
                      </a>
                      {index < results.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

const linkStyle = {
  marginRight: "20px",
  color: "white",
  textDecoration: "none"
};

export default Navbar;
