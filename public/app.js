const STORAGE_KEY = "tonight_reception_v1";

const BOX_FEE = 10000;
const ENTRY_FEE = 1000;
const DRINK_FEE = 500;
const CASH_DENOMINATIONS = [
  10000,
  5000,
  1000,
  500,
  100,
  50,
  10
];

const screen = document.getElementById("app");
const backBtn = document.getElementById("backBtn");

let pageHistory = [];

let state = createInitialState();
let currentRender = null;

function createInitialState() {
  return {
    initialized: false,

    startCash: 0,

    startCashBreakdown: {},

    drinkTickets: 0,

    totals: {
      general: 0,
      tmp: 0,
      grossEntrance: 0,
      totalDiscount: 0
    },

    receptionHistory: [],

    currentReception: null
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return createInitialState();
  }

  try {
    const parsed = JSON.parse(raw);

    parsed.totals = {
      general: 0,
      tmp: 0,
      grossEntrance: 0,
      totalDiscount: 0,
      ...(parsed.totals || {})
    };

    parsed.receptionHistory =
      parsed.receptionHistory || [];

    parsed.startCashBreakdown =
      parsed.startCashBreakdown || {};

    return parsed;
  } catch {
    return createInitialState();
  }
}

function saveState() {
  // 回ごとのデータとして保存（アーカイブ済みの回は「保存確認」付きの作業コピーを編集）
  if (!ctx) return;
  if (ctx.mode === "archive") {
    ctx.dirty = true;
    return;
  }
  ctx.ev.state = state;
  ctx.ev.u.rec = Date.now();
  persistDb();
}

function navigate(renderFunc) {
  pageHistory.push(renderFunc);
  currentRender = renderFunc;

  renderFunc();

  updateBackButton();
}

function back() {
  if (pageHistory.length <= 1) {
    return;
  }

  // 回の一覧に戻るとき、アーカイブの未保存変更を確認する
  if (pageHistory[pageHistory.length - 2] === renderEventList && !leaveEvent()) {
    return;
  }

  pageHistory.pop();

  const previous =
    pageHistory[pageHistory.length - 1];

  currentRender = previous;
  previous();

  updateBackButton();
}

function updateBackButton() {
  if (pageHistory.length <= 1) {
    backBtn.classList.add("hidden");
  } else {
    backBtn.classList.remove("hidden");
  }
}

backBtn.addEventListener(
  "click",
  back
);

function tallyString(count) {

  let result = "";

  const groups = Math.floor(count / 5);

  for (let i = 0; i < groups; i++) {
    result += "||||/ ";
  }

  result += "|".repeat(count % 5);

  return result;
}

function getTotalPeople() {

  return (
    state.totals.general +
    state.totals.tmp
  );
}

function getLastReception() {

  if (
    state.receptionHistory.length === 0
  ) {
    return null;
  }

  return state.receptionHistory[0];
}

function formatMoney(value) {

  return value.toLocaleString("ja-JP");
}

function formatSignedMoney(value) {

  const sign =
    value >= 0
      ? "+"
      : "-";

  return `${sign}¥${formatMoney(Math.abs(value))}`;
}

function getReceptionTotal() {

  return state.receptionHistory
    .reduce(
      (sum, reception) =>
        sum + reception.totalAmount,
      0
    );
}

function getDiscountCounts(receptions) {

  const counts = {
    500: 0,
    1000: 0
  };

  receptions.forEach(
    reception => {

      (reception.guests || [])
        .forEach(
          guest => {

            if (
              guest.discount === 500 ||
              guest.discount === 1000
            ) {
              counts[guest.discount]++;
            }
          }
        );
    }
  );

  return counts;
}

function renderDiscountCounts(counts) {

  if (
    counts[500] === 0 &&
    counts[1000] === 0
  ) {
    return `
      <div class="sub-text">
        割引なし
      </div>
    `;
  }

  return `
    <div class="discount-counts">
      <div>
        <span>¥500OFF</span>
        <strong>${counts[500]}人</strong>
      </div>
      <div>
        <span>¥1,000OFF</span>
        <strong>${counts[1000]}人</strong>
      </div>
    </div>
  `;
}

function renderCashBreakdown(breakdown) {

  const hasBreakdown =
    CASH_DENOMINATIONS
      .some(
        value =>
          Number(breakdown[value] || 0) > 0
      );

  if (!hasBreakdown) {
    return `
      <div class="sub-text">
        金種別枚数は保存されていません
      </div>
    `;
  }

  return CASH_DENOMINATIONS
    .map(
      value => {

        const count =
          Number(
            breakdown[value] || 0
          );

        return `
          <div class="row compact-row">
            <span>
              ${formatMoney(value)}円
            </span>
            <strong>
              ${count}枚
            </strong>
          </div>
        `;
      }
    )
    .join("");
}

function renderSetup() {

  screen.innerHTML = `
  
  <div class="card">

    <div class="card-title">
      会計準備
    </div>

    ${renderCashInputs()}

    <div class="row">
      <label>
        ドリンクチケット枚数
      </label>

      <input
        id="ticketCount"
        type="number"
        value="${
          state.drinkTickets
        }"
      >
    </div>

    <button
      class="btn btn-primary btn-large"
      id="startEventBtn"
    >
      受付開始
    </button>

  </div>
  `;

  document
    .getElementById("startEventBtn")
    .addEventListener(
      "click",
      startEvent
    );
}

function renderCashInputs(breakdown = {}) {

  return CASH_DENOMINATIONS
    .map(
      value => {

        const count =
          Number(
            breakdown[value] || 0
          );

        return `
      <div class="row">

        <label>
          ${value.toLocaleString()}円
        </label>

        <input
          type="number"
          min="0"
          value="${count}"
          data-cash="${value}"
        >

      </div>
    `;
      }
    )
    .join("");
}

function readCashInputState() {

  let total = 0;
  const startCashBreakdown = {};

  document
    .querySelectorAll("[data-cash]")
    .forEach(input => {

      const value =
        Number(
          input.dataset.cash
        );

      const count =
        Number(
          input.value || 0
        );

      total += value * count;
      startCashBreakdown[value] = count;
    });

  return {
    total,
    startCashBreakdown
  };
}

function startEvent() {

  const cashState =
    readCashInputState();

  state.startCash = cashState.total;
  state.startCashBreakdown =
    cashState.startCashBreakdown;

  state.drinkTickets =
    Number(
      document.getElementById(
        "ticketCount"
      ).value
    );

  state.initialized = true;

  saveState();

  navigate(renderHome);
}

function renderEditStartCash() {

  screen.innerHTML = `

  <div class="card">

    <div class="card-title">
      初期金庫額を編集
    </div>

    ${renderCashInputs(
      state.startCashBreakdown
    )}

    <button
      class="btn btn-primary btn-large"
      id="saveStartCashBtn"
    >
      保存
    </button>

  </div>
  `;

  document
    .getElementById(
      "saveStartCashBtn"
    )
    .onclick = () => {

      const cashState =
        readCashInputState();

      state.startCash =
        cashState.total;

      state.startCashBreakdown =
        cashState.startCashBreakdown;

      saveState();

      navigate(renderHome);
    };
}

function renderEditDrinkTickets() {

  screen.innerHTML = `

  <div class="card">

    <div class="card-title">
      ドリチケ枚数を編集
    </div>

    <div class="row">
      <label>
        ドリンクチケット残数
      </label>

      <input
        id="editTicketCount"
        type="number"
        min="0"
        value="${state.drinkTickets}"
      >
    </div>

    <button
      class="btn btn-primary btn-large"
      id="saveDrinkTicketsBtn"
    >
      保存
    </button>

  </div>
  `;

  document
    .getElementById(
      "saveDrinkTicketsBtn"
    )
    .onclick = () => {

      state.drinkTickets =
        Number(
          document
            .getElementById(
              "editTicketCount"
            )
            .value ||
            0
        );

      saveState();

      navigate(renderHome);
    };
}

