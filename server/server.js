const express = require('express');
const cors = require('cors');
const config = require('./config.json');
const routes = require('./routes');
const app = express(); 

app.use(cors({ origin: '*'}));
app.get('/sectors', routes.sectors);
app.get('/industries', routes.industries);
app.get('/asset-allocation', routes.asset_allocation);
app.get('/screener/ranked', routes.screener_ranked);
app.get('/allocation/enriched',        routes.allocation_enriched);
app.get('/allocation/glide_path',      routes.allocation_glide_path);
app.get('/allocation/risk_comparison', routes.allocation_risk_comparison);
app.get('/screener/diversification',   routes.screener_diversification);
app.get('/search/web',                 routes.web_search);

app.listen(config.server_port, () => {
  console.log(`Server running at http://${config.server_host}:${config.server_port}/`);
});