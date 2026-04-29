const socket = io();
let myRole = '', myName = '', lastBid = 0; auctionStateRef = {};

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
// 🔥 올인 로직 추가
function allIn() {
    // 1. 현재 서버 상태 데이터(s)가 필요하므로 저장해둔 변수 사용 로직
    // updateState 이벤트 안에서 전역으로 빼서 쓰거나 바로 계산합니다.
    const myInfo = auctionStateRef.players[myName]; 
    if (!myInfo) return;

    const myTotalPoints = myInfo.points;

    if (myTotalPoints <= 0) {
        alert("올인할 포인트가 없습니다!");
        return;
    }

    if (myTotalPoints <= lastBid) {
        alert("현재 최고가보다 가진 포인트가 적어 올인할 수 없습니다.");
        return;
    }

    if (confirm(`정말 전 재산(${myTotalPoints}P)을 올인하시겠습니까?`)) {
        // 입력창 갱신
        document.getElementById('bidInput').value = myTotalPoints;
        // 확인 누르면 자비 없이 바로 쏴버림!
        sendBid(); 
    }
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
    // wonItems 배열을 쉼표로 합쳐서 보여줍니다.
    const itemsText = pInfo.wonItems.length > 0 ? pInfo.wonItems.join(', ') : '없음';

    card.innerHTML = `
        <span class="player-name">${n}</span>
        <span class="player-points">${pInfo.points} P <small style="color:#7f8c8d;">(${pInfo.itemsWon}/2)</small></span>
        <div style="font-size: 0.75em; color: #34495e; margin-top: 5px; min-height: 1.2em;">
            📦 ${itemsText}
        </div>`;
}else {
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