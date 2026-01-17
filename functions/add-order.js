const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const crypto = require('crypto');

// Кэш
let auth = null;
let doc = null;

async function getDoc() {
  if (doc) return doc;

  try {
    console.log('Создание авторизации...');
    auth = new JWT({
      email: process.env.CLIENT_EMAIL,
      key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, auth);
    await doc.loadInfo();
    console.log('Документ загружен');
    return doc;
  } catch (err) {
    console.error('Ошибка doc:', err.message);
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
    return { statusCode: 405 };
  }

  try {
    await getDoc();

    const body = JSON.parse(event.body || '{}');
    const { initData, rows } = body;

    if (!initData || !rows || !Array.isArray(rows) || rows.length === 0) {
      return { statusCode: 400, body: 'Missing initData or rows' };
    }

    const initDataObj = {};
    initData.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      initDataObj[key] = decodeURIComponent(value);
    });

    if (!validateInitData(initDataObj, process.env.BOT_TOKEN)) {
      return { statusCode: 403, body: 'Invalid initData' };
    }

    const sheet = doc.sheetsByIndex[0];

    // Получаем последнюю строку (чтобы скопировать форматирование)
    const lastRowIndex = sheet.rowCount;
    if (lastRowIndex < 2) {
      // Если таблица пустая — просто добавляем
      await sheet.addRows(rows);
    } else {
      // Копируем форматирование из последней заполненной строки
      await sheet.loadCells(`A${lastRowIndex}:AG${lastRowIndex}`);
      const sourceRow = sheet.getRow(lastRowIndex - 1); // нумерация с 0

      // Добавляем нужное количество строк
      await sheet.insertDimension('ROWS', {
        sheetId: sheet.sheetId,
        dimension: {
          startIndex: lastRowIndex,
          endIndex: lastRowIndex + rows.length
        },
        inheritFromBefore: true
      });

      // Копируем форматирование и стили на новые строки
      for (let i = 0; i < rows.length; i++) {
        const targetRowIndex = lastRowIndex + i;
        await sheet.loadCells(`A${targetRowIndex + 1}:AG${targetRowIndex + 1}`);

        // Копируем стили ячеек из sourceRow
        for (let col = 0; col < sheet.columnCount; col++) {
          const sourceCell = sourceRow.getCell(col);
          const targetCell = sheet.getCell(targetRowIndex, col);
          targetCell.backgroundColor = sourceCell.backgroundColor;
          targetCell.textFormat = sourceCell.textFormat;
          targetCell.userEnteredFormat = sourceCell.userEnteredFormat;
        }
      }

      // Теперь заполняем значения в новых строках
      await sheet.addRows(rows, { insertDataOption: 'INSERT_ROWS' });
    }

    console.log(`Успешно добавлено ${rows.length} строк с форматированием`);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, count: rows.length })
    };
  } catch (err) {
    console.error('Ошибка add-order:', err.message, err.stack);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