function renderHome() {

  const last =
    getLastReception();

  const totalDiscountCounts =
    getDiscountCounts(
      state.receptionHistory
    );

  screen.innerHTML = `
  
  <div class="card">

    <div class="card-title">
      来場状況
    </div>

    <div class="stats-grid">

      <div class="stat">

        <div class="stat-label">
          一般
        </div>

        <div class="stat-value">
          ${state.totals.general}
        </div>

        <div class="tally">
          ${tallyString(
            state.totals.general
          )}
        </div>

      </div>

      <div class="stat">

        <div class="stat-label">
          TMP
        </div>

        <div class="stat-value">
          ${state.totals.tmp}
        </div>

        <div class="tally">
          ${tallyString(
            state.totals.tmp
          )}
        </div>

      </div>

      <div class="stat">

        <div class="stat-label">
          合計
        </div>

        <div class="stat-value">
          ${getTotalPeople()}
        </div>

      </div>

    </div>

    <div class="discount-count-block">
      <div class="section-label">
        うち割引入場人数
      </div>
      ${renderDiscountCounts(
        totalDiscountCounts
      )}
    </div>

  </div>

  <div class="card">

    <div class="card-title">
      直近受付
    </div>

    ${
      last
        ? `
        <div>
          ${last.timestamp}
        </div>

        <div>
          一般 ${last.general}名
        </div>

        <div>
          TMP ${last.tmp}名
        </div>

        <div class="discount-count-block">
          <div class="section-label">
            うち割引入場人数
          </div>
          ${renderDiscountCounts(
            getDiscountCounts([last])
          )}
        </div>
      `
        : "まだ受付履歴はありません"
    }

  </div>

  <button
    class="btn btn-primary btn-large"
    id="newReceptionBtn"
  >
    新規受付
  </button>

  <br><br>

  <button
    class="btn btn-secondary btn-large"
    id="historyBtn"
  >
    履歴
  </button>

  <br><br>

  <button
    class="btn btn-secondary btn-large"
    id="resultBtn"
  >
    リザルト(精算画面へ)
  </button>

  <br><br>
  <br><br>
  <br><br>
  <br><br>

  <div class="card drink-ticket-card">

    <div class="card-title">
      ドリチケ残数
    </div>

    <div class="ticket-count">
      ${state.drinkTickets}
      <span>枚</span>
    </div>

    <button
      class="btn btn-secondary"
      id="editDrinkTicketsBtn"
    >
      ドリチケ枚数を編集
    </button>

  </div>

  <div class="card">

    <div class="card-title">
      初期金庫額
    </div>

    <div class="row">

      <span>
        合計
      </span>

      <strong>
        ¥${formatMoney(state.startCash)}
      </strong>

    </div>

    ${renderCashBreakdown(
      state.startCashBreakdown
    )}

    <br>

    <button
      class="btn btn-secondary"
      id="editStartCashBtn"
    >
      初期金庫額を編集
    </button>

  </div>


  <br><br>

  <button
    class="btn btn-danger btn-large"
    id="clearEventBtn"
  >
    イベントデータを一括削除
  </button>
  `;

  document
    .getElementById(
      "newReceptionBtn"
    )
    .addEventListener(
      "click",
      () => navigate(
        renderReceptionInput
      )
    );

  document
    .getElementById(
      "historyBtn"
    )
    .addEventListener(
      "click",
      () => navigate(
        renderHistory
      )
    );

  document
    .getElementById(
      "resultBtn"
    )
    .addEventListener(
      "click",
      () => navigate(
        renderResult
      )
    );

  document
    .getElementById(
      "editStartCashBtn"
    )
    .addEventListener(
      "click",
      () => navigate(
        renderEditStartCash
      )
    );

  document
    .getElementById(
      "editDrinkTicketsBtn"
    )
    .addEventListener(
      "click",
      () => navigate(
        renderEditDrinkTickets
      )
    );

  document
    .getElementById(
      "clearEventBtn"
    )
    .addEventListener(
      "click",
      clearEventData
    );
}

function renderReceptionInput() {

  screen.innerHTML = `

  <div class="card reception-card">

    <div class="card-title">
      新規受付
    </div>

    <div class="reception-counter-list">

      <div class="counter-row">

        <div class="counter-label">
          <span>一般</span>
          <small>通常来場者</small>
        </div>

        <div class="counter">

          <button
            class="counter-btn"
            id="generalMinus"
          >
            −
          </button>

          <div
            class="counter-value"
            id="generalCount"
          >
            0
          </div>

          <button
            class="counter-btn"
            id="generalPlus"
          >
            +
          </button>

        </div>

      </div>

      <div class="counter-row">

        <div class="counter-label">
          <span>TMP</span>
          <small>関係者・招待</small>
        </div>

        <div class="counter">

          <button
            class="counter-btn"
            id="tmpMinus"
          >
            −
          </button>

          <div
            class="counter-value"
            id="tmpCount"
          >
            0
          </div>

          <button
            class="counter-btn"
            id="tmpPlus"
          >
            +
          </button>

        </div>

      </div>

    </div>

    <div class="reception-total">
      <span>合計</span>
      <strong id="receptionTotalCount">0名</strong>
    </div>

    <div id="tmpNamesContainer" style="display:none; margin-top:16px; padding-top:16px; border-top:1px solid var(--border);">
      <div class="section-label">
        TMPメンバーは名前を記録
      </div>
      <div id="tmpNamesList" style="display:grid; gap:8px; margin-bottom:8px;">
      </div>
      
    </div>

    <button
      class="btn btn-primary btn-large"
      id="goDiscount"
    >
      次へ
    </button>

  </div>
  `;

  let general = 0;
  let tmp = 0;
  let tmpNames = [];

  const refresh = () => {

    document.getElementById(
      "generalCount"
    ).textContent = general;

    document.getElementById(
      "tmpCount"
    ).textContent = tmp;

    document.getElementById(
      "receptionTotalCount"
    ).textContent =
      `${general + tmp}名`;

    // TMP名入力欄の表示制御
    const container = document.getElementById(
      "tmpNamesContainer"
    );
    if (tmp > 0) {
      container.style.display = "block";
      updateTmpNamesList();
    } else {
      container.style.display = "none";
      tmpNames = [];
    }
  };

  const updateTmpNamesList = () => {
    const listContainer = document.getElementById(
      "tmpNamesList"
    );
    listContainer.innerHTML = tmpNames
      .map((name, index) => `
        <div style="display:flex; gap:8px; align-items:center;">
          <input 
            type="text" 
            value="${name}" 
            placeholder="名前を入力"
            data-index="${index}"
            class="tmp-name-input"
            style="flex:1; padding:10px; border:1px solid var(--border); border-radius:8px; font-size:14px;"
          >
          <button 
            class="tmp-name-delete"
            data-index="${index}"
            style="width:40px; height:40px; padding:0; border:1px solid var(--danger); background:white; color:var(--danger); border-radius:8px; font-weight:bold; cursor:pointer;"
          >
            削
          </button>
        </div>
      `)
      .join("");

    // 名前入力フィールドの変更イベント
    document.querySelectorAll(".tmp-name-input").forEach(input => {
      input.addEventListener("change", (e) => {
        const index = parseInt(e.target.dataset.index);
        tmpNames[index] = e.target.value;
      });
    });

    // 削除ボタンのイベント
    document.querySelectorAll(".tmp-name-delete").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const index = parseInt(e.target.dataset.index);
        tmpNames.splice(index, 1);
        tmp--;
        refresh();
      });
    });
  };

  refresh();

  document
    .getElementById("generalPlus")
    .onclick = () => {
      general++;
      refresh();
    };

  document
    .getElementById("generalMinus")
    .onclick = () => {
      if (general > 0) {
        general--;
        refresh();
      }
    };

  document
    .getElementById("tmpPlus")
    .onclick = () => {
      tmp++;
      tmpNames.push("");
      refresh();
    };

  document
    .getElementById("tmpMinus")
    .onclick = () => {
      if (tmp > 0) {
        tmp--;
        tmpNames.pop();
        refresh();
      }
    };

  document
    .getElementById("goDiscount")
    .onclick = () => {

      const total =
        general + tmp;

      if (total === 0) {

        alert(
          "人数を入力してください"
        );

        return;
      }

      // TMP客の名前入力チェック
      if (tmp > 0) {
        const emptyNames = tmpNames.filter(
          name => !name || name.trim() === ""
        );
        
        if (emptyNames.length > 0) {
          alert(
            "TMPメンバーの名前を全て入力してください"
          );
          return;
        }
      }

      state.currentReception = {

        general,
        tmp,

        guests: []
      };

      for (
        let i = 0;
        i < general;
        i++
      ) {

        state.currentReception
          .guests.push({

          type: "general",

          discount: 0

        });
      }

      for (
        let i = 0;
        i < tmp;
        i++
      ) {

        state.currentReception
          .guests.push({

          type: "tmp",

          discount: 0,

          name: tmpNames[i] || ""

        });
      }

      navigate(
        renderDiscountScreen
      );
    };
}

function renderDiscountScreen() {

  const guests =
    state.currentReception.guests;

  let html = `

  <div class="card">

    <div class="card-title">
      割引設定
    </div>
  `;

  guests.forEach(
    (guest,index) => {

      html += `

      <div class="discount-card">

        <div class="discount-card-header">

          <strong>

            ${
              guest.type === "tmp"
                ? guest.name || "TMP来場者"
                : `来場者 ${index + 1}`
            }

          </strong>

          <span class="guest-type">

            ${
              guest.type ===
              "general"
                ? "一般"
                : "TMP"
            }

          </span>

        </div>

        <div
          class="discount-options"
        >

          <div
            class="discount-option"
          >

            <button
              class="${guest.discount === 0 ? "active" : ""}"
              onclick="
              setDiscount(
              ${index},
              0
              )"
            >

              通常

            </button>

          </div>

          <div
            class="discount-option"
          >

            <button
              class="${guest.discount === 500 ? "active" : ""}"
              onclick="
              setDiscount(
              ${index},
              500
              )"
            >

              -500

            </button>

          </div>

          <div
            class="discount-option"
          >

            <button
              class="${guest.discount === 1000 ? "active" : ""}"
              onclick="
              setDiscount(
              ${index},
              1000
              )"
            >

              -1000

            </button>

          </div>

        </div>

        <div class="discount-current">

          現在:
          ¥${guest.discount}

        </div>

      </div>
      `;
    }
  );

  html += `

    <button
      class="
      btn
      btn-primary
      btn-large
      "
      id="proceedPayment"
    >

      会計へ

    </button>

  </div>
  `;

  screen.innerHTML = html;

  document
    .getElementById(
      "proceedPayment"
    )
    .onclick = () =>
      navigate(
        renderPaymentScreen
      );
}

function setDiscount(
  index,
  discount
) {

  state
    .currentReception
    .guests[index]
    .discount = discount;

  renderDiscountScreen();
}

function renderPaymentScreen() {

  const guests =
    state.currentReception.guests;

  let total = 0;

  guests.forEach(
    guest => {

      total +=

        ENTRY_FEE +

        DRINK_FEE -

        guest.discount;
    }
  );

  state.currentReception
    .totalAmount = total;

  screen.innerHTML = `

  <div class="card payment-card">

    <div class="card-title">
      お支払い金額
    </div>

    <div
      class="money-display"
    >

      <div class="amount">

        ¥${formatMoney(
          total
        )}

      </div>

    </div>

    <div class="form-row">

      <label>

        預かり金額

      </label>

      <input
        id="paidAmount"
        type="number"
      >

    </div>

    <button
      class="
      btn
      btn-primary
      btn-large
      "
      id="calcChangeBtn"
    >

      次へ

    </button>

  </div>
  `;

  document
    .getElementById(
      "calcChangeBtn"
    )
    .onclick = () => {

      const paid = Number(
        document
          .getElementById(
            "paidAmount"
          )
          .value
      );

      if (
        paid < total
      ) {

        alert(
          "預かり金額不足"
        );

        return;
      }

      state.currentReception
        .paidAmount = paid;

      state.currentReception
        .change =
          paid - total;

      navigate(
        renderChecklist
      );
    };
}

function renderChecklist() {

  const reception =
    state.currentReception;

  screen.innerHTML = `

  <div class="card checklist-card">

    <div class="card-title">
      受付確認
    </div>

    <div class="money-display">

      <div class="label">
        お釣り
      </div>

      <div class="amount">

        ¥${formatMoney(
          reception.change
        )}

      </div>

    </div>

    <div class="checklist">

      <label>

        <input
          type="checkbox"
          id="checkTicket"
        >

        <span>ドリンクチケットを渡した</span>

      </label>

      <label>

        <input
          type="checkbox"
          id="checkMoney"
        >

        <span>お金を受け取った</span>

      </label>

      <label>

        <input
          type="checkbox"
          id="checkChange"
        >

        <span>お釣りを渡した</span>

      </label>

    </div>

    <br>

    <button
      class="
      btn
      btn-primary
      btn-large
      "
      id="completeReceptionBtn"
    >

      受付完了

    </button>

  </div>
  `;

  document
    .getElementById(
      "completeReceptionBtn"
    )
    .onclick =
      completeReception;
}

function completeReception() {

  const ticket =
    document.getElementById(
      "checkTicket"
    ).checked;

  const money =
    document.getElementById(
      "checkMoney"
    ).checked;

  const change =
    document.getElementById(
      "checkChange"
    ).checked;

  if (
    !ticket ||
    !money ||
    !change
  ) {

    alert(
      "全項目確認してください"
    );

    return;
  }

  const reception =
    state.currentReception;

  const grossEntrance =
    reception.guests.length *
    (ENTRY_FEE + DRINK_FEE);

  const totalDiscount =
    reception.guests.reduce(
      (sum, guest) =>
        sum + guest.discount,
      0
    );

  const timestamp =
    new Date()
      .toLocaleString(
        "ja-JP"
      );

  const historyEntry = {

    id:
      Date.now(),

    timestamp,

    general:
      reception.general,

    tmp:
      reception.tmp,

    guests:
      structuredClone(
        reception.guests
      ),

    totalAmount:
      reception.totalAmount,

    grossEntrance,

    totalDiscount,

    paidAmount:
      reception.paidAmount,

    change:
      reception.change
  };

  state.receptionHistory
    .unshift(
      historyEntry
    );

  state.totals.general +=
    reception.general;

  state.totals.tmp +=
    reception.tmp;

  state.totals.grossEntrance +=
    grossEntrance;

  state.totals.totalDiscount +=
    totalDiscount;

  state.drinkTickets -=

    (
      reception.general +
      reception.tmp
    );

  saveState();

  renderSuccessScreen();
}

function renderSuccessScreen() {
  
  backBtn.classList.add('hidden');
  const latest =
    state.receptionHistory[0];

  screen.innerHTML = `

  <div class="success-screen">

    <div class="success-icon">
      ✓
    </div>

    <div class="success-text">
      受付完了
    </div>

    <div class="success-subtext">
      3秒後にホームへ戻ります
    </div>

    <div class="success-summary">

      <div>
        <span>受付時刻</span>
        <strong>${latest.timestamp}</strong>
      </div>

      <div>
        <span>一般</span>
        <strong>${latest.general}名</strong>
      </div>

      <div>
        <span>TMP</span>
        <strong>${latest.tmp}名</strong>
      </div>

      <div>
        <span>支払い金額</span>
        <strong>¥${formatMoney(latest.totalAmount)}</strong>
      </div>

    </div>

  </div>
  `;

  setTimeout(
    () => {

      state.currentReception =
        null;

      navigate(
        renderHome
      );

    },
    3000
  );
}

