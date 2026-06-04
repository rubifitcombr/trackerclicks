require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const trackerRouter = require('./routes/tracker');
app.use('/', trackerRouter);

// Sobe o servidor apenas em ambiente local.
// No Vercel (serverless) o app é exportado diretamente.
if (require.main === module) {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`Vyria Click Tracker rodando na porta ${PORT}`);
  });
}

module.exports = app;
