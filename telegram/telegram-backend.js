// backend.js
const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

const TELEGRAM_BOT_TOKEN = '7762867200:AAEwXXL4yLDWOAEvqYc2ZBu7ffvWaPB5L_Q';
const CHAT_ID = '-4945344697';

app.use(bodyParser.json());

// Эндпоинт для получения логов
app.post('/log', (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'No message provided' });
  }

  sendTelegramMessage(message)
    .then(() => res.json({ status: 'ok' }))
    .catch(err => {
      console.error('Telegram send error:', err);
      res.status(500).json({ error: 'Failed to send message' });
    });
});

function sendTelegramMessage(text) {
  const message = encodeURIComponent(text);
  const url = `/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${message}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: url,
      method: 'GET',
    };

    const req = https.request(options, res => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error('Telegram API responded with status ' + res.statusCode));
      }
    });

    req.on('error', reject);
    req.end();
  });
}

app.listen(PORT, () => {
  console.log(`Log proxy server running at http://localhost:${PORT}`);
});
