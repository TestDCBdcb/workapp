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

    // Загружаем информацию о листе, чтобы получить актуальное количество строк
    await sheet.loadCells('A1:Z1');
    await sheet.loadHeaderRow(); // Загружаем заголовки

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

    // Получаем текущие строки, чтобы понять, где последняя заполненная строка
    const currentRows = await sheet.getRows();
    console.log(`Текущее количество строк: ${currentRows.length}`);
    
    // Начинаем вставку после последней строки
    const startRowIndex = currentRows.length + 1; // +1 потому что заголовок в строке 1
    
    // Подготавливаем данные для вставки
    const valuesToInsert = rows.map(row => [
      row['Магазин'] || '',
      row['Номер заказа'] || '',
      row['Аккаунт'] || '',
      row['Дата заказа'] || '',
      row['Позиция'] || '',
      row['Адрес ПВЗ'] || '',
      row['Статус'] || 'В пути',
      row['Оплата'] || '',
      row['Цена товара'] || 0,
      row['Количество'] || 1,
      row['Сумма'] || 0
    ]);
    
    // Определяем диапазон для вставки
    const startRow = startRowIndex + 1; // +1 потому что sheet.getRows() возвращает строки без заголовка
    const endRow = startRow + rows.length - 1;
    
    // Вставляем строки с использованием setValuesInRange
    await sheet.loadCells(`A${startRow}:K${endRow}`);
    
    // Заполняем ячейки
    for (let i = 0; i < rows.length; i++) {
      const rowData = valuesToInsert[i];
      const rowNum = startRow + i;
      
      for (let col = 0; col < rowData.length; col++) {
        const cell = sheet.getCell(rowNum - 1, col); // -1 потому что нумерация с 0
        cell.value = rowData[col];
      }
    }
    
    // Сохраняем изменения
    await sheet.saveUpdatedCells();
    
    console.log(`Успешно добавлено ${rows.length} строк, начиная со строки ${startRow}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, count: rows.length, startRow })
    };
  } catch (err) {
    console.error('Ошибка add-order:', err.message, err.stack);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
