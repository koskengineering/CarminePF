class GASMonitor {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.gasUrl = "https://script.google.com/macros/s/AKfycbyDVq-9D_l7Hz7G-wn9lWYemOP0d9T2byuWKDodSQrb2VBqH2IHQ-0LUasIKgYtzeCW/exec?action=getInfo";
    this.init();
  }

  init() {
    this.loadConfig();
    this.bindEvents();
    this.updateUI();
  }

  async loadConfig() {
    try {
      //const result = await chrome.storage.local.get(['gasUrl']);
      const result = {
        gasUrl:
          "https://script.google.com/macros/s/AKfycbyDVq-9D_l7Hz7G-wn9lWYemOP0d9T2byuWKDodSQrb2VBqH2IHQ-0LUasIKgYtzeCW/exec?action=getInfo",
      };
      if (result.gasUrl) {
        this.gasUrl = result.gasUrl;
        document.getElementById("gasUrl").value = this.gasUrl;
      }
    } catch (error) {
      this.log("設定の読み込みに失敗: " + error.message, "error");
    }
  }

  async checkGoogleAuth() {
    this.log("Google認証状態を確認中...", "info");

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: "checkGoogleAuth" },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          }
        );
      });

      if (response.success) {
        if (response.isAuthenticated) {
          this.log(
            `Google認証OK - ユーザー: ${response.userInfo || "不明"}`,
            "success"
          );
        } else {
          this.log(
            "Google認証が必要です。Googleにログインしてください。",
            "warning"
          );
          // Googleログインページを開く
          await chrome.tabs.create({
            url: "https://accounts.google.com/signin",
          });
        }
      } else {
        this.log("認証確認エラー: " + response.error, "error");
      }
    } catch (error) {
      this.log("認証確認失敗: " + error.message, "error");
    }
  }

  async saveConfig() {
    const url = document.getElementById("gasUrl").value.trim();
    if (!url) {
      this.log("URLを入力してください", "error");
      return;
    }

    if (!url.includes("script.google.com")) {
      this.log("有効なGAS URLを入力してください", "error");
      return;
    }

    try {
      await chrome.storage.local.set({ gasUrl: url });
      this.gasUrl = url;
      this.log("設定を保存しました", "success");
    } catch (error) {
      this.log("設定の保存に失敗: " + error.message, "error");
    }
  }

  bindEvents() {
    document.getElementById("saveConfig").addEventListener("click", () => {
      this.saveConfig();
    });

    document.getElementById("checkAuth").addEventListener("click", () => {
      this.checkGoogleAuth();
    });

    document.getElementById("startBtn").addEventListener("click", () => {
      this.start();
    });

    document.getElementById("stopBtn").addEventListener("click", () => {
      this.stop();
    });
  }

  start() {
    if (!this.gasUrl) {
      this.log("GAS URLを設定してください", "error");
      return;
    }

    if (this.isRunning) {
      this.log("既に監視中です", "warning");
      return;
    }

    this.isRunning = true;
    this.log("監視を開始しました", "success");
    this.updateUI();

    // 即座に最初のリクエストを送信
    this.sendRequest();

    // 5分ごとに定期実行
    this.intervalId = setInterval(() => {
      this.sendRequest();
    }, 5 * 60 * 1000); // 5分 = 300秒 = 300,000ミリ秒
  }

  stop() {
    if (!this.isRunning) {
      this.log("監視は停止中です", "warning");
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.log("監視を停止しました", "info");
    this.updateUI();
  }

  async sendRequest() {
    if (!this.isRunning) return;

    this.log("GASにリクエストを送信中...", "info");
    this.updateStatus("GASに接続中...");

    try {
      // Background Scriptを経由してCookie付きリクエストを送信
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "fetchGAS",
            url: this.gasUrl,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          }
        );
      });

      if (!response.success) {
        // 認証エラーの場合は特別な処理
        if (response.error.includes("認証が必要")) {
          this.log("認証エラー: Googleにログインが必要です", "error");
          this.updateStatus("認証エラー");

          // Googleログインページを開く
          await chrome.tabs.create({
            url: "https://accounts.google.com/signin",
          });
          this.log("Googleログインページを開きました", "info");
          return;
        }

        throw new Error(response.error);
      }

      const data = response.data;

      if (data && data.info && data.info.url) {
        this.log(`情報を受信しました: ${data.info.url}`, "success");
        this.updateStatus("新しいタブでURLを開いています...");

        // 新しいタブでURLを開く
        await chrome.tabs.create({ url: data.info.url });

        // URLを開いた後、再度リクエストを送信
        this.log("URLを開きました。再度リクエストを送信します...", "info");
        setTimeout(() => {
          if (this.isRunning) {
            this.sendRequest();
          }
        }, 1000);
      } else {
        this.log("情報なし - 次回まで待機", "info");
        this.updateStatus("待機中（次回: " + this.getNextRequestTime() + "）");
      }
    } catch (error) {
      this.log("リクエストエラー: " + error.message, "error");
      this.updateStatus("エラー: " + error.message);

      // 認証エラー以外の場合はフォールバックを試行
      if (!error.message.includes("認証")) {
        this.log(
          "フォールバック: 直接Cookie付きリクエストを試行します...",
          "info"
        );
        try {
          const response = await fetch(this.gasUrl, {
            method: "GET",
            mode: "cors",
            credentials: "include", // Cookieを含める
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const responseText = await response.text();

          // HTMLページが返された場合（認証が必要な場合）
          if (
            responseText.trim().startsWith("<!DOCTYPE") ||
            responseText.trim().startsWith("<html")
          ) {
            this.log("フォールバック失敗: Googleログインが必要です", "error");
            await chrome.tabs.create({
              url: "https://accounts.google.com/signin",
            });
            return;
          }

          const data = JSON.parse(responseText);

          if (data && data.info && data.info.url) {
            this.log(
              `フォールバック成功 - 情報を受信: ${data.info.url}`,
              "success"
            );
            this.updateStatus("新しいタブでURLを開いています...");

            await chrome.tabs.create({ url: data.info.url });

            this.log("URLを開きました。再度リクエストを送信します...", "info");
            setTimeout(() => {
              if (this.isRunning) {
                this.sendRequest();
              }
            }, 1000);
          } else {
            this.log("フォールバック - 情報なし", "info");
            this.updateStatus(
              "待機中（次回: " + this.getNextRequestTime() + "）"
            );
          }
        } catch (fallbackError) {
          this.log("フォールバックも失敗: " + fallbackError.message, "error");
          this.updateStatus("接続エラー");
        }
      }
    }
  }

  getNextRequestTime() {
    const now = new Date();
    const nextTime = new Date(now.getTime() + 5 * 60 * 1000);
    return nextTime.toLocaleTimeString();
  }

  updateUI() {
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");

    if (this.isRunning) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      this.updateStatus("監視中...");
    } else {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      this.updateStatus("停止中");
    }
  }

  updateStatus(message) {
    const statusEl = document.getElementById("status");
    statusEl.textContent = message;

    if (message.includes("エラー")) {
      statusEl.className = "status error";
    } else if (message.includes("成功") || message.includes("受信")) {
      statusEl.className = "status success";
    } else {
      statusEl.className = "status waiting";
    }
  }

  log(message, type = "info") {
    const logsEl = document.getElementById("logs");
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement("div");

    let prefix = "";
    switch (type) {
      case "error":
        prefix = "❌ ";
        break;
      case "success":
        prefix = "✅ ";
        break;
      case "warning":
        prefix = "⚠️ ";
        break;
      default:
        prefix = "ℹ️ ";
    }

    logEntry.textContent = `${timestamp} ${prefix}${message}`;
    logsEl.appendChild(logEntry);
    logsEl.scrollTop = logsEl.scrollHeight;

    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}

// サイドパネルが読み込まれたときにモニターを初期化
document.addEventListener("DOMContentLoaded", () => {
  window.gasMonitor = new GASMonitor();
});
