const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const crypto = require('crypto');

// Кэш авторизации
let doc = null;

async function getDoc() {
  if (doc) return doc;

  const auth = new JWT({
    email: process.env.CLIENT_EMAIL,
    key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, auth);
  await doc.loadInfo();
  console.log('Google Sheets инициализирован');
  return doc;
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

    const currentRowCount = sheet.rowCount; // общее количество строк (включая заголовок)

    if (currentRowCount <= 1) {
      // Таблица пустая или только заголовок — просто добавляем строки
      await sheet.addRows(rows);
    } else {
      // Копируем форматирование из последней заполненной строки
      const sourceRowIndex = currentRowCount; // индекс последней строки (1-based)

      // Загружаем ячейки последней строки для копирования стилей
      await sheet.loadCells(`A${sourceRowIndex}:AG${sourceRowIndex}`);

      // Вставляем новые строки с наследованием форматирования от предыдущей
      await sheet.insertDimension('ROWS', {
        sheetId: sheet.sheetId,
        dimension: {
          sheetId: sheet.sheetId,
          startIndex: currentRowCount, // после последней строки
          endIndex: currentRowCount + rows.length
        },
        inheritFromBefore: true // копирует форматирование, validation, цвета и т.д.
      });

      // Заполняем значения в новых строках
      await sheet.addRows(rows);
    }

    console.log(`Успешно добавлено ${rows.length} строк с сохранением форматирования`);

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
