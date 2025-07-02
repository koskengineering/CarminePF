const keepaAPIKey = PropertiesService.getUserProperties()?.getProperty("keepaAPIKey") || "";
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('設定メニュー')
    .addItem('ASIN取得', 'updateProductInfo')
    .addItem('PF設定確認', 'checkProductFinderConfig')
    .addItem('シート追加', 'addSheet')
    .addItem('シート削除', 'showSheetDeletionDialog')
    .addItem('自動更新設定', 'showSetTriggerDialog')
    .addItem('自動更新設定解除', 'deleteTriggerMenu')
    .addItem('keepaAPI登録', 'registerKeepaAPIKey')
    .addItem('keepaトークン残高更新', 'updateKeepaAPIToken')
    .addToUi();
}

function addSheet() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt("追加するシート名を入力してください。", ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() != ui.Button.OK) return;
  try {

    // コピー元のスプレッドシートを開く
    const sourceSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("コピー用");
    if (!sourceSheet) {
      throw new Error(`Sheet '${sheetName}' not found in the source spreadsheet.`);
    }

    const sheetName = result.getResponseText();
    const destinationSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const destinationSheetNames = destinationSpreadsheet.getSheets().map(item => item.getSheetName());
    const isExistSheet = destinationSheetNames.find(item => item === sheetName);
    if (!isExistSheet) {
      const copiedSheet = sourceSheet.copyTo(destinationSpreadsheet);
      copiedSheet.setName(sheetName);
      const productFinderSheet = destinationSpreadsheet.getSheetByName("ProductFinder");
      const productFinderSheetLastRow = productFinderSheet.getRange(productFinderSheet.getMaxRows(), 2)
        .getNextDataCell(SpreadsheetApp.Direction.UP)
        .getRow() + 1;
      productFinderSheet.getRange(productFinderSheetLastRow, 1, 1, 2).setValues([[true, sheetName]]);
    }
    else {
      throw Error(`${sheetName}はすでに存在します。`)
    }
  }
  catch (e) {
    SpreadsheetApp.getUi().alert(`シートの追加に失敗しました。/n${e.message}`);
  }

}



function updateProductInfo() {
  console.log(keepaAPIKey);
  if (keepaAPIKey == "") throw Error("KeepaのPrivate Access Keyを設定してください。")
  const configs = getProductFinderConfig();
  //const excludeAsins = getExculdeAsins();
  let allSheetAsins = getAllSheetAsins();
  configs.forEach(config => {
    const options = {
      "method": 'get',
      "muteHttpExceptions": true,
    }
    let response = null;
    try {
      response = UrlFetchApp.fetch(config.url, options);
    }
    catch (e) {
      SpreadsheetApp.getActiveSpreadsheet().toast(`シート名「${config.sheetName}」のURLは無効です。取得をスキップします。`);
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ProductFinder");
      const [head, title, ...data] = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
      const errorMessage = LanguageApp.translate(e.message, "en", "ja");
      sheet.getRange(config.rowNumber, head.indexOf("error") + 1).setValue(errorMessage);
      return;
    }

    const content = JSON.parse(response.getContentText());
    if (response.getResponseCode() != 200) {
      SpreadsheetApp.getActiveSpreadsheet().toast(`シート名「${config.sheetName}」のデータ取得でエラーが発生しました。取得をスキップします。`)
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ProductFinder");
      const [head, title, ...data] = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();

      const text = JSON.parse(response.getContentText());
      if (text.tokensLeft < 0) {
        sheet.getRange(config.rowNumber, head.indexOf("error") + 1).setValue("トークン切れです。時間をおいてから実行して下さい。");
        return;
      }
      else {
        const errorMessage = LanguageApp.translate(text.error.message, "en", "ja");
        sheet.getRange(config.rowNumber, head.indexOf("error") + 1).setValue(errorMessage);
        return;
      }
    }
    const asins = content.asinList || [];
    if (asins.length > 0) {
      // シート情報取得
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.sheetName);
      const [head, title, ...data] = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
      const header = {};
      head.forEach((key, index) => {
        if (key != "") {
          header[key] = index;
        }
      });

      const newAsins = asins.filter(asin => !(allSheetAsins.indexOf(asin) >= 0));
      allSheetAsins = [...allSheetAsins, ...newAsins];

      let writeData = [];
      const maxColumnNumber = sheet.getLastColumn();
      newAsins.forEach(asin => {
        let data = new Array(maxColumnNumber).fill(null);
        const matched = asin.match(/B[A-Z0-9]{9}/);
        if (matched) {
          data[header.asin] = asin;
          data[header.created_at] = Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss');
          writeData.push(data);
        }
      })
      if (writeData.length > 0) {
        sheet.getFilter() && sheet.getFilter().remove();
        sheet.insertRowsBefore(4, writeData.length);
        sheet.getRange(4, 1, writeData.length, writeData[0].length).setValues(writeData);
        const yellowColor = "#FFFF00"; // Google Sheetsの黄色のコード（RGB形式）
        sheet.getRange(4, 16, writeData.length, 1).setBackground(yellowColor);
      }
      //const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
      //const filter = range.createFilter();
      /*filter.setColumnFilterCriteria(16, SpreadsheetApp.newFilterCriteria()
        .whenCellBackgroundColor(yellowColor)
        .build());*/
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ProductFinder");
    const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.getRange(config.rowNumber, head.indexOf("error") + 1).setValue("正常終了");
    updateKeepaAPIToken();
  })

}

function getProductFinderConfig() {
  const values = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("ProductFinderConfig").getValues();
  const config = values.map((item, index) => { return { enabled: item[0], sheetName: item[1], url: String(item[2]).replace("YOUR_API_KEY", keepaAPIKey).trim(), rowNumber: index + 3 } }).filter(item => item.enabled);
  return config;
}

function getExculdeAsins() {
  return SpreadsheetApp.getActiveSpreadsheet().getRangeByName("excludeAsins").getValues()?.map(item => item[0]) || [];
}

function getAllSheetAsins() {
  let allAsins = [];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ASIN一覧");
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const activeAsins = flattenAndFilterNonEmpty(values);
  allAsins = [...activeAsins];

  const extractSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("除外ASIN");
  const [head, title, ...data] = sheet.getRange(1, 1, extractSheet.getLastRow(), extractSheet.getLastColumn()).getValues();
  const columnAsin = head.indexOf("asin");
  if (columnAsin >= 0) {
    const sheetAsins = data.filter(item => item[columnAsin]).map(item => item[columnAsin]);
    allAsins = [...allAsins, ...sheetAsins];
  }
  return allAsins;
}

function flattenAndFilterNonEmpty(array2D) {
  return array2D.flat().filter(value => value !== null && value !== undefined && value !== "");
}

// トリガー設定関数
function createTrigger() {
  deleteTrigger('updateProductInfo');
  ScriptApp.newTrigger('updateProductInfo')
    .timeBased()
    .atHour(0)
    .everyDays(1)
    .create();
  SpreadsheetApp.getUi().alert('毎日0時にASIN取得のトリガーが設定されました');
}

// トリガー削除関数（メニューからの実行用）
function deleteTriggerMenu() {
  deleteTrigger('updateProductInfo');
  SpreadsheetApp.getUi().alert('トリガーが削除されました');
}

// 既存のトリガーを削除する関数
function deleteTrigger(functionName) {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function showSetTriggerDialog() {
  const html = HtmlService.createHtmlOutputFromFile('SetTrigger')
    .setWidth(300)
    .setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, 'トリガー設定');
}

function setDailyTrigger(hour) {
  // 既存のトリガーを削除（重複を防ぐため）
  const triggers = ScriptApp.getProjectTriggers();
  for (let trigger of triggers) {
    if (trigger.getHandlerFunction() === 'updateProductInfo') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  // ユーザーが指定した時刻にトリガーを作成
  ScriptApp.newTrigger('updateProductInfo')
    .timeBased()
    .atHour(Number(hour)) // 時のみ指定
    .everyDays(1) // 毎日
    .create();

  return `${hour}時にトリガーを設定しました。`
}

function showSheetDeletionDialog() {
  const html = HtmlService.createHtmlOutputFromFile('SheetDeletionDialog')
    .setWidth(300)
    .setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, 'シート削除');
}

function getSheetNames() {
  const excludedSheets = ['Keepa', 'ProductFinder', 'コピー用', '除外ASIN', 'はじめにお読みください', 'ASIN一覧'];
  const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  return sheets
    .map(sheet => sheet.getName())
    .filter(name => !excludedSheets.includes(name)); // 除外するシートをフィルタリング
}