function renderHistory() {

  let html = `

  <div class="card">

    <div class="card-title">

      受付履歴

    </div>
  `;

  if (
    state.receptionHistory
      .length === 0
  ) {

    html += `
      履歴はありません
    `;
  } else {

    html += `

      <button
        class="
        btn
        btn-danger
        "
        id="clearReceptionHistoryBtn"
      >

        受付履歴を一括削除

      </button>

      <br><br>
    `;
  }

  state.receptionHistory
    .forEach(
      entry => {

        const discountCounts =
          getDiscountCounts([entry]);

        html += `

        <div
          class="
          history-item
          "
        >

          <div
            class="
            history-time
            "
          >

            ${
              entry.timestamp
            }

          </div>

          <div>

            一般
            ${
              entry.general
            }名

          </div>

          <div>

            TMP
            ${
              entry.tmp
            }名

          </div>

          <div>

            ¥${formatMoney(
              entry.totalAmount
            )}

          </div>

          <div class="discount-count-block">
            <div class="section-label">
              うち割引入場人数
            </div>
            ${renderDiscountCounts(
              discountCounts
            )}
          </div>

          ${entry.tmp > 0 ? `
            <div class="discount-count-block">
              <div class="section-label">
                TMPメンバー受付済
              </div>
              <div style="background:#fafafa; padding:12px; border-radius:12px; border:1px solid var(--border);">
                ${(entry.guests || [])
                  .filter(g => g.type === "tmp")
                  .map(g => `
                    <div style="padding:8px 0; border-bottom:1px solid var(--border);">
                      <span style="font-weight:600;">${g.name || "名前未記入"}</span>
                    </div>
                  `)
                  .join("")}
              </div>
            </div>
          ` : ""}

          <br>

          <button
            class="
            btn
            btn-secondary
            "
            onclick="
            deleteHistory(
            ${
              entry.id
            }
            )
            "
          >

            削除

          </button>

        </div>
        `;
      }
    );

  html += `
  </div>
  `;

  screen.innerHTML = html;

  const clearEventBtn =
    document.getElementById(
      "clearEventBtn"
    );

  if (clearEventBtn) {

    clearEventBtn.onclick =
      clearEventData;
  }

  const clearReceptionHistoryBtn =
    document.getElementById(
      "clearReceptionHistoryBtn"
    );

  if (clearReceptionHistoryBtn) {

    clearReceptionHistoryBtn.onclick =
      clearReceptionHistory;
  }
}

function deleteHistory(id) {

  const target =
    state.receptionHistory
      .find(
        x =>
          x.id === id
      );

  if (!target) return;

  if (
    !confirm(
      "削除しますか？"
    )
  ) {
    return;
  }

  state.totals.general -=
    target.general;

  state.totals.tmp -=
    target.tmp;

  state.totals.grossEntrance -=
    target.grossEntrance ||
    (
      (target.general + target.tmp) *
      (ENTRY_FEE + DRINK_FEE)
    );

  state.totals.totalDiscount -=
    target.totalDiscount ||
    0;

  state.drinkTickets +=

    target.general +
    target.tmp;

  state.receptionHistory =

    state.receptionHistory
      .filter(
        x =>
          x.id !== id
      );

  saveState();

  renderHistory();
}
function clearReceptionHistory() {

  if (
    !confirm(
      "受付履歴をすべて削除しますか？"
    )
  ) {
    return;
  }

  const totalPeople =
    state.totals.general +
    state.totals.tmp;

  state.drinkTickets += totalPeople;

  state.receptionHistory = [];

  state.totals = {
    general: 0,
    tmp: 0,
    grossEntrance: 0,
    totalDiscount: 0
  };

  saveState();

  renderHistory();
}

function clearEventData() {

  if (
    !confirm(
      "イベントデータをすべて削除しますか？\n受付履歴、初期金庫額、ドリチケ枚数も削除されます。"
    )
  ) {
    return;
  }

  state = createInitialState();
  saveState();

  pageHistory = [renderEventList, renderEventPage];
  navigate(renderSetup);
}

function renderResult() {

  const people =

    state.totals.general +

    state.totals.tmp;

  // TMP来場者一覧を集計
  const allTmpGuests = state.receptionHistory
    .flatMap(r => 
      (r.guests || [])
        .filter(g => g.type === "tmp")
        .map(g => ({ name: g.name, timestamp: r.timestamp }))
    );

  const grossEntrance =
    state.receptionHistory
      .reduce(
        (sum, r) =>
          sum +
          (
            r.grossEntrance ||
            (
              (r.general + r.tmp) *
              (ENTRY_FEE + DRINK_FEE)
            )
          ),
        0
      );

  const totalDiscount =
    state.receptionHistory
      .reduce(
        (sum, r) =>
          sum +
          (
            r.totalDiscount ||
            0
          ),
        0
      );

  const discountCounts =
    getDiscountCounts(
      state.receptionHistory
    );

  const entranceIncome =

    grossEntrance -

    totalDiscount;

  const drinkTicketAmount =

    people *

    DRINK_FEE;

  const profitTargetIncome =

    entranceIncome -

    drinkTicketAmount;

  const profit =

    profitTargetIncome -

    BOX_FEE;

  const theoreticalCash =

    state.startCash +

    getReceptionTotal();

  const cashIncrease =
    theoreticalCash -
    state.startCash;

  screen.innerHTML = `

  <div class="card">

    <div class="card-title">

      イベント結果

    </div>

    <div class="stats-grid">

      <div class="stat">

        <div class="stat-label">
          一般
        </div>

        <div class="stat-value">
          ${state.totals.general}
        </div>

      </div>

      <div class="stat">

        <div class="stat-label">
          TMP
        </div>

        <div class="stat-value">
          ${state.totals.tmp}
        </div>

      </div>

      <div class="stat">

        <div class="stat-label">
          合計
        </div>

        <div class="stat-value">
          ${people}
        </div>

      </div>

    </div>
    <div class="discount-count-block">
      <div class="section-label">
        うち割引入場人数
      </div>
      ${renderDiscountCounts(
        discountCounts
      )}
    </div>

    <div class="discount-count-block row">

      <span class="section-label">
        総割引額
      </span>

      <strong>

        ¥${formatMoney(
          totalDiscount
        )}

      </strong>

    </div>

  </div>

 <div class="card">
  ${allTmpGuests.length > 0 ? `
    <div class="discount-count-block">
      <div class="section-label">
        受付済TMPメンバー（${allTmpGuests.length}名）
      </div>

      <div style="
        background:#fafafa;
        padding:12px;
        border-radius:12px;
        border:1px solid var(--border);
        max-height:300px;
        overflow-y:auto;
      ">
        ${allTmpGuests
          .map((guest, idx) => `
            <div style="
              padding:10px 0;
              border-bottom:1px solid var(--border);
              display:flex;
              justify-content:space-between;
              align-items:center;
            ">
              <span style="font-weight:600;">${guest.name}</span>
              <span style="font-size:12px; color:var(--sub);">
                ${guest.timestamp}
              </span>
            </div>
          `)
          .join("")}
      </div>
    </div>
  ` : ""}
</div>

  <div class="card" style="text-align: center; padding: 40px 20px; background:blue; color: white; border-radius: 20px;">
    <div style="font-size: 14px; font-weight: 700; opacity: 0.8; margin-bottom: 16px;">
      精算額
    </div>
    <div style="font-size: 64px; font-weight: 900; margin-bottom: 8px; line-height: 1;">
      ¥${formatMoney(drinkTicketAmount + BOX_FEE)}
    </div>
    <div style="font-size: 13px; opacity: 0.8; line-height: 1.6;">
      <div>1D(ドリチケ)分：¥${formatMoney(drinkTicketAmount)}</div>
      <div style="margin-top: 8px;">箱代：¥10,000</div>
    </div>
  </div>

  <div class="card">
  <div class="stat">

    <div class="row">

      <span>
        入場料+1Dの総額
      </span>

      <strong>

        ¥${formatMoney(
          entranceIncome
        )}

      </strong>

    </div>


    <div class="row">

      <span class="highlight-blue">
        1D(ドリチケ)分
      </span>

      <strong class="highlight-blue">

        ¥${formatMoney(
          drinkTicketAmount
        )}

      </strong>

    </div>

    <div class="row">

      <span>
        利益対象収入
      </span>

      <strong>

        ¥${formatMoney(
          profitTargetIncome
        )}

      </strong>

    </div>

    <div class="row">

      <span class="highlight-blue">
        箱代
      </span>

      <strong class="highlight-blue">

        -¥10,000

      </strong>

    </div>

    <div class="row">

      <span class="highlight-red">
        利益
      </span>

      <strong class="highlight-red">

        ¥${formatMoney(
          profit
        )}

      </strong>

    </div>
    </div>

  </div>


  <div class="card">

    <div class="row">

      <span>
        受付終了時・精算前の金庫額
      </span>

      <strong>

        ¥${formatMoney(
          theoreticalCash
        )}
        (${formatSignedMoney(
          cashIncrease
        )})

      </strong>

    </div>

<div class="row">

      <span>
        精算後の金庫額
      </span>

      <strong>

        ¥${formatMoney(
          theoreticalCash - drinkTicketAmount - 10000
        )}
        (${formatSignedMoney(
          cashIncrease - drinkTicketAmount - 10000
        )})

      </strong>

    </div>

  </div>

  <button
    class="
    btn
    btn-secondary
    btn-large
    "
    id="cashCheckBtn"
  >

    金庫照合

  </button>

  <br><br>

  <button
    class="
    btn
    btn-danger
    btn-large
    "
    id="clearEventBtn"
  >

    イベントデータを一括削除

  </button>

  `;

  document
    .getElementById(
      "cashCheckBtn"
    )
    .onclick =
      () =>
      navigate(
        renderCashCheck
      );

  document
    .getElementById(
      "clearEventBtn"
    )
    .onclick =
      clearEventData;
}

function renderCashCheck() {

  screen.innerHTML = `

  <div class="card">

    <div class="card-title">

      金庫照合

    </div>

      10000円
      <input
      id="c10000"
      type="number">

      5000円
      <input
      id="c5000"
      type="number">

      1000円
      <input
      id="c1000"
      type="number">

      500円
      <input
      id="c500"
      type="number">

      100円
      <input
      id="c100"
      type="number">

      50円
      <input
      id="c50"
      type="number">

      10円
      <input
      id="c10"
      type="number">

      <br><br>

      <button
      id="calcCashBtn"
      class="
      btn
      btn-primary
      btn-large
      ">
      照合
      </button>

  </div>
  `;

  document
    .getElementById(
      "calcCashBtn"
    )
    .onclick =
      calculateCashCheck;
}

function calculateCashCheck() {

  const bills = [
    10000,
    5000,
    1000,
    500,
    100,
    50,
    10
  ];

  const actualCash =
    bills.reduce(
      (sum, value) =>
        sum +
        value *
        Number(
          document
            .getElementById(
              `c${value}`
            )
            .value ||
            0
        ),
      0
    );

    const people =
    state.totals.general +
    state.totals.tmp;

  const drinkTicketAmount =
    people * DRINK_FEE;

  const theoreticalCash =
    state.startCash +
    state.receptionHistory
      .reduce(
        (sum, r) =>
          sum + r.totalAmount,
        0
      );

  const diff =
    actualCash - theoreticalCash + drinkTicketAmount + 10000;

  alert(
    `実金庫額: ¥${formatMoney(actualCash)}\n` +
    `理論金庫額: ¥${formatMoney(theoreticalCash - drinkTicketAmount - 10000)}\n` +
    `差額: ¥${formatMoney(diff)}`
  );
}

/* ==========================================================
   ここから追加：回ごとの管理 / クラウド同期 / フライヤー / バーカウンター
   （既存の受付まわりの関数は変更していません）
   ========================================================== */

const DB_KEY = "tonight_db_v1";
const BAR_CUP = 500;
const BAR_TOLERANCE = 5;

let db = loadDb();
let ctx = null;          // 開いている回 { ev, mode: "live" | "archive", dirty, bar }
let pushTimer = null;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function uid() { return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function createBar() {
  return { startBreakdown: {}, endBreakdown: {}, tally: 0, tickets: 0, remain: "", checks: {} };
}
function newEvent(name, date, st) {
  const t = Date.now();
  return {
    id: uid(), name, date, flyer: 0, archived: false, deleted: false,
    state: st || createInitialState(), bar: createBar(), tt: createTt(),
    u: { meta: t, rec: t, bar: t, tt: t }
  };
}
function loadDb() {
  try {
    const r = localStorage.getItem(DB_KEY);
    if (r) { const d = JSON.parse(r); d.events = d.events || []; return d; }
  } catch {}
  const d = { events: [], updated: 0 };
  // これまでの端末内データ（1回分）を最初の回として引き継ぐ
  const old = loadState();
  if (old.initialized || old.receptionHistory.length) {
    d.events.push(newEvent("過去データ（移行）", todayStr(), old));
  }
  return d;
}

/* ---------- 同期（部分ごとに新しい方を採用してマージ） ---------- */
function mergeInto(t, s) {
  t.events = t.events || [];
  for (const e of (s.events || [])) {
    const o = t.events.find(x => x.id === e.id);
    if (!o) { t.events.push(structuredClone(e)); continue; }
    o.u = o.u || {};
    const eu = e.u || {};
    if ((eu.meta || 0) > (o.u.meta || 0)) {
      for (const k of ["name", "date", "flyer", "archived", "deleted"]) o[k] = e[k];
      o.u.meta = eu.meta;
    }
    if ((eu.rec || 0) > (o.u.rec || 0)) { o.state = structuredClone(e.state); o.u.rec = eu.rec; }
    if ((eu.bar || 0) > (o.u.bar || 0)) { o.bar = structuredClone(e.bar); o.u.bar = eu.bar; }
    if ((eu.tt || 0) > (o.u.tt || 0)) { o.tt = structuredClone(e.tt); o.u.tt = eu.tt; }
  }
  return t;
}
function dbSig() {
  return db.events.map(e => e.id + ":" + ["meta", "rec", "bar", "tt"].map(p => (e.u || {})[p] || 0).join(",")).join("|");
}
function setSync(t) { const e = document.getElementById("sync"); if (e) e.textContent = t; }
function saveLocalDb() { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch {} }
function persistDb() {
  db.updated = Date.now();
  saveLocalDb();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncPush, 1200);
}
async function syncPush() {
  try {
    const r = await fetch("/api/db", { method: "PUT", body: JSON.stringify(db) });
    if (!r.ok) throw 0;
    applyRemote(await r.json());
    setSync("☁ 同期済み");
  } catch { setSync("オフライン（この端末に保存済み）"); }
}
async function syncPull() {
  try {
    const r = await fetch("/api/db", { cache: "no-store" });
    if (!r.ok) throw 0;
    applyRemote(await r.json());
    setSync("☁ 同期済み");
  } catch { setSync("オフライン（この端末に保存済み）"); }
}
function applyRemote(rem) {
  const before = dbSig();
  mergeInto(db, rem);
  if (ctx && ctx.mode === "live") {
    const ev = db.events.find(e => e.id === ctx.ev.id);
    if (ev) {
      ctx.ev = ev;
      if (state !== ev.state) {           // 他端末の受付データの方が新しい場合
        const cur = state.currentReception;
        state = ev.state;
        if (cur) state.currentReception = cur;   // 入力途中の受付は消さない
      }
      ctx.bar = ev.bar;
      ctx.tt = ev.tt || ctx.tt;
    }
  }
  saveLocalDb();
  if (before !== dbSig() && !(ctx && ctx.dirty)) {
    const safe = [renderEventList, renderEventPage, renderHome, renderHistory, renderResult];
    if (safe.includes(currentRender)) currentRender();
  }
}

/* ---------- 保存まわり（既存の saveState から呼ばれる） ---------- */
function saveBar() {
  if (!ctx) return;
  if (ctx.mode === "archive") { ctx.dirty = true; return; }
  ctx.ev.u.bar = Date.now();
  persistDb();
}
function commitCtx() {
  const ev = ctx.ev, t = Date.now();
  ev.state = structuredClone(state);
  ev.bar = structuredClone(ctx.bar);
  ev.tt = structuredClone(ctx.tt);
  ev.u.rec = t; ev.u.bar = t; ev.u.tt = t;
  ctx.dirty = false;
  persistDb();
}
function leaveEvent() {
  if (ctx && ctx.mode === "archive" && ctx.dirty) {
    if (confirm("変更を保存しますか？\n［OK］保存して戻る\n［キャンセル］次の確認へ")) {
      commitCtx();
    } else if (!confirm("保存せずに破棄して戻りますか？\n［OK］変更を破棄して戻る\n［キャンセル］編集に戻る")) {
      return false;
    }
  }
  ctx = null;
  return true;
}
window.addEventListener("beforeunload", e => {
  if (ctx && ctx.mode === "archive" && ctx.dirty) { e.preventDefault(); e.returnValue = ""; }
});

/* ---------- フライヤー ---------- */
function flyerUrl(ev) { return ev.flyer ? `/api/flyer/${ev.id}?v=${ev.flyer}` : ""; }
function resizeImage(file, max = 900) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(), "image/jpeg", 0.8);
    };
    img.onerror = rej;
    img.src = url;
  });
}
async function uploadFlyer(ev, file) {
  try {
    const blob = await resizeImage(file);
    const r = await fetch("/api/flyer/" + ev.id, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
    if (!r.ok) throw 0;
    ev.flyer = (ev.flyer || 0) + 1;
    ev.u.meta = Date.now();
    persistDb();
    return true;
  } catch {
    alert("フライヤーのアップロードに失敗しました（通信状況を確認してください）");
    return false;
  }
}

/* ---------- 集計 ---------- */
function sumCash(o) { return CASH_DENOMINATIONS.reduce((s, v) => s + v * Number(o[v] || 0), 0); }
function barCalc(b) {
  const start = sumCash(b.startBreakdown || {}), end = sumCash(b.endBreakdown || {});
  const hasEnd = end > 0;
  return { start, end, hasEnd, revenue: end - start, cups: (end - start) / BAR_CUP };
}
function evStats(st, bar) {
  const h = st.receptionHistory || [];
  const people = st.totals.general + st.totals.tmp;
  const gross = h.reduce((s, r) => s + (r.grossEntrance || ((r.general + r.tmp) * (ENTRY_FEE + DRINK_FEE))), 0);
  const disc = h.reduce((s, r) => s + (r.totalDiscount || 0), 0);
  const profit = people ? gross - disc - people * DRINK_FEE - BOX_FEE : 0;
  return { people, profit, bar: barCalc(bar || createBar()) };
}

/* ---------- 回の一覧（月ごとの概要） ---------- */
function renderEventList() {
  const evs = db.events.filter(e => !e.deleted).sort((a, b) => b.date.localeCompare(a.date));
  const months = {};
  evs.forEach(e => { (months[e.date.slice(0, 7)] = months[e.date.slice(0, 7)] || []).push(e); });

  let html = `<button class="btn btn-primary" id="newEventBtn">＋ 新しい回を作る</button><div class="gap"></div>`;
  if (!evs.length) html += `<div class="card sub-text">まだ回がありません。「新しい回を作る」から始めてください。</div>`;

  Object.keys(months).forEach(m => {
    const list = months[m];
    const stats = list.map(e => evStats(e.state, e.bar));
    const people = stats.reduce((s, x) => s + x.people, 0);
    const profit = stats.reduce((s, x) => s + x.profit, 0);
    const [y, mo] = m.split("-");
    html += `<div class="month-head"><div class="month-title">${y}年${Number(mo)}月</div>
      <div class="sub-text">${list.length}回 ／ 来場 ${people}名 ／ 受付利益 ¥${formatMoney(profit)}</div></div>`;
    list.forEach((e, i) => {
      const s = stats[i], url = flyerUrl(e);
      html += `<div class="event-card ${url ? "" : "noflyer"}" data-open="${e.id}" ${url ? `style="background-image:url('${url}')"` : ""}>
        <div class="event-card-overlay">
          <span class="badge ${e.archived ? "arc" : ""}">${e.archived ? "ARCHIVE" : "LIVE"}</span>
          <div class="event-card-title">${esc(e.name)}</div>
          <div class="event-card-sub">${esc(e.date)} ・ 来場 ${s.people}名${s.bar.hasEnd ? ` ・ ドリンク ${Number.isInteger(s.bar.cups) ? s.bar.cups : s.bar.cups.toFixed(1)}杯` : ""}</div>
        </div></div>`;
    });
  });
  screen.innerHTML = html;
  document.getElementById("newEventBtn").onclick = () => navigate(renderEventNew);
  screen.querySelectorAll("[data-open]").forEach(el => el.onclick = () => openEvent(el.dataset.open));
}

function renderEventNew() {
  screen.innerHTML = `<div class="card">
    <div class="card-title">新しい回を作る</div>
    <div class="form-row"><label>イベント名</label><input id="evName" placeholder="例：tonight! vol.12"></div>
    <div class="form-row"><label>開催日</label><input id="evDate" type="date" value="${todayStr()}"></div>
    <div class="form-row"><label>フライヤー（任意）</label><input id="evFlyer" type="file" accept="image/*"></div>
    <button class="btn btn-primary" id="createEvBtn">作成</button></div>`;
  document.getElementById("createEvBtn").onclick = async () => {
    const name = document.getElementById("evName").value.trim();
    const date = document.getElementById("evDate").value;
    if (!name || !date) { alert("イベント名と開催日を入力してください"); return; }
    const ev = newEvent(name, date);
    db.events.push(ev);
    persistDb();
    const f = document.getElementById("evFlyer").files[0];
    if (f) await uploadFlyer(ev, f);
    pageHistory.pop();
    openEvent(ev.id);
    updateBackButton();
  };
}

function openEvent(id) {
  const ev = db.events.find(e => e.id === id);
  if (!ev) return;
  ev.bar = ev.bar || createBar();
  ev.tt = ev.tt || createTt();
  ev.u.tt = ev.u.tt || 0;
  if (ev.archived) {
    ctx = { ev, mode: "archive", dirty: false, bar: structuredClone(ev.bar), tt: structuredClone(ev.tt) };
    state = structuredClone(ev.state);
  } else {
    ctx = { ev, mode: "live", dirty: false, bar: ev.bar, tt: ev.tt };
    state = ev.state;
  }
  navigate(renderEventPage);
}

function renderEventPage() {
  const ev = ctx.ev, arc = ctx.mode === "archive";
  const s = evStats(state, ctx.bar), url = flyerUrl(ev);
  screen.innerHTML = `
    ${url ? `<img class="flyer-hero" src="${url}" alt="フライヤー">` : `<div class="flyer-empty">フライヤー未登録</div>`}
    ${arc ? `<div class="banner">アーカイブ済み：変更すると「変更を保存しますか？」の確認が出ます${ctx.dirty ? "（未保存の変更あり）" : ""}</div>` : ""}
    <div class="card">
      <div class="card-title">${esc(ev.name)}</div>
      <div class="row"><span>開催日</span><strong>${esc(ev.date)}</strong></div>
      <div class="row"><span>来場者（受付）</span><strong>${s.people}名</strong></div>
      <div class="row"><span>受付利益</span><strong>¥${formatMoney(s.profit)}</strong></div>
      <div class="row"><span>ドリンク売上杯数（バー）</span><strong>${s.bar.hasEnd ? (Number.isInteger(s.bar.cups) ? s.bar.cups : s.bar.cups.toFixed(1)) + "杯" : "未入力"}</strong></div>
    </div>
    <div class="card"><div class="card-title">いま</div><div id="nowBox">${nowHtml(ctx.tt, ev)}</div></div>
    <button class="btn btn-primary" id="goRec">受付</button><div class="gap"></div>
    <button class="btn btn-primary" id="goBar">バーカウンター</button><div class="gap"></div>
    <button class="btn btn-primary" id="goTt">タイムテーブル・シフト</button><div class="gap"></div>
    ${arc && ctx.dirty ? `<button class="btn btn-secondary" id="saveEv">変更を保存</button><div class="gap"></div>` : ""}
    <button class="btn btn-secondary" id="editEv">名前・日付・フライヤーを編集</button><div class="gap"></div>
    <button class="btn btn-secondary" id="arcEv">${arc ? "アーカイブを解除（開催中に戻す）" : "この回をアーカイブする"}</button><div class="gap"></div>
    <button class="btn btn-danger" id="delEv">この回を削除</button>`;
  document.getElementById("goRec").onclick = () => navigate(state.initialized ? renderHome : renderSetup);
  document.getElementById("goBar").onclick = () => navigate(renderBarHome);
  document.getElementById("goTt").onclick = () => navigate(renderTimetable);
  document.getElementById("editEv").onclick = () => navigate(renderEventEdit);
  const sv = document.getElementById("saveEv");
  if (sv) sv.onclick = () => { if (confirm("変更を保存しますか？")) { commitCtx(); renderEventPage(); } };
  document.getElementById("arcEv").onclick = () => {
    if (ctx.dirty && !confirm("未保存の変更があります。保存して切り替えますか？")) return;
    if (ctx.dirty) commitCtx();
    if (arc) {
      ev.archived = false; ctx.mode = "live"; state = ev.state; ctx.bar = ev.bar; ctx.tt = ev.tt;
    } else {
      if (!confirm("この回をアーカイブしますか？\n以降の編集時は保存確認が出ます。")) return;
      ev.archived = true; ctx.mode = "archive"; state = structuredClone(ev.state); ctx.bar = structuredClone(ev.bar); ctx.tt = structuredClone(ev.tt);
    }
    ev.u.meta = Date.now(); persistDb(); renderEventPage();
  };
  document.getElementById("delEv").onclick = () => {
    if (!confirm(`「${ev.name}」を削除しますか？\n受付・バーの記録もすべて消えます（元に戻せません）`)) return;
    ev.deleted = true; ev.u.meta = Date.now(); ctx = null; persistDb();
    pageHistory = []; navigate(renderEventList);
  };
}

function renderEventEdit() {
  const ev = ctx.ev;
  screen.innerHTML = `<div class="card">
    <div class="card-title">回の情報を編集</div>
    <div class="form-row"><label>イベント名</label><input id="evName" value="${esc(ev.name)}"></div>
    <div class="form-row"><label>開催日</label><input id="evDate" type="date" value="${esc(ev.date)}"></div>
    <div class="form-row"><label>フライヤーを変更</label><input id="evFlyer" type="file" accept="image/*"></div>
    <button class="btn btn-primary" id="saveMeta">保存</button></div>`;
  document.getElementById("saveMeta").onclick = async () => {
    const name = document.getElementById("evName").value.trim();
    const date = document.getElementById("evDate").value;
    if (!name || !date) { alert("イベント名と開催日を入力してください"); return; }
    if (ctx.mode === "archive" && !confirm("変更を保存しますか？")) return;
    ev.name = name; ev.date = date; ev.u.meta = Date.now();
    const f = document.getElementById("evFlyer").files[0];
    if (f) await uploadFlyer(ev, f);
    persistDb();
    back();
  };
}

/* ---------- バーカウンター ---------- */
function barCashRows(kind, breakdown) {
  return CASH_DENOMINATIONS.map(v => `
    <div class="row"><label>${v.toLocaleString()}円</label>
    <input type="number" min="0" inputmode="numeric" value="${Number(breakdown[v] || 0)}" data-bc="${kind}" data-v="${v}"></div>`).join("");
}
function renderBarHome() {
  const ev = ctx.ev, b = ctx.bar;
  b.checks = b.checks || {};
  const dt = new Date(ev.date + "T00:00:00"), md = `${dt.getMonth() + 1}/${dt.getDate()}`;
  const yen = n => "¥" + formatMoney(n);

  screen.innerHTML = `
  <div class="card">
    <div class="card-title">① 開始時の金庫</div>
    ${barCashRows("start", b.startBreakdown)}
    <div class="money-display"><div class="label">開始時の金額</div><div class="amount" id="bStart"></div></div>
  </div>

  <div class="card">
    <div class="card-title">ドリンク売上杯数（正の字）</div>
    <div class="counter" style="justify-content:center">
      <button id="bTm">−</button><div class="counter-value" id="bTally"></div><button id="bTp">+</button>
    </div>
    <div class="tally" id="bTallyStr" style="text-align:center;margin-top:8px"></div>
  </div>

  <div class="card">
    <div class="card-title">ドリンク精算</div>
    <div class="section-label"><span class="step">④</span>金庫内のお金を手で数える</div>
    ${barCashRows("end", b.endBreakdown)}
    <div class="row"><span><span class="step">④</span>金庫内の金額</span><strong id="bEnd"></strong></div>
    <div class="row"><span><span class="step">⑤</span>収益（④ − 開始時）</span><strong id="bRev"></strong></div>
    <div class="row"><span>売上杯数（⑤ ÷ ${BAR_CUP}円）</span><strong id="bCups"></strong></div>
    <div class="section-label" style="margin-top:12px">封筒に書く内容</div>
    <div class="env" id="bEnv"></div>
    <button class="btn btn-secondary" id="bCopy">文面をコピー</button>
  </div>

  <div class="card">
    <div class="card-title">確認</div>
    <div class="form-row"><label>（念の為）封筒を出した後、金庫に残った金額</label>
      <input id="bRemain" type="number" inputmode="numeric" value="${esc(b.remain)}" placeholder="数え直した金額"></div>
    <div class="row"><span>開始時の金額と一致</span><strong id="bRemainSt"></strong></div>
    <div class="checklist">
      <label><input type="checkbox" data-ck="env" ${b.checks.env ? "checked" : ""}><span>封筒に記入した</span></label>
      <label><input type="checkbox" data-ck="photo" ${b.checks.photo ? "checked" : ""}><span>受付精算の封筒と一緒に写真を撮った</span></label>
      <label><input type="checkbox" data-ck="fridge" ${b.checks.fridge ? "checked" : ""}><span>封筒を冷蔵庫に入れた</span></label>
    </div>
  </div>

  <div class="card">
    <div class="card-title">ドリチケ照合</div>
    <div class="form-row"><label>受け取ったドリチケの枚数</label>
      <input id="bTickets" type="number" inputmode="numeric" value="${Number(b.tickets || 0)}"></div>
    <div class="row"><span>受付の入場者数</span><strong id="bPeople"></strong></div>
    <div class="row"><span>ドリチケ枚数＝入場者数</span><strong id="bTicketSt"></strong></div>
    <div class="row"><span>正の字の売上数 − ドリチケ枚数</span><strong id="bCash"></strong></div>
    <div class="row"><span>売上杯数との差</span><strong id="bDiff"></strong></div>
    <p class="sub-text">差が±${BAR_TOLERANCE}杯以内ならOKとしています（正の字のつけ忘れ程度のズレは問題なし）。</p>
  </div>`;

  const $ = id => document.getElementById(id);
  const recalc = () => {
    const c = barCalc(b);
    $("bStart").textContent = yen(c.start);
    $("bTally").textContent = b.tally;
    $("bTallyStr").textContent = tallyString(b.tally);
    $("bEnd").textContent = c.hasEnd ? yen(c.end) : "-";
    $("bRev").textContent = c.hasEnd ? yen(c.revenue) : "-";
    $("bCups").textContent = !c.hasEnd ? "-" : (Number.isInteger(c.cups) ? c.cups + "杯" : c.cups.toFixed(1) + "杯（端数あり・要確認）");
    $("bEnv").textContent = c.hasEnd ? `${md} tonight!\nキャッシュドリンク ${formatMoney(c.revenue)}円` : "（④の金庫内の金額を入力すると表示されます）";
    const rem = b.remain === "" ? null : Number(b.remain);
    $("bRemainSt").innerHTML = rem === null ? "-" : (rem === c.start ? `<span class="ok">一致 ✓</span>` : `<span class="ng">不一致（差 ${formatSignedMoney(rem - c.start)}）</span>`);
    const people = state.totals.general + state.totals.tmp, tk = Number(b.tickets || 0);
    $("bPeople").textContent = people + "名";
    $("bTicketSt").innerHTML = people === tk ? `<span class="ok">一致 ✓</span>` : `<span class="ng">不一致（差 ${tk - people}）</span>`;
    const cash = b.tally - tk;
    $("bCash").textContent = cash + "杯";
    if (!c.hasEnd) { $("bDiff").textContent = "-"; return; }
    const diff = cash - c.cups;
    $("bDiff").innerHTML = Math.abs(diff) <= BAR_TOLERANCE ? `<span class="ok">OK（差 ${diff}）</span>` : `<span class="ng">要確認（差 ${diff}）</span>`;
  };
  screen.querySelectorAll("[data-bc]").forEach(inp => inp.oninput = () => {
    (inp.dataset.bc === "start" ? b.startBreakdown : b.endBreakdown)[inp.dataset.v] = Number(inp.value || 0);
    saveBar(); recalc();
  });
  $("bTp").onclick = () => { b.tally++; saveBar(); recalc(); };
  $("bTm").onclick = () => { if (b.tally > 0) { b.tally--; saveBar(); recalc(); } };
  $("bRemain").oninput = e => { b.remain = e.target.value; saveBar(); recalc(); };
  $("bTickets").oninput = e => { b.tickets = Number(e.target.value || 0); saveBar(); recalc(); };
  screen.querySelectorAll("[data-ck]").forEach(cb => cb.onchange = () => { b.checks[cb.dataset.ck] = cb.checked; saveBar(); });
  $("bCopy").onclick = () => {
    navigator.clipboard.writeText($("bEnv").textContent).then(() => alert("コピーしました"), () => alert("コピーできませんでした"));
  };
  recalc();
}


/* ---------- タイムテーブル・シフト（現在の出番を自動表示） ---------- */
function createTt() { return { acts: [], shifts: [] }; }
function saveTt() {
  if (!ctx) return;
  if (ctx.mode === "archive") { ctx.dirty = true; return; }
  ctx.ev.u.tt = Date.now();
  persistDb();
}
// 0〜5時台は「その日の夜の続き（翌日扱い）」として並べる
function toMin(t) { const [h, m] = String(t).split(":").map(Number); return (h < 6 ? h + 24 : h) * 60 + m; }
function slotRange(s) { const a = toMin(s.start); let b = toMin(s.end); if (b <= a) b += 1440; return [a, b]; }
function nowHtml(tt, ev) {
  const t = (Date.now() - new Date(ev.date + "T00:00:00").getTime()) / 60000;
  if (t < 0 || t > 1800) {
    return `<div class="sub-text">開催日（${esc(ev.date)}）になると、いまの出番・シフトが表示されます</div>`;
  }
  const cur = list => list.filter(s => { const [a, b] = slotRange(s); return t >= a && t < b; });
  const nxt = list => list.filter(s => slotRange(s)[0] > t).sort((x, y) => slotRange(x)[0] - slotRange(y)[0])[0];
  const c = cur(tt.acts)[0], n = nxt(tt.acts);
  let html = `<div class="now-row"><span class="now-label">出番</span><div>
    ${c ? `<strong class="now-main">${esc(c.name)}</strong> <span class="sub-text">${c.start}–${c.end}</span>` : `<span class="sub-text">いまの出番はありません</span>`}
    ${n ? `<div class="sub-text">次：${esc(n.name)}（${n.start}〜）</div>` : ""}</div></div>`;
  const roles = [...new Set(tt.shifts.map(s => s.role))];
  if (roles.length) {
    html += `<div class="section-label" style="margin-top:12px">いまのシフト</div>` + roles.map(r => {
      const names = cur(tt.shifts.filter(s => s.role === r)).map(s => esc(s.name)).join("、");
      return `<div class="row compact-row"><span>${esc(r)}</span><strong>${names || "—"}</strong></div>`;
    }).join("");
  }
  return html;
}
function updateNow() {
  const el = document.getElementById("nowBox");
  if (el && ctx) el.innerHTML = nowHtml(ctx.tt, ctx.ev);
}
function renderTimetable() {
  const tt = ctx.tt;
  const sorted = l => l.slice().sort((a, b) => slotRange(a)[0] - slotRange(b)[0]);
  screen.innerHTML = `
  <div class="card"><div class="card-title">いま</div><div id="nowBox">${nowHtml(tt, ctx.ev)}</div></div>

  <div class="card">
    <div class="card-title">タイムテーブル（出番）</div>
    ${sorted(tt.acts).map(a => `<div class="row"><span class="tt-edit" data-ea="${a.id}">${a.start}–${a.end}　<strong>${esc(a.name)}</strong></span><button class="x" data-da="${a.id}">×</button></div>`).join("") || `<div class="sub-text">まだ登録がありません</div>`}
    <div class="inline-form">
      <input type="time" id="aStart" value="20:00"><input type="time" id="aEnd" value="20:30">
      <input class="full" id="aName" placeholder="出演者名">
      <button class="btn btn-primary full" id="aAdd">追加</button>
    </div>
    <p class="sub-text">登録済みの行をタップすると編集できます。</p>
  </div>

  <div class="card">
    <div class="card-title">シフト</div>
    ${sorted(tt.shifts).map(s => `<div class="row"><span class="tt-edit" data-es="${s.id}">${s.start}–${s.end}　${esc(s.role)}：<strong>${esc(s.name)}</strong></span><button class="x" data-ds="${s.id}">×</button></div>`).join("") || `<div class="sub-text">まだ登録がありません</div>`}
    <div class="inline-form">
      <input type="time" id="sStart" value="19:00"><input type="time" id="sEnd" value="21:00">
      <input id="sRole" list="roleList" placeholder="役割（受付・バーなど）"><input id="sName" placeholder="担当者名">
      <datalist id="roleList"><option>受付</option><option>バーカウンター</option><option>音響</option><option>照明</option><option>物販</option></datalist>
      <button class="btn btn-primary full" id="sAdd">追加</button>
    </div>
  </div>`;
  const $ = id => document.getElementById(id);
  let editA = null, editS = null;
  $("aAdd").onclick = () => {
    const o = { start: $("aStart").value, end: $("aEnd").value, name: $("aName").value.trim() };
    if (!o.start || !o.end || !o.name) { alert("時間と名前を入力してください"); return; }
    if (editA) Object.assign(tt.acts.find(x => x.id === editA), o); else tt.acts.push({ id: uid(), ...o });
    saveTt(); renderTimetable();
  };
  $("sAdd").onclick = () => {
    const o = { start: $("sStart").value, end: $("sEnd").value, role: $("sRole").value.trim(), name: $("sName").value.trim() };
    if (!o.start || !o.end || !o.role || !o.name) { alert("時間・役割・名前を入力してください"); return; }
    if (editS) Object.assign(tt.shifts.find(x => x.id === editS), o); else tt.shifts.push({ id: uid(), ...o });
    saveTt(); renderTimetable();
  };
  screen.querySelectorAll("[data-ea]").forEach(el => el.onclick = () => {
    const a = tt.acts.find(x => x.id === el.dataset.ea); editA = a.id;
    $("aStart").value = a.start; $("aEnd").value = a.end; $("aName").value = a.name; $("aAdd").textContent = "更新";
  });
  screen.querySelectorAll("[data-es]").forEach(el => el.onclick = () => {
    const s = tt.shifts.find(x => x.id === el.dataset.es); editS = s.id;
    $("sStart").value = s.start; $("sEnd").value = s.end; $("sRole").value = s.role; $("sName").value = s.name; $("sAdd").textContent = "更新";
  });
  screen.querySelectorAll("[data-da]").forEach(b => b.onclick = () => {
    if (!confirm("この出番を削除しますか？")) return;
    tt.acts = tt.acts.filter(x => x.id !== b.dataset.da); saveTt(); renderTimetable();
  });
  screen.querySelectorAll("[data-ds]").forEach(b => b.onclick = () => {
    if (!confirm("このシフトを削除しますか？")) return;
    tt.shifts = tt.shifts.filter(x => x.id !== b.dataset.ds); saveTt(); renderTimetable();
  });
}

/* ---------- 起動 ---------- */
function initApp() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  navigate(renderEventList);
  setSync("接続中…");
  syncPull();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncPull(); });
  setInterval(() => { if (!document.hidden) syncPull(); }, 10000);
  setInterval(updateNow, 20000);   // 「いまの出番」を自動更新
}
initApp();
