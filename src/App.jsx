import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Allocation from "./pages/Allocation";
import Factors from "./pages/Factors";
import Screener from "./pages/Screener";
import Backtest from "./pages/Backtest";
import Portfolio from "./pages/Portfolio";

function App() {
  return (
    <>
      <Navbar />
      <div style={{ padding: "40px" }}>
        <Routes>
          <Route path="/" element={<Factors />} />

          <Route path="/allocation" element={<Allocation />} />
          <Route path="/factors" element={<Factors />} />
          <Route path="/screener" element={<Screener />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/portfolio" element={<Portfolio />} />
        </Routes>
      </div>
    </>
  );
}

export default App;