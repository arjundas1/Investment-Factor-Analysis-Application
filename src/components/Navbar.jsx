import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav style={{ padding: "20px", background: "#111", color: "white" }}>
      <Link to="/" style={linkStyle}>Allocation</Link>
      <Link to="/factors" style={linkStyle}>Factors</Link>
      <Link to="/screener" style={linkStyle}>Screener</Link>
      <Link to="/backtest" style={linkStyle}>Backtest</Link>
      <Link to="/portfolio" style={linkStyle}>Portfolio</Link>
    </nav>
  );
}

const linkStyle = {
  marginRight: "20px",
  color: "white",
  textDecoration: "none"
};

export default Navbar;
