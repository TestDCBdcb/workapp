const { GoogleSpreadsheet } = require('google-spreadsheet');
const crypto = require('crypto');

// Глобальная авторизация (один раз)
const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
(async () => {
  try {
    await doc.useServiceAccountAuth({
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
    await doc.loadInfo();
    console.log('Sheets авторизация OK');
  } catch (err) {
    console.error('Sheets auth error:', err.message);
  }
})();

// Функция валидации initData (стандарт от Telegram)
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
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { initData } = body;

    if (!initData) {
      return { statusCode: 400, body: 'No initData' };
    }

    // Разбираем initData в объект
    const initDataObj = {};
    initData.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      initDataObj[key] = decodeURIComponent(value);
    });

    if (!validateInitData(initDataObj, process.env.BOT_TOKEN)) {
      return { statusCode: 403, body: 'Invalid initData' };
    }

    // Всё ок — читаем таблицу
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    const orders = rows.map(row => ({
      Магазин: row['Магазин'] || '',
      'Номер заказа': row['Номер заказа'] || '',
      'Дата заказа': row['Дата заказа'] || '',
      Позиция: row['Позиция'] || '',
      Сумма: row['Сумма'] || '',
      Покупатель: row['Покупатель'] || '',
      Прибыль: row['Прибыль'] || ''
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ orders })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Server error' };
  }
};
