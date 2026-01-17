const { GoogleSpreadsheet } = require('google-spreadsheet');
const crypto = require('crypto');

// Глобальная авторизация один раз при запуске функции
const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);

(async () => {
  try {
    await doc.useServiceAccountAuth({
      client_email: process.env.CLIENT_EMAIL,
      private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
    await doc.loadInfo();
    console.log('Google Sheets успешно авторизован');
  } catch (err) {
    console.error('Ошибка авторизации Google Sheets:', err.message);
  }
})();

// Функция проверки initData от Telegram
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
    const body = JSON.parse(event.body || '{}');
    const { initData } = body;

    if (!initData) {
      return { statusCode: 400, body: 'Missing initData' };
    }

    // Парсим initData в объект
    const initDataObj = {};
    initData.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      initDataObj[key] = decodeURIComponent(value);
    });

    // Проверяем подпись
    if (!validateInitData(initDataObj, process.env.BOT_TOKEN)) {
      return { statusCode: 403, body: 'Invalid initData signature' };
    }

    // Читаем все заказы
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders })
    };
  } catch (err) {
    console.error('Ошибка в функции orders:', err);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};
