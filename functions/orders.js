const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const crypto = require('crypto');

// Глобальные переменные для кэша авторизации
let doc = null;
let isInitialized = false;

async function initializeSheets() {
  if (isInitialized) return;

  try {
    console.log('Инициализация Google Sheets...');
    const serviceAccountAuth = new JWT({
      email: process.env.CLIENT_EMAIL,
      key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    isInitialized = true;
    console.log('Google Sheets успешно инициализирован');
  } catch (err) {
    console.error('Ошибка инициализации Google Sheets:', err.message, err.stack);
    throw err; // чтобы увидеть в логах
  }
}

// Валидация Telegram initData (без изменений)
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
    const { initData } = body;

    if (!initData) {
      return { statusCode: 400, body: 'Missing initData' };
    }

    const initDataObj = {};
    initData.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      initDataObj[key] = decodeURIComponent(value);
    });

    if (!validateInitData(initDataObj, process.env.BOT_TOKEN)) {
      return { statusCode: 403, body: 'Invalid initData signature' };
    }

    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    const orders = rows.map(row => ({
      Магазин: row.get('Магазин') || '',
      'Номер заказа': row.get('Номер заказа') || '',
      'Дата заказа': row.get('Дата заказа') || '',
      Позиция: row.get('Позиция') || '',
      Сумма: row.get('Сумма') || '',
      Покупатель: row.get('Покупатель') || '',
      Прибыль: row.get('Прибыль') || ''
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders })
    };
  } catch (err) {
    console.error('Ошибка в handler:', err.message, err.stack);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
