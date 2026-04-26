const socket = io();
let myRole = '', myName = '', lastBid = 0; 

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

function sendBid() {
    const val = parseInt(document.getElementById('bidInput').value);
    if(val > lastBid) {
        socket.emit('placeBid', val);
        document.getElementById('bidInput').value = '';
    } else alert("현재 최고가보다 높아야 합니다.");
}

socket.on('updateState', (s) => {
    lastBid = s.highestBid;
    
    document.getElementById('itemTitle').innerText = s.currentItem || "경매 대기 중";
    document.getElementById('curBid').innerText = s.highestBid;
    document.getElementById('curWinner').innerText = s.highestBidder || '-';

   if (myRole === 'player') {
        const isBiddingPhase = (s.status === 'bidding');
        const amIHighestBidder = (myName === s.highestBidder); 
        const myInfo = s.players[myName];
        const amIMaxedOut = myInfo && myInfo.itemsWon >= 2; // 내가 2명 꽉 찼는가?
        
        // 경매중이 아니거나, 내가 1등이거나, 이미 2명을 다 샀으면 버튼 잠금
        const shouldDisable = !isBiddingPhase || amIHighestBidder || amIMaxedOut;
        const bidBtn = document.getElementById('bidBtn');
        
        bidBtn.disabled = shouldDisable;
        
        // 상태에 따른 버튼 디자인 변경
        if (amIMaxedOut) {
            bidBtn.innerText = "구매 완료 (최대 2명)";
            bidBtn.style.backgroundColor = "#7f8c8d"; // 비활성화 회색
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
    grid.innerHTML = '';
    const names = Object.keys(s.players);
    for(let i=0; i<8; i++) {
        const n = names[i];
        const card = document.createElement('div');
        card.className = 'player-card' + (s.highestBidder === n ? ' is-highest' : '');
        
        // 포인트 옆에 획득한 매물 개수 표시 (예: 1000 P (1/2))
        if (n) {
            const pInfo = s.players[n];
            card.innerHTML = `<span class="player-name">${n}</span>
                              <span class="player-points">${pInfo.points} P <small style="color:#7f8c8d;">(${pInfo.itemsWon}/2)</small></span>`;
        } else {
            card.innerHTML = `<span style="color:#ccc;">[비어있음]</span>`;
        }
        grid.appendChild(card);
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
    d.innerHTML += `<div>${m}</div>`;
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