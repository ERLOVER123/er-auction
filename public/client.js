const socket = io();
let myRole = '', myName = '', lastBid = 0, auctionStateRef = {};

function enter() {
    const isAdmin = document.getElementById('isAdminCheck').checked;
    socket.emit('join', {
        role: isAdmin ? 'admin' : 'player',
        username: document.getElementById('nick').value,
        password: document.getElementById('pw').value
    }, (res) => {
        if(res.success) {
            myRole = res.isRole;
            myName = res.username;
            document.getElementById('login-area').style.display = 'none';
            document.getElementById('auction-area').style.display = 'block';
            document.getElementById('admin-ui').style.display = (myRole === 'admin') ? 'block' : 'none';
            document.getElementById('user-ui').style.display = (myRole === 'player') ? 'block' : 'none';
        } else {
            alert(res.message);
        }
    });
}

function add(v) {
    const inputEl = document.getElementById('bidInput');
    inputEl.value = inputEl.value === '' ? lastBid + v : parseInt(inputEl.value) + v;
}
// 🔥 올인 로직 (숫자만 채워주기)
function allIn() {
    const myInfo = auctionStateRef.players[myName]; 
    if (!myInfo) return;

    const myTotalPoints = myInfo.points;

    if (myTotalPoints <= 0) {
        alert("가진 포인트가 없습니다!");
        return;
    }

    // 확인창이나 자동 전송 없이, 그냥 입력창에 내 남은 포인트만 딱 꽂아줍니다.
    document.getElementById('bidInput').value = myTotalPoints;
}
function sendBid() {
    const val = parseInt(document.getElementById('bidInput').value);
    const curWinner = document.getElementById('curWinner').innerText;
    
    // 🔥 프론트엔드에서도 첫 0원 입찰을 허가해줌
    const isFirstZero = (val === 0 && lastBid === 0 && curWinner === '-');
    
// 🔥 [추가된 부분] 5포인트 단위 검사 (0원 입찰은 무사통과)
    if (val % 5 !== 0 && !isFirstZero) {
        alert("입찰은 5포인트 단위로만 가능합니다! (예: 5, 10, 15...)");
        return;
    }
    if(val > lastBid || isFirstZero) {
        socket.emit('placeBid', val);
        document.getElementById('bidInput').value = '';
    } else {
        alert("현재 최고가보다 높아야 합니다.");
    }
}
// 플레이어 카드 DOM을 한 번만 만들어두고 재사용
const playerCards = [];

socket.on('updateState', (s) => {
    auctionStateRef = s;
    lastBid = s.highestBid;

    document.getElementById('itemTitle').innerText = s.currentItem || "경매 대기 중";
    document.getElementById('curBid').innerText = s.highestBid;
    document.getElementById('curWinner').innerText = s.highestBidder || '-';

    if (myRole === 'player') {
        const isBiddingPhase = (s.status === 'bidding');
        const amIHighestBidder = (myName === s.highestBidder);
        const myInfo = s.players[myName];
        const amIMaxedOut = myInfo && myInfo.itemsWon >= 2;

        const shouldDisable = !isBiddingPhase || amIHighestBidder || amIMaxedOut;
        const bidBtn = document.getElementById('bidBtn');

        bidBtn.disabled = shouldDisable;

        if (amIMaxedOut) {
            bidBtn.innerText = "구매 완료 (최대 2명)";
            bidBtn.style.backgroundColor = "#7f8c8d";
        } else if (isBiddingPhase && amIHighestBidder) {
            bidBtn.innerText = "현재 최고 입찰자";
            bidBtn.style.backgroundColor = "#27ae60";
        } else {
            bidBtn.innerText = "입찰하기";
            bidBtn.style.backgroundColor = "#3498db";
        }

        document.querySelectorAll('.q-btn').forEach(btn => {
            btn.disabled = shouldDisable;
            btn.style.opacity = shouldDisable ? '0.5' : '1';
            btn.style.cursor = shouldDisable ? 'not-allowed' : 'pointer';
        });
    }

    const grid = document.getElementById('players-grid');
    const names = Object.keys(s.players);

    // 카드가 아직 만들어지지 않았다면 딱 한 번 생성
    if (playerCards.length === 0) {
        for (let i = 0; i < 8; i++) {
            const card = document.createElement('div');
            card.className = 'player-card';

            const nameEl = document.createElement('span');
            nameEl.className = 'player-name';

            const pointsEl = document.createElement('span');
            pointsEl.className = 'player-points';

            const itemsEl = document.createElement('div');
            itemsEl.style.fontSize = '0.75em';
            itemsEl.style.color = '#34495e';
            itemsEl.style.marginTop = '5px';
            itemsEl.style.minHeight = '1.2em';

            card.appendChild(nameEl);
            card.appendChild(pointsEl);
            card.appendChild(itemsEl);
            grid.appendChild(card);

            playerCards.push({
                card,
                nameEl,
                pointsEl,
                itemsEl
            });
        }
    }

    // 기존 카드의 내용만 변경
    for (let i = 0; i < 8; i++) {
        const ui = playerCards[i];
        const n = names[i];

        if (n) {
            const pInfo = s.players[n];
            const itemsText = pInfo.wonItems.length > 0
                ? pInfo.wonItems.join(', ')
                : '없음';

            ui.nameEl.innerText = n;
            ui.pointsEl.innerHTML =
                `${pInfo.points} P <small style="color:#7f8c8d;">(${pInfo.itemsWon}/2)</small>`;
            ui.itemsEl.innerText = `📦 ${itemsText}`;

            ui.card.className =
                'player-card' + (s.highestBidder === n ? ' is-highest' : '');
        } else {
            ui.nameEl.innerText = '';
            ui.pointsEl.innerText = '';
            ui.itemsEl.innerText = '';
            ui.card.className = 'player-card';

            ui.nameEl.innerText = '[비어있음]';
            ui.nameEl.style.color = '#ccc';
        }
    }
});

socket.on('timerUpdate', (t) => {
    const timerEl = document.getElementById('timer');
    timerEl.innerText = t;
    timerEl.style.color = (t <= 5) ? "#ff0000" : "#e74c3c";
    
    // font-size 대신 transform: scale()을 사용하여 주변 UI를 밀어내지 않음 (1.2배 확대)
    timerEl.style.transform = (t <= 5) ? "scale(1.2)" : "scale(1)";
});

socket.on('systemMsg', (m) => {
    const d = document.getElementById('messages');

    // 메시지 DOM이 무한히 커지는 것을 방지
    const msg = document.createElement('div');
    msg.textContent = m;
    d.appendChild(msg);

    // 최대 100개까지만 유지
    while (d.children.length > 100) {
        d.removeChild(d.firstChild);
    }

    d.scrollTop = d.scrollHeight;
});

socket.on('kicked', (targetUser) => {
    if (myName === targetUser) {
        alert("방장에 의해 강제 퇴장되었습니다.");
        location.reload(); 
    }
});

// [방장 전용 호출 함수들]
function startNextAuction() { socket.emit('startAuction'); }
function skipCurrentAuction() { socket.emit('skipAuction'); }
function selectItem() {
    const item = document.getElementById('itemSelect').value;
    if(item) socket.emit('selectItem', item);
}
function resetSystem() {
    if(confirm("모든 점수와 매물 순서가 초기화됩니다. 진행하시겠습니까?")) socket.emit('resetAll');
}
function kickPlayer() {
    const target = prompt("강퇴할 유저의 닉네임을 정확히 입력하세요:");
    if (target) socket.emit('kickUser', target);
}
