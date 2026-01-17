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
    console.log('Google Sheets инициализирован');const { GoogleSpreadsheet } = require('google-spreadsheet');
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

    // Самый простой и надёжный способ — добавляем строки в конец таблицы
    await sheet.addRows(rows);

    console.log(`Успешно добавлено ${rows.length} строк в конец таблицы`);

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

    const currentRowCount = sheet.rowCount;

    // Добавляем строки в конец (самый простой и надёжный способ)
    await sheet.addRows(rows);

    // Копируем форматирование из последней существующей строки в новые (если есть)
    if (currentRowCount > 1) {
      const sourceRowIndex = currentRowCount - 1; // последняя строка перед добавлением

      // Загружаем стили из последней строки
      await sheet.loadCells(`A${sourceRowIndex}:AG${sourceRowIndex}`);

      // Загружаем новые строки для копирования стилей
      await sheet.loadCells(`A${currentRowCount + 1}:AG${currentRowCount + rows.length}`);

      // Копируем стили
      for (let i = 0; i < rows.length; i++) {
        const targetRowIndex = currentRowCount + i;
        for (let col = 0; col < sheet.columnCount; col++) {
          const sourceCell = sheet.getCell(sourceRowIndex, col);
          const targetCell = sheet.getCell(targetRowIndex, col);
          targetCell.backgroundColor = sourceCell.backgroundColor;
          targetCell.textFormat = sourceCell.textFormat;
          targetCell.userEnteredFormat = sourceCell.userEnteredFormat;
        }
      }

      // Сохраняем изменения стилей
      await sheet.saveUpdatedCells();
    }

    console.log(`Успешно добавлено ${rows.length} строк в конец таблицы (с копированием стилей)`);

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
