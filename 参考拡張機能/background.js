/**
 * @typedef {Object} PurchaseThreshold
 * @property {string} condition - 商品の状態 ("新品" or "中古")
 * @property {number|null} price - 価格の上限値
 * @property {number|null} rating - レビュー評価の下限値
 * @property {number|null} ratingCount - レビュー数の下限値
 * @property {number|null} starRating - 星評価の下限値
 * @property {boolean|null} isFBA - FBA商品であるか
 * @property {boolean|null} isAmazon - Amazon直販商品であるか
 * @property {number} days - 配送日数の上限
 */

/**
 * @typedef {Object} APIResponse
 * @property {string} asin - 商品ASIN
 * @property {string} condition - 商品状態
 * @property {number} price - 価格
 * @property {number} review_rate - レビュー評価
 * @property {number} review_count - レビュー数
 * @property {number} review_star - 星評価
 * @property {boolean} fba - FBA商品フラグ
 * @property {boolean} amazon - Amazon直販フラグ
 * @property {number} minimum_shipping_time - 配送日数
 */

// 定数定義
const CONSTANTS = {
  FETCH_INTERVAL: 2000,
  COOKIE_DOMAIN: "google.com",
  API_ENDPOINT:
    "https://script.google.com/macros/s/AKfycbz50qzBe3j90LVjciwvu43ZM4IYd_Esxdz7LuBA_wI/dev",
  AMAZON_PRODUCT_URL: "https://www.amazon.co.jp/dp/product/",
  ICONS: {
    ENABLED: "icons/icon-enabled.png",
    DISABLED: "icons/icon-disabled.png",
  },
  STORAGE_KEYS: {
    AUTO_PURCHASE: "autoPurchaseEnabled",
    INTERVAL_ID: "intervalId",
    SPREADSHEET_URL: "spreadsheetUrl",
    SHEET_NAME: "sheetName",
  },
};

// グローバル状態管理
const state = {
  purchaseTabId: null,
  isPurchasing: false,
  threshold: null,
};

/**
 * 拡張機能インストール時の初期化
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    [CONSTANTS.STORAGE_KEYS.AUTO_PURCHASE]: false,
    //    [CONSTANTS.STORAGE_KEYS.SPREADSHEET_URL]: "",
    //    [CONSTANTS.STORAGE_KEYS.SHEET_NAME]: ""
  });
});

/**
 * メッセージリスナーの設定
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "startFetching":
      startFetching();
      break;
    case "stopFetching":
      stopFetching();
      break;
    case "openTab":
      chrome.tabs.create({ url: request.url });
      sendResponse({ success: true });
      break;

    case "setResult":
      setResult(sender, request.result);
      break;

    case "updateCloseTabTimer":
      // タブのクローズタイマーを更新
      updateCloseTabTimer(sender);
      break;

    default:
      console.warn(`不明なアクション: ${request.action}`);
  }

  return true;
});

/**
 * タブ削除時のリスナー
 */
/*
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === state.purchaseTabId) {
    resetState();
    startFetching();
  }
});*/
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === state.purchaseTabId) {
    resetState();
    if (!state.isPurchasing) {
      startFetching();
    }
  }
});

/**
 * タブ更新時のリスナー
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId !== state.purchaseTabId || changeInfo.status !== "complete") return;

  chrome.tabs.sendMessage(tabId, {
    action: "runMain",
    threshold: state.threshold,
  });
});

/**
 * ストレージからスプレッドシート設定を取得
 * @returns {Promise<{spreadsheetUrl: string, sheetName: string}>}
 */
async function getSpreadsheetSettings() {
  const result = await chrome.storage.local.get([
    CONSTANTS.STORAGE_KEYS.SPREADSHEET_URL,
    CONSTANTS.STORAGE_KEYS.SHEET_NAME,
  ]);

  if (
    !result[CONSTANTS.STORAGE_KEYS.SPREADSHEET_URL] ||
    !result[CONSTANTS.STORAGE_KEYS.SHEET_NAME]
  ) {
    throw new Error("スプレッドシートの設定が見つかりません");
  }

  return {
    spreadsheetUrl: result[CONSTANTS.STORAGE_KEYS.SPREADSHEET_URL],
    sheetName: result[CONSTANTS.STORAGE_KEYS.SHEET_NAME],
  };
}