function deleteSheet(sheetName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (sheet) {
    spreadsheet.deleteSheet(sheet);
    const pfSheet = spreadsheet.getSheetByName("ProductFinder");
    const pfSheetValues = pfSheet.getRange(1, 1, pfSheet.getLastRow(), pfSheet.getLastColumn()).getValues();
    const deleteRowIndex = pfSheetValues.findIndex(item => item[1] == sheetName);
    pfSheet.deleteRow(deleteRowIndex + 1);
    return `シート「${sheetName}」を削除しました。`;
  } else {
    throw new Error(`シート「${sheetName}」が見つかりません。`);
  }
}

function checkProductFinderConfig() {
  const html = HtmlService.createHtmlOutputFromFile('PFCheck')
    .setWidth(300)
    .setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, 'ProductFinder設定確認');
}

function checkPFConfig(sheetName) {
  const configs = getProductFinderConfig();
  const config = configs.find(item => item.sheetName == sheetName);
  console.log(config);
  const options = {
    "method": 'get',
    "muteHttpExceptions": true,
  }
  let response = null;
  try {
    response = UrlFetchApp.fetch(config.url, options);
  }
  catch (e) {
    const errorMessage = LanguageApp.translate(e.message, "en", "ja");
    return errorMessage;
  }
  if (response.getResponseCode() != 200) {
    const text = JSON.parse(response.getContentText());
    if (text.tokensLeft < 0) {
      return ("トークン切れです。時間をおいてから実行して下さい。");
    }
    else {
      const errorMessage = LanguageApp.translate(text.error.message, "en", "ja");
      return errorMessage;
    }
  }
  return "設定は正常です。";
}


function registerKeepaAPIKey() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt("https://keepa.com/#!api を開いて、KeepaのPrivate API access keyをコピーして貼り付けてください。", ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() != ui.Button.OK) return;
  try {
    const key = result.getResponseText();
    checkKeepaApiKey(key);
    PropertiesService.getUserProperties().setProperty("keepaAPIKey", key);
    SpreadsheetApp.getActiveSpreadsheet().getRangeByName("keepaAPIKey").setValue(key);
    SpreadsheetApp.getUi().alert("KeepaのAPIキー設定が完了しました!!");
  }
  catch (e) {
    SpreadsheetApp.getUi().alert(`Keepaの設定に失敗しました。\nKeepaのPrivate API access keyが正しく入力されているか確認してください。/n${e.message}`);
  }
}

function checkKeepaApiKey(key) {
  const url = 'https://api.keepa.com/token';
  const options = {
    method: 'post',
    muteHttpExceptions: true,
    payload: {
      key,
    },
  };
  const response = UrlFetchApp.fetch(
    url,
    options
  );
  switch (response.getResponseCode()) {
    case 200:
      return response;
    case 402:
      throw Error("KeepaAPIキーに誤りがあります。");
    case 429:
      throw Error("Keepaのトークン切れです。時間を空けてから再度実行してください。");
    default:
      throw Error(response.getContentText());
  }
}

function updateKeepaAPIToken() {
  const token = getKeepaToken();
  SpreadsheetApp.getActiveSpreadsheet().getRangeByName("keepaAPIToken").setValue(token);  
}

/**
 * KeepaAPIトークン取得処理
 * returns(integer)Keepaトークン残高 ※エラーなら-1
 */
function getKeepaToken() {
  let token = -1;
  try {
    const KeepaTokenURL = `https://api.keepa.com/token?key=${keepaAPIKey}`;
    const response = UrlFetchApp.fetch(KeepaTokenURL);
    let message = response.getResponseCode();
    switch (response.getResponseCode()) {
      case 200:
        message += ":OK";
        content = response.getContentText();
        const json = JSON.parse(content);
        token = Number(json.tokensLeft);
        break;
      case 400:
        message += ":BadRequest";
        break;
      case 402:
        message += ":Payment Required";
        break;
      case 405:
        message += ":Method Not Allowed";
        break;
      case 429:
        message += ":Too Many Requests";
        break;
      case 500:
        message += ":Internal Server Error";
        break;
      default:
        message += "不明なエラー";
        break;
    }
    console.log(message);
  }
  catch (e) {
    SpreadsheetApp.getActiveSpreadsheet().toast("KeepaAPIコール時に不明なエラーが発生しました");
    console.log(e);
  }

  return Number(token);
}