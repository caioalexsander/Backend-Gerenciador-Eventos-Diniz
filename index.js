require('dotenv').config();

const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('API ONLINE');
});

app.get('/teste', (req, res) => {
  console.log('🔥 TESTE');
  res.send('OK');
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
});