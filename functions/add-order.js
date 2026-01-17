const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const crypto = require('crypto');

// Кэш авторизации
let doc = null;

async function getDoc() {
  if (doc) return doc;

  try {
    const auth = new JWT({
      email: process.env.CLIENT_EMAIL,
      key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, auth);
    await doc.loadInfo();
    console.log('Google Sheets инициализирован');
    return doc;
  } catch (err) {
    console.error('Ошибка инициализации doc:', err.message);
    throw err;
  }
}

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
    const sheet = (await getDoc()).sheetsByIndex[0];

    const body = JSON.parse(event.body || '{}');
    const { initData, rows } = body;

    if (!initData || !rows || !Array.isArray(rows) || rows.length === 0) {
      return { statusCode: 400, body: 'Missing initData or rows array' };
    }

    // Валидация Telegram initData
    const initDataObj = {};
    initData.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      initDataObj[key] = decodeURIComponent(value);
    });

    if (!validateInitData(initDataObj, process.env.BOT_TOKEN)) {
      return { statusCode: 403, body: 'Invalid initData signature' };
    }

    // Просто добавляем строки пачкой — без insertDimension
    await sheet.addRows(rows);

    console.log(`Успешно добавлено ${rows.length} строк (простой метод)`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, count: rows.length })
    };
  } catch (err) {
    console.error('Ошибка add-order:', err.message, err.stack);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
