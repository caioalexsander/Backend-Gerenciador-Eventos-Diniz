const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ====================== IMPORTS ======================
const contratosRoutes = require('./routes/contratos.routes');

// ====================== MIDDLEWARES E ROTAS ======================
app.use('/', contratosRoutes);

// ====================== HEALTH CHECK ======================
app.get('/', (req, res) => {
  res.json({ status: 'Backend Gerenciador de Eventos Diniz - OK ✅' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

module.exports = app; // útil para testes