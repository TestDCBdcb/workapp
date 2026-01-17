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

    // Получаем заголовки таблицы, чтобы понять структуру столбцов
    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    console.log('Заголовки таблицы:', headers);
    
    // Сопоставление данных с заголовками таблицы
    // На основе вашей структуры:
    // Магазин (0), Номер заказа (1), Аккаунт (2), Дата заказа (3), Позиция (4), 
    // Адрес ПВЗ (8), Статус (10), Оплата (11), Цена товара (22), Количество (23), Сумма (24)
    
    // Создаем маппинг названий столбцов к их индексам
    const columnMapping = {};
    headers.forEach((header, index) => {
      columnMapping[header.trim()] = index;
    });
    
    console.log('Маппинг столбцов:', columnMapping);
    
    // Проверяем наличие необходимых столбцов
    const requiredColumns = ['Магазин', 'Аккаунт', 'Дата заказа', 'Позиция', 'Адрес ПВЗ', 'Статус', 'Оплата', 'Цена товара', 'Количество', 'Сумма'];
    for (const col of requiredColumns) {
      if (columnMapping[col] === undefined) {
        console.warn(`Колонка "${col}" не найдена в таблице`);
      }
    }
    
    // Получаем текущие строки для определения, куда вставлять
    const currentRows = await sheet.getRows();
    const startRow = currentRows.length + 2; // +2: +1 для заголовка, +1 для следующей строки
    console.log(`Начинаем вставку с строки ${startRow}`);
    
    // Подготавливаем данные для вставки
    for (let i = 0; i < rows.length; i++) {
      const rowData = rows[i];
      const rowIndex = startRow + i - 1; // -1 потому что loadCells использует 0-based индексацию
      
      // Загружаем ячейки для этой строки
      await sheet.loadCells(`A${startRow + i}:Z${startRow + i}`);
      
      // Заполняем только нужные столбцы
      if (columnMapping['Магазин'] !== undefined) {
        const cell = sheet.getCell(rowIndex, columnMapping['Магазин']);
        cell.value = rowData['Магазин'] || '';
      }
      
      if (columnMapping['Номер заказа'] !== undefined) {
        const cell = sheet.getCell(rowIndex, columnMapping['Номер заказа']);
        cell.value = rowData['Номер заказа'] || '';
      }
      
      if (columnMapping['Аккаунт'] !== undefined) {
        const cell = sheet.getCell(rowIndex, columnMapping['Аккаунт']);
        cell.value = rowData['Аккаунт'] || '';
      }
      
      if (columnMapping['Дата заказа'] !== undefined) {
        const cell = sheet.getCell(rowIndex, columnMapping['Дата заказа']);
        cell.value = rowData['Дата заказа'] || '';
      }
      
      if (columnMapping['Позиция'] !== undefined) {
        const cell = sheet.getCell(rowIndex, columnMapping['Позиция']);
        cell.value = rowData['Позиция'] || '';
      }
      
      if (columnMapping['Адрес ПВЗ'] !== undefined) {
        const cell = sheet.getCell(rowIndex, columnMapping['Адрес ПВЗ']);
        cell.value = rowData['Адрес ПВЗ'] || '';
      }
      
      if (columnMapping['Статус'] !== undefined) {
        const cell = sheet.getCell(rowIndex, columnMapping['Статус']);
        cell.value = rowData['Статус'] || 'В пути';
      }
      
      if (columnMapping['Оплата'] !== undefined) {
        const cell = sheet.getCell(rowIndex, columnMapping['Оплата']);
        cell.value = rowData['Оплата'] || '';
      }
      
      if (columnMapping['Цена товара'] !== undefined) {
        const cell = sheet.getCell(rowIndex, columnMapping['Цена товара']);
        cell.value = rowData['Цена товара'] || 0;
      }
      
      if (columnMapping['Количество'] !== undefined) {
        const cell = sheet.getCell(rowIndex, columnMapping['Количество']);
        cell.value = rowData['Количество'] || 1;
      }
      
      if (columnMapping['Сумма'] !== undefined) {
        const cell = sheet.getCell(rowIndex, columnMapping['Сумма']);
        cell.value = rowData['Сумма'] || 0;
      }
      
      console.log(`Подготовлена строка ${startRow + i}:`, {
        Магазин: rowData['Магазин'],
        Позиция: rowData['Позиция'],
        Сумма: rowData['Сумма']
      });
    }
    
    // Сохраняем все изменения
    await sheet.saveUpdatedCells();
    console.log(`Успешно добавлено ${rows.length} строк`);

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