/**
 * 購入URLの取得とタブ作成
 */
/*
async function fetchPurchaseUrl() {
  if (state.isPurchasing) return;

  try {
    const { spreadsheetUrl, sheetName } = await getSpreadsheetSettings();
    const cookies = await getCookies();
    const cookieString = formatCookies(cookies);
    const response = await fetchFromAPI(cookieString, spreadsheetUrl, sheetName);
    const { data } = await response.json();

    if (!data.asin) {
      console.log("ASINが空のため、スキップします");
      return;
    }

    await createPurchaseTab(data);
  } catch (error) {
    console.error("購入URL取得中にエラーが発生:", error);
    startFetching();
  }
}
  */
async function fetchPurchaseUrl() {
  if (state.isPurchasing) return;

  try {
    state.isPurchasing = true;

    const { spreadsheetUrl, sheetName } = await getSpreadsheetSettings();
    const cookies = await getCookies();
    const cookieString = formatCookies(cookies);
    const response = await fetchFromAPI(
      cookieString,
      spreadsheetUrl,
      sheetName
    );
    const { data } = await response.json();

    if (!data.asin) {
      console.log("ASINが空のため、スキップします");
      return;
    }

    await createPurchaseTab(data);
  } catch (error) {
    console.error("購入URL取得中にエラーが発生:", error);
  } finally {
    state.isPurchasing = false; // 最後に状態をリセット
  }
}

/**
 * Cookieの取得
 * @returns {Promise<chrome.cookies.Cookie[]>}
 */
function getCookies() {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: CONSTANTS.COOKIE_DOMAIN }, resolve);
  });
}

/**
 * Cookie文字列のフォーマット
 * @param {chrome.cookies.Cookie[]} cookies
 * @returns {string}
 */
function formatCookies(cookies) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

/**
 * APIからデータを取得
 * @param {string} cookieString
 * @param {string} spreadsheetUrl
 * @param {string} sheetName
 * @returns {Promise<Response>}
 */
async function fetchFromAPI(cookieString, spreadsheetUrl, sheetName) {
  return fetch(CONSTANTS.API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Cookie": cookieString,
    },
    body: JSON.stringify({
      action: "check",
      sheetUrl: spreadsheetUrl,
      sheetName: sheetName,
    }),
  });
}

/**
 * 購入タブの作成
 * @param {APIResponse} data
 */
async function createPurchaseTab(data) {
  const url = `${CONSTANTS.AMAZON_PRODUCT_URL}${data.asin}?th=1&psc=1`;
  state.isPurchasing = true;
  state.threshold = convertThreshold(data);

  const tab = await chrome.tabs.create({ url });
  state.purchaseTabId = tab.id;
}

/**
 * 自動購入の開始
 */
/*
async function startFetching() {
  const storage = await chrome.storage.local.get(CONSTANTS.STORAGE_KEYS.AUTO_PURCHASE);
  const autoPurchaseEnabled = storage[CONSTANTS.STORAGE_KEYS.AUTO_PURCHASE];
  
  await updateIcon(autoPurchaseEnabled);

  if (autoPurchaseEnabled) {
    const intervalId = setInterval(async () => {
      if (!state.isPurchasing) {
        await fetchPurchaseUrl();
      }
    }, CONSTANTS.FETCH_INTERVAL);
    
    await chrome.storage.local.set({ 
      [CONSTANTS.STORAGE_KEYS.INTERVAL_ID]: intervalId 
    });
  }
}*/
/**
 * 自動購入の開始
 */
async function startFetching() {
  const storage = await chrome.storage.local.get(
    CONSTANTS.STORAGE_KEYS.AUTO_PURCHASE
  );
  const autoPurchaseEnabled = storage[CONSTANTS.STORAGE_KEYS.AUTO_PURCHASE];

  await updateIcon(autoPurchaseEnabled);

  if (autoPurchaseEnabled) {
    async function fetchLoop() {
      if (!state.isPurchasing) {
        await fetchPurchaseUrl();
      }
      const storage = await chrome.storage.local.get(
        CONSTANTS.STORAGE_KEYS.AUTO_PURCHASE
      );
      if (storage[CONSTANTS.STORAGE_KEYS.AUTO_PURCHASE]) {
        setTimeout(fetchLoop, CONSTANTS.FETCH_INTERVAL);
      }
    }

    fetchLoop();
  }
}

/**
 * 自動購入の停止
 */
async function stopFetching() {
  const storage = await chrome.storage.local.get(
    CONSTANTS.STORAGE_KEYS.INTERVAL_ID
  );
  const intervalId = storage[CONSTANTS.STORAGE_KEYS.INTERVAL_ID];

  if (intervalId) {
    clearInterval(intervalId);
    await chrome.storage.local.remove(CONSTANTS.STORAGE_KEYS.INTERVAL_ID);
  }

  await updateIcon(false);
}

/**
 * アイコンの更新
 * @param {boolean} enabled
 */
async function updateIcon(enabled) {
  await chrome.action.setIcon({
    path: enabled ? CONSTANTS.ICONS.ENABLED : CONSTANTS.ICONS.DISABLED,
  });
}

/**
 * 状態のリセット
 */
function resetState() {
  state.purchaseTabId = null;
  state.isPurchasing = false;
  state.threshold = null;
}

/**
 * 閾値オブジェクトの変換
 * @param {APIResponse} data - APIレスポンスデータ
 * @returns {PurchaseThreshold} 変換された閾値オブジェクト
 */
function convertThreshold(data) {
  return {
    condition: data?.condition || "新品",
    price: data?.price || null,
    rating: data?.review_rate || null,
    ratingCount: data?.review_count || null,
    starRating: data?.review_star || null,
    isFBA: data?.fba || null,
    isAmazon: data?.amazon || null,
    days: data?.minimum_shipping_time || 7,
  };
}

// 初期化時の自動購入状態の確認
chrome.storage.local.get(CONSTANTS.STORAGE_KEYS.AUTO_PURCHASE, (result) => {
  if (result[CONSTANTS.STORAGE_KEYS.AUTO_PURCHASE]) {
    startFetching();
  }
});

// 拡張機能のアイコンがクリックされたときにサイドパネルを開く
chrome.action.onClicked.addListener(async (tab) => {
  // サイドパネルを開く
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// 拡張機能がインストールされたときの初期設定
chrome.runtime.onInstalled.addListener(() => {
  console.log("GAS連携サイドパネル拡張機能がインストールされました");
});

// Cookieを取得してリクエストヘッダーに追加する関数
async function getCookiesForDomain(url) {
  try {
    const domain = new URL(url).hostname;
    const cookies = await chrome.cookies.getAll({ domain: domain });

    if (cookies.length > 0) {
      return cookies
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");
    }

    // Google ドメイン全体からもCookieを取得
    const googleCookies = await chrome.cookies.getAll({
      domain: ".google.com",
    });
    if (googleCookies.length > 0) {
      return googleCookies
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");
    }

    return "";
  } catch (error) {
    console.error("Cookie取得エラー:", error);
    return "";
  }
}

//Google認証状態をチェックする関数
async function checkGoogleAuthentication() {
  try {
    // Google関連のCookieを確認
    const googleCookies = await chrome.cookies.getAll({
      domain: ".google.com",
    });

    // 認証関連のCookieがあるかチェック
    const authCookies = googleCookies.filter(
      (cookie) =>
        cookie.name.includes("SID") ||
        cookie.name.includes("SSID") ||
        cookie.name.includes("APISID") ||
        cookie.name.includes("SAPISID")
    );

    if (authCookies.length > 0) {
      // さらに詳細な認証確認のためGoogleのAPIエンドポイントにテストリクエスト
      try {
        const response = await fetch(
          "https://accounts.google.com/signin/continue",
          {
            method: "GET",
            credentials: "include",
          }
        );

        return {
          isAuthenticated: response.ok || response.status === 302,
          cookieCount: authCookies.length,
          userInfo: authCookies.find((c) => c.name === "SID")
            ? "ログイン済み"
            : "部分的",
        };
      } catch (error) {
        return {
          isAuthenticated: authCookies.length > 0,
          cookieCount: authCookies.length,
          userInfo: "Cookie確認済み",
        };
      }
    }

    return {
      isAuthenticated: false,
      cookieCount: 0,
      userInfo: null,
    };
  } catch (error) {
    console.error("認証チェックエラー:", error);
    return {
      isAuthenticated: false,
      error: error.message,
    };
  }
}

// サイドパネルからのリクエストを代理で処理（Cookie付与）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkGoogleAuth") {
    // Google認証状態をチェック
    (async () => {
      try {
        const authStatus = await checkGoogleAuthentication();
        sendResponse({
          success: true,
          isAuthenticated: authStatus.isAuthenticated,
          userInfo: authStatus.userInfo,
          cookieCount: authStatus.cookieCount,
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (request.action === "fetchGAS") {
    // Cookieを取得してリクエストを送信
    (async () => {
      try {
        const cookieString = await getCookiesForDomain(request.url);
        console.log("取得したCookie:", cookieString);

        const headers = {
          "Content-Type": "application/json",
        };

        // Cookieがある場合はヘッダーに追加
        if (cookieString) {
          headers["Cookie"] = cookieString;
        }

        const response = await fetch(request.url, {
          method: "GET",
          mode: "cors",
          credentials: "include", // Cookieを含める
          headers: headers,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        sendResponse({ success: true, data: data });
      } catch (error) {
        console.error("GASリクエストエラー:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // 非同期レスポンスを有効にする
  }

  if (request.action === "openTab") {
    chrome.tabs.create({ url: request.url });
    sendResponse({ success: true });
  }

  return true;
});

// タブごとのタイマーを管理するMap
const closeTabTimers = new Map();

function setResult(sender, result) {
  if (sender.tab?.id) {
    const tabId = sender.tab.id;

    console.log(`POST要求: タブ ${tabId}`);

    // POST処理（毎回送信）
    fetch(
      "https://script.google.com/macros/s/AKfycbyDVq-9D_l7Hz7G-wn9lWYemOP0d9T2byuWKDodSQrb2VBqH2IHQ-0LUasIKgYtzeCW/exec",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setresult", result }),
      }
    )
      .then((res) => res.json())
      .then((data) => {
        console.log("POST成功:", data);

        // すでにタイマーがあればキャンセル
        if (closeTabTimers.has(tabId)) {
          clearTimeout(closeTabTimers.get(tabId));
          console.log(`タブ ${tabId} のタイマーをリセット`);
        }
      })
      .catch((err) => {
        console.error("POST失敗:", err);
      });
  }
}

function updateCloseTabTimer(sender) {
  if (sender.tab?.id) {
    const tabId = sender.tab.id;

    // すでにタイマーがあればキャンセル
    if (closeTabTimers.has(tabId)) {
      clearTimeout(closeTabTimers.get(tabId));
      console.log(`タブ ${tabId} のタイマーをリセット`);
    }

    // 新しく10秒後にタブを閉じるタイマーをセット
    const timerId = setTimeout(() => {
      chrome.tabs.remove(tabId, () => {
        console.log(`タブ ${tabId} を閉じました`);
        closeTabTimers.delete(tabId);
      });
    }, 10000);

    closeTabTimers.set(tabId, timerId);
  }
}
