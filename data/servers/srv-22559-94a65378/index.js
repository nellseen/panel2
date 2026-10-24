const express = require('express');
const app = express();
const PORT = process.env.PORT || 3400;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    app: 'Live Production Test',
    environment: process.env.NODE_ENV || 'development',
    time: new Date().toISOString()
  });
});

app.get('/api/ping', (req, res) => {
  res.json({ pong: true, timestamp: Date.now() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('[Live Production Test] Express Server listening on http://0.0.0.0:' + PORT);
});
