// 定数定義
const API_ENDPOINT = "https://script.google.com/macros/s/AKfycbz50qzBe3j90LVjciwvu43ZM4IYd_Esxdz7LuBA_wI/dev";
const STORAGE_KEYS = {
  SPREADSHEET_URL: "spreadsheetUrl",
  SHEET_NAME: "sheetName"
};

// DOM要素
const elements = {
  form: document.getElementById('settingsForm'),
  spreadsheetUrl: document.getElementById('spreadsheetUrl'),
  sheetName: document.getElementById('sheetName'),
  status: document.getElementById('status'),
  loading: document.getElementById('loading')
};

/**
 * 設定を読み込む
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.SPREADSHEET_URL,
      STORAGE_KEYS.SHEET_NAME
    ]);

    elements.spreadsheetUrl.value = result[STORAGE_KEYS.SPREADSHEET_URL] || '';
    elements.sheetName.value = result[STORAGE_KEYS.SHEET_NAME] || '';
  } catch (error) {
    showStatus('設定の読み込みに失敗しました', false);
    console.error('設定読み込みエラー:', error);
  }
}

/**
 * APIに設定の妥当性を確認する
 * @param {string} spreadsheetUrl
 * @param {string} sheetName
 * @returns {Promise<boolean>}
 */
async function validateSettings(spreadsheetUrl, sheetName) {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify({
        action: 'validate',
        sheetUrl: spreadsheetUrl,
        sheetName: sheetName
      })
    });

    if (!response.ok) {
      throw new Error('APIレスポンスエラー');
    }

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('API検証エラー:', error);
    return false;
  }
}

/**
 * 設定を保存する
 * @param {string} spreadsheetUrl
 * @param {string} sheetName
 */
async function saveSettings(spreadsheetUrl, sheetName) {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SPREADSHEET_URL]: spreadsheetUrl,
      [STORAGE_KEYS.SHEET_NAME]: sheetName
    });
    showStatus('設定を保存しました', true);
  } catch (error) {
    showStatus('設定の保存に失敗しました', false);
    console.error('設定保存エラー:', error);
  }
}

/**
 * ステータスメッセージを表示する
 * @param {string} message
 * @param {boolean} isSuccess
 */
function showStatus(message, isSuccess) {
  elements.status.textContent = message;
  elements.status.className = 'status ' + (isSuccess ? 'success' : 'error');
}

/**
 * ローディング表示の制御
 * @param {boolean} show
 */
function toggleLoading(show) {
  elements.loading.className = 'loading ' + (show ? 'show' : '');
  elements.form.querySelector('button').disabled = show;
}

// フォームの送信イベントハンドラ
elements.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const spreadsheetUrl = elements.spreadsheetUrl.value.trim();
  const sheetName = elements.sheetName.value.trim();

  // 入力値の基本的なバリデーション
  if (!spreadsheetUrl || !sheetName) {
    showStatus('すべての項目を入力してください', false);
    return;
  }

  // URLの形式チェック
  if (!spreadsheetUrl.startsWith('https://docs.google.com/spreadsheets/d/')) {
    showStatus('無効なスプレッドシートURLです', false);
    return;
  }

  toggleLoading(true);

  try {
    // API経由で設定の妥当性を確認
    const isValid = await validateSettings(spreadsheetUrl, sheetName);
    
    if (isValid) {
      await saveSettings(spreadsheetUrl, sheetName);
    } else {
      showStatus('指定されたスプレッドシートにアクセスできません', false);
    }
  } catch (error) {
    showStatus('エラーが発生しました', false);
    console.error('保存処理エラー:', error);
  } finally {
    toggleLoading(false);
  }
});

// 初期設定の読み込み
document.addEventListener('DOMContentLoaded', loadSettings);