/**
 * @typedef {Object} PurchaseThreshold
 * @property {string} condition - 商品の状態 ("新品" or "中古")
 * @property {number|null} price - 価格の上限値
 * @property {number|null} rating - 評価値の下限
 * @property {number|null} ratingCount - 評価数の下限
 * @property {number|null} starRating - 星評価の下限
 * @property {boolean|null} isFBA - FBA（Amazonフルフィルメント）商品であるか
 * @property {boolean|null} isAmazon - Amazon直販商品であるか
 * @property {number} days - 配送日数の上限
 */

/**
 * @typedef {Object} SellerInfo
 * @property {HTMLElement} button - 購入ボタン要素
 * @property {string} sellerId - 販売者ID
 * @property {string} sellerName - 販売者名
 * @property {string} shipmentType - 配送タイプ（"FBA" or "FBM"）
 * @property {string} condition - 商品の状態
 * @property {number} price - 商品価格
 * @property {number} deliveryPrice - 配送料
 * @property {number} point - 付与ポイント
 * @property {string} ratingValue - 評価値（パーセンテージ）
 * @property {number} ratingCount - 評価数
 * @property {number} starRating - 星評価
 * @property {string} deliveryTime - 配送予定日
 */

// 購入条件の初期設定
let threshold = {
  condition: "新品",
  price: null,
  rating: null,
  ratingCount: null,
  starRating: null,
  isFBA: null,
  isAmazon: null,
  days: 7,
};

let result = {
  processed_at: new Date().toISOString(),
  status: "default",
  quantity: 0,
  order_number: "",
  error: "",
  id: "",
  message: "",
};

// ページのロードが完了した時に実行されるコード
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoCheckOut);
} else {
  autoCheckOut();
}

function autoCheckOut() {
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get("autoCheckOut") === "true") {
    chrome.runtime.sendMessage({ action: "updateCloseTabTimer" });
    result.status = "selectSeller";
    if (urlParams.get("id")) result.id = urlParams.get("id");

    const buyboxSeller = getBuyboxSellerInfo();

    if (!buyboxSeller) {
      //alert("Buyboxセラーが見つかりません。全出品者を確認します。");
      return;
    }

    if (
      urlParams.get("review_star") &&
      urlParams.get("review_star") > buyboxSeller.starRating
    ) {
      result.message = `評価${urlParams.get(
        "review_star"
      )}未満のため、購入を中止します。`;
      chrome.runtime.sendMessage({ action: "setResult", result });
      return;
    }

    if (
      urlParams.get("review_count") &&
      urlParams.get("review_count") > buyboxSeller.ratingCount
    ) {
      result.message = `評価数${urlParams.get(
        "review_count"
      )}未満のため、購入を中止します。`;
      return;
    }

    if (!isSellerMeetingThreshold(buyboxSeller)) {
      result.message = `${JSON.stringify(
        buyboxSeller,
        null,
        2
      )}購入条件を満足していないため、購入を中止します。`;
      return;
    }
    selectQuantity();
  }
  // 今すぐ買うボタンで別ページに行った時の処理
  else if (
    urlParams.get("isBuyNow") == 1 &&
    window.location.href.includes("/checkout/")
  ) {
    const placeOrderButton = document.querySelector("#placeOrder");
    if (placeOrderButton) {
      result.status = "clickPlaceOrderButton";
      chrome.runtime.sendMessage({ action: "updateCloseTabTimer" });
      result.processed_at = new Date().toISOString();
      const orderNumberMatch = window.location.href.match(/p-(\d+-\d+-\d+)/);
      if (orderNumberMatch) {
        result.order_number = orderNumberMatch[1];
      } else {
        console.error("注文番号が取得できませんでした。");
        result.error = "注文番号が取得できませんでした。";
      }
      placeOrderButton.click();
    } else {
      console.error("購入ボタンが見つかりません。");
      result.error = "購入ボタンが見つかりません。";
      chrome.runtime.sendMessage({ action: "setResult", result });
    }
  }
  // 購入完了したときの処理
  else if (
    window.location.href.includes(
      "https://www.amazon.co.jp/gp/buy/thankyou/handlers/display.html"
    )
  ) {
    const orderNumberMatch = window.location.href.match(/purchaseId=(\d+-\d+-\d+)/);
    if (orderNumberMatch) {
      result.order_number = orderNumberMatch[1];
      result.status = "orderComplete";
      result.processed_at = new Date().toISOString();
      chrome.runtime.sendMessage({ action: "setResult", result });
    } else {
      console.error("注文番号が取得できませんでした。");
      result.error = "注文番号が取得できませんでした。";
      chrome.runtime.sendMessage({ action: "setResult", result });
    }
  }
}

/**
 * 注文数量を選択する関数
 * @throws {Error} 注文数量エレメントが見つからない場合
 */
function selectQuantity() {
  result.status = "selectQuantity";
  chrome.runtime.sendMessage({ action: "updateCloseTabTimer" });
  try {
    const quantityButton = document.querySelector(
      "#buybox #selectQuantity #a-autoid-0-announce.a-button-text.a-declarative"
    );

    if (!quantityButton) {
      console.log("注文数量エレメントが見つかりません。直接購入を試みます。");
      result.quantity = 1;
      clickBuyNowButton();
      return;
    }

    quantityButton.click();
    waitForDropdown();
  } catch (error) {
    console.error("注文数量選択中にエラーが発生しました:", error);
    throw error;
  }
}

/**
 * ドロップダウンメニューの表示を待機し、数量を選択する関数
 */
function waitForDropdown() {
  const MAX_RETRY = 10;
  let retryCount = 0;

  const interval = setInterval(() => {
    try {
      const quantityElems = document.querySelectorAll(
        ".a-popover.a-dropdown.a-dropdown-common.a-declarative .a-popover-wrapper li"
      );

      if (quantityElems.length > 0) {
        clearInterval(interval);
        selectLastAvailableQuantity(quantityElems);
        clickBuyNowButton();
      } else if (++retryCount >= MAX_RETRY) {
        clearInterval(interval);
        console.error("数量選択のドロップダウンが表示されませんでした。");
        throw new Error("ドロップダウン表示のタイムアウト");
      }
    } catch (error) {
      clearInterval(interval);
      console.error("ドロップダウン処理中にエラーが発生しました:", error);
      throw error;
    }
  }, 500);
}

/**
 * 利用可能な最大数量を選択する関数
 * @param {NodeListOf<Element>} quantityElems - 数量選択要素のリスト
 */
function selectLastAvailableQuantity(quantityElems) {
  const lastQuantity = quantityElems[quantityElems.length - 1].innerText;
  const targetIndex = lastQuantity.includes("+")
    ? quantityElems.length - 2
    : quantityElems.length - 1;

  const targetLink = quantityElems[targetIndex].querySelector("a");
  if (!targetLink) {
    throw new Error("数量選択リンクが見つかりません。");
  }
  result.quantity = targetLink.innerText.replace(/[^0-9]/g, "");

  targetLink.click();
}

/**
 * 「今すぐ購入」ボタンをクリックする関数
 * @throws {Error} 購入ボタンが見つからない場合
 */
function clickBuyNowButton() {
  result.status = "clickBuyNowButton";
  chrome.runtime.sendMessage({ action: "updateCloseTabTimer" });
  try {
    const buyNowButton = document.querySelector("#rightCol #buy-now-button");
    if (!buyNowButton) {
      throw new Error("今すぐ購入ボタンが見つかりません。");
    }

    setTimeout(() => {
      result.processed_at = new Date().toISOString();
      chrome.runtime.sendMessage({ action: "setResult", result });
      buyNowButton.click();
      waitForIframe();
    }, 1000);
  } catch (error) {
    console.error("購入ボタンクリック処理でエラーが発生:", error);
    throw error;
  }
}

/**
 * チェックアウトiframeの読み込みを待機する関数
 */
function waitForIframe() {
  const MAX_RETRY = 20;
  let retryCount = 0;

  const interval = setInterval(() => {
    try {
      const iframe = document.querySelector("#turbo-checkout-iframe");
      if (iframe) {
        clearInterval(interval);
        console.log("iframeを検出しました");

        iframe.addEventListener("load", () => {
          const iframeDocument =
            iframe.contentDocument || iframe.contentWindow.document;
          console.log("iframeが読み込まれました");
          checkForTurboCheckoutButton(iframeDocument);
        });
      } else if (++retryCount >= MAX_RETRY) {
        clearInterval(interval);
        throw new Error("iframeの読み込みがタイムアウトしました");
      }
    } catch (error) {
      clearInterval(interval);
      console.error("iframe処理中にエラーが発生:", error);
      throw error;
    }
  }, 500);
}

/**
 * Turbo Checkoutボタンの表示を確認する関数
 * @param {Document} iframeDocument - iframe内のドキュメント
 */
function checkForTurboCheckoutButton(iframeDocument) {
  const MAX_RETRY = 20;
  let retryCount = 0;

  const interval = setInterval(() => {
    try {
      const turboButton = iframeDocument.querySelector(
        "#turbo-checkout-pyo-button"
      );
      if (turboButton) {
        clearInterval(interval);
        setTimeout(() => {
          //alert("Turbo Checkoutボタンが表示されました！");
          chrome.runtime.sendMessage({ action: "updateCloseTabTimer" });
          result.status = "clickTurboCheckoutButton";
          result.processed_at = new Date().toISOString();
          chrome.runtime.sendMessage({ action: "setResult", result });

          turboButton.click();
        }, 500);
      } else if (++retryCount >= MAX_RETRY) {
        clearInterval(interval);
        throw new Error("Turbo Checkoutボタンが見つかりませんでした");
      }
    } catch (error) {
      clearInterval(interval);
      console.error("Turbo Checkout確認中にエラー:", error);
      throw error;
    }
  }, 500);
}

/**
 * Buyboxセラーの情報を取得する関数
 * @returns {SellerInfo|null} セラー情報、存在しない場合はnull
 */
function getBuyboxSellerInfo() {
  try {
    const addToCartButton = document.querySelector("#add-to-cart-button");
    if (!addToCartButton) return null;

    const buyboxElement = document.querySelector("#buybox");
    if (!buyboxElement) return null;

    const condition = buyboxElement
      .querySelector("#corePrice_feature_div")
      .innerText.includes("中古")
      ? "中古"
      : "新品";
    const priceElement = document.querySelector("#buybox .a-price-whole");
    if (!priceElement) return null;

    const price = parseInt(priceElement.textContent.replace(/[^0-9]/g, ""), 10);
    const pointElement = document.querySelector(
      "#buybox #pointsInsideBuyBox_feature_div .a-color-price"
    );
    const point = pointElement
      ? parseInt(
          pointElement.innerText.split("pt")[0].replace(/[^0-9]/g, ""),
          10
        )
      : 0;

    const starRating = getStarRatingFromElement(
      document.querySelector("#desktop_qualifiedBuyBox #tbb_mr_star_dp i")
    );

    const deliveryTimeElement = document.querySelector("#deliveryBlockMessage");
    const deliveryTime = deliveryTimeElement
      ? deliveryTimeElement.innerText
      : "";

    const shippingSource =
      document.querySelector("#fulfillerInfoFeature_feature_div")?.innerText ||
      "";
    const sellerName =
      document.querySelector("#merchantInfoFeature_feature_div")?.innerText ||
      "";

    return {
      condition,
      price: price - point,
      point,
      ratingCount: getRatingCount(),
      starRating,
      deliveryTime,
      shipmentType: shippingSource.includes("Amazon") ? "FBA" : "FBM",
      sellerName,
      button: addToCartButton,
    };
  } catch (error) {
    console.error("Buyboxセラー情報取得中にエラーが発生:", error);
    return null;
  }
}

/**
 * 星評価を要素から取得する関数
 * @param {HTMLElement} element - 星評価を含む要素
 * @returns {number} 星評価値
 */
function getStarRatingFromElement(element) {
  if (!element) {
    console.log("星評価要素が見つかりません");
    return 0;
  }

  const starClass = element.className.match(
    /a-star-brand-mini-([0-9]+(?:-[0-9]+)?)/
  );
  if (!starClass || !starClass[1]) {
    console.log("星評価クラスが見つからないか、不正なフォーマットです");
    return 0;
  }

  return parseFloat(starClass[1].replace("-", "."));
}

/**
 * 評価数を取得する関数
 * @returns {number} 評価数
 */
function getRatingCount() {
  const ratingElement = document.querySelector(
    "#desktop_qualifiedBuyBox #tbb_mr_star_dp"
  );
  if (!ratingElement) return 0;

  const count = ratingElement.innerText.replace(/[^0-9]/g, "");
  return count ? parseInt(count, 10) : 0;
}

/**
 * 販売者が購入条件を満たしているか確認する関数
 * @param {SellerInfo} seller - 販売者情報
 * @returns {boolean} 条件を満たしている場合はtrue
 */
function isSellerMeetingThreshold(seller) {
  if (!threshold) return true;

  const conditions = [
    {
      check: threshold.condition,
      validate: () => seller.condition === threshold.condition,
    },
    { check: threshold.price, validate: () => seller.price <= threshold.price },
    {
      check: threshold.rating,
      validate: () => seller.ratingValue >= threshold.rating,
    },
    {
      check: threshold.ratingCount,
      validate: () => seller.ratingCount >= threshold.ratingCount,
    },
    {
      check: threshold.starRating,
      validate: () => seller.starRating >= threshold.starRating,
    },
    { check: threshold.isFBA, validate: () => seller.shipmentType === "FBA" },
    {
      check: threshold.isAmazon,
      validate: () => seller.sellerName === "Amazon.co.jp",
    },
    {
      check: threshold.days,
      validate: () => isDeliveryWithinDays(seller.deliveryTime, threshold.days),
    },
  ];

  return conditions.every(
    (condition) => !condition.check || condition.validate()
  );
}

/**
 * テキストコンテンツを取得するヘルパー関数
 * @param {string} selector - CSS セレクタ
 * @param {HTMLElement} baseElement - 基準となる要素
 * @returns {string} 取得したテキスト
 */
function getTextContent(selector, baseElement) {
  const element = baseElement.querySelector(selector);
  return element ? element.innerText.trim() : "";
}

/**
 * 指定した日数以内に配送されるかを判定する関数
 * @param {string} deliveryTime - 配送予定日文字列
 * @param {number} days - 指定日数
 * @returns {boolean} 指定日数以内に配送される場合はtrue
 */
function isDeliveryWithinDays(deliveryTime, days) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dateMatch = deliveryTime.match(
      /(\d{1,2})月(\d{1,2})日(?:-(\d{1,2})月)?(\d{1,2})?日?/
    );
    if (!dateMatch) return false;

    const currentYear = today.getFullYear();
    const [, startMonth, startDay, endMonthStr, endDayStr] = dateMatch;
    const endMonth = endMonthStr
      ? parseInt(endMonthStr, 10)
      : parseInt(startMonth, 10);
    const endDay = endDayStr ? parseInt(endDayStr, 10) : parseInt(startDay, 10);

    let startDate = new Date(
      currentYear,
      parseInt(startMonth, 10) - 1,
      parseInt(startDay, 10)
    );
    let endDate = new Date(currentYear, endMonth - 1, endDay);

    // 年またぎの処理
    if (
      startMonth > endMonth ||
      (startMonth === endMonth && startDay > endDay)
    ) {
      endDate.setFullYear(currentYear + 1);
      if (startDate < today) {
        startDate.setFullYear(currentYear + 1);
      }
    }

    const limitDate = new Date(today);
    limitDate.setDate(today.getDate() + days);

    return startDate <= limitDate && endDate >= today;
  } catch (error) {
    console.error("配送日数判定中にエラーが発生:", error);
    return false;
  }
}
