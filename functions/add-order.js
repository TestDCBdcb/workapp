const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const crypto = require('crypto');

// Глобальные переменные для кэша авторизации
let doc = null;
let isInitialized = false;

async function initializeSheets() {
  if (isInitialized) return;

  try {
    console.log('Инициализация Google Sheets для добавления заказа...');
    
    const serviceAccountAuth = new JWT({
      email: process.env.CLIENT_EMAIL,
      key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    isInitialized = true;
    console.log('Google Sheets успешно инициализирован (add-order)');
  } catch (err) {
    console.error('Ошибка инициализации Google Sheets в add-order:', err.message, err.stack);
    throw err;
  }
}

// Валидация Telegram initData (та же, что в orders.js)
function validateInitData(initData, botToken) {
  const dataCheckString = Object.keys(initData)
    .filter(key => key !== 'hash')
    .sort()
    .map(key => `${key}=${initData[key]}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const hash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return hash === initData.hash;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Инициализация при первом вызове
    await initializeSheets();

    const body = JSON.parse(event.body || '{}');
    const { initData, data } = body;

    if (!initData || !data) {
      return { statusCode: 400, body: 'Missing initData or data' };
    }

    // Парсим initData
    const initDataObj = {};
    initData.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      initDataObj[key] = decodeURIComponent(value);
    });

    // Проверка подписи
    if (!validateInitData(initDataObj, process.env.BOT_TOKEN)) {
      return { statusCode: 403, body: 'Invalid initData signature' };
    }

    // Добавляем строку
    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow(data);

    console.log('Строка успешно добавлена:', data);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    console.error('Ошибка в add-order handler:', err.message, err.stack);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
