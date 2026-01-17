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
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[0];

    const body = JSON.parse(event.body || '{}');
    const { initData } = body;

    if (!initData) {
      return { statusCode: 400, body: 'Missing initData' };
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

    // Получаем все строки из таблицы
    const rows = await sheet.getRows();
    
    // Инициализируем суммы
    let inTransitPaid = 0;     // В пути (только оплаченные)
    let inPvzPaid = 0;         // ПВЗ (только оплаченные)
    let receivedTotal = 0;     // Получен (любая оплата)
    let sentTotal = 0;         // Отправлен (любая оплата)
    let marketWarehouseTotal = 0; // На складе Маркета (любая оплата)
    let totalAmount = 0;       // Общая сумма

    // Проходим по всем строкам и анализируем
    rows.forEach(row => {
      const status = (row.get('Статус') || '').toLowerCase().trim();
      const payment = (row.get('Оплата') || '').toLowerCase().trim();
      const sum = parseFloat(row.get('Сумма') || 0) || 0;

      // Проверяем условия по вашим правилам:
      
      // 1. В пути (только если оплачен)
      if (status.includes('в пути') && payment.includes('оплачен')) {
        inTransitPaid += sum;
        totalAmount += sum;
      }
      
      // 2. ПВЗ (только если оплачен)
      if (status.includes('пвз') && payment.includes('оплачен')) {
        inPvzPaid += sum;
        totalAmount += sum;
      }
      
      // 3. Получен (любая оплата)
      if (status.includes('получен')) {
        receivedTotal += sum;
        totalAmount += sum;
      }
      
      // 4. Отправлен (любая оплата)
      if (status.includes('отправлен')) {
        sentTotal += sum;
        totalAmount += sum;
      }
      
      // 5. На складе Маркета (любая оплата)
      if (status.includes('на складе маркета')) {
        marketWarehouseTotal += sum;
        totalAmount += sum;
      }
    });

    // Форматируем суммы
    const formatSum = (sum) => {
      return sum.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };

    console.log('Аналитика рассчитана:', {
      inTransitPaid: formatSum(inTransitPaid),
      inPvzPaid: formatSum(inPvzPaid),
      receivedTotal: formatSum(receivedTotal),
      sentTotal: formatSum(sentTotal),
      marketWarehouseTotal: formatSum(marketWarehouseTotal),
      totalAmount: formatSum(totalAmount)
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inTransitPaid: formatSum(inTransitPaid),
        inPvzPaid: formatSum(inPvzPaid),
        receivedTotal: formatSum(receivedTotal),
        sentTotal: formatSum(sentTotal),
        marketWarehouseTotal: formatSum(marketWarehouseTotal),
        totalAmount: formatSum(totalAmount)
      })
    };
  } catch (err) {
    console.error('Ошибка в analytics:', err.message, err.stack);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
