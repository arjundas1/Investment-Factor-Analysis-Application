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

app.listen(config.server_port, () => {
  console.log(`Server running at http://${config.server_host}:${config.server_port}/`);
});