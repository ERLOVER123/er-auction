const socket = io();
let myRole = '', myName = '', lastBid = 0; 

// [로그인 및 입장]
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

// [간편 입찰 계산]
function add(v) {
    const inputEl = document.getElementById('bidInput');
    if (inputEl.value === '') {
        inputEl.value = lastBid + v;
    } else {
        inputEl.value = parseInt(inputEl.value) + v;
    }
}

// [입찰 전송]
function sendBid() {
    const val = parseInt(document.getElementById('bidInput').value);
    if(val > lastBid) {
        socket.emit('placeBid', val);
        document.getElementById('bidInput').value = '';
    } else {
        alert("현재 최고가보다 높아야 합니다.");
    }
}

// [서버로부터 상태 동기화 받기]
socket.on('updateState', (s) => {
    lastBid = s.highestBid;
    
    // 텍스트 정보 업데이트
    document.getElementById('itemTitle').innerText = s.currentItem || "경매 대기 중";
    document.getElementById('curBid').innerText = s.highestBid;
    document.getElementById('curWinner').innerText = s.highestBidder || '-';

    // 일반 유저 버튼 잠금 로직
    if (myRole === 'player') {
        const isBiddingPhase = (s.status === 'bidding');
        const amIHighestBidder = (myName === s.highestBidder); 
        
        const shouldDisable = !isBiddingPhase || amIHighestBidder;
        const bidBtn = document.getElementById('bidBtn');
        
        bidBtn.disabled = shouldDisable;
        if (isBiddingPhase && amIHighestBidder) {
            bidBtn.innerText = "현재 최고 입찰자";
            bidBtn.style.backgroundColor = "#27ae60"; 
        } else {
            bidBtn.innerText = "입찰하기";
            bidBtn.style.backgroundColor = "#3498db"; 
        }

        const qBtns = document.querySelectorAll('.q-btn');
        qBtns.forEach(btn => {
            btn.disabled = shouldDisable;
            btn.style.opacity = shouldDisable ? '0.5' : '1';
            btn.style.cursor = shouldDisable ? 'not-allowed' : 'pointer';
        });
    }

    // 8인 그리드 렌더링
    const grid = document.getElementById('players-grid');
    grid.innerHTML = '';
    const names = Object.keys(s.players);
    for(let i=0; i<8; i++) {
        const n = names[i], card = document.createElement('div');
        card.className = 'player-card' + (s.highestBidder === n ? ' is-highest' : '');
        card.innerHTML = n ? `<span class="player-name">${n}</span><span class="player-points">${s.players[n].points} P</span>` : `<span style="color:#ccc;">[비어있음]</span>`;
        grid.appendChild(card);
    }
});

// [타이머 동기화]
socket.on('timerUpdate', (t) => {
    const timerEl = document.getElementById('timer');
    timerEl.innerText = t;
    if (t <= 5) {
        timerEl.style.color = "#ff0000";
        timerEl.style.fontSize = "4.5em";
    } else {
        timerEl.style.color = "#e74c3c";
        timerEl.style.fontSize = "3.5em";
    }
});

// [시스템 로그]
socket.on('systemMsg', (m) => {
    const d = document.getElementById('messages');
    d.innerHTML += `<div>${m}</div>`;
    d.scrollTop = d.scrollHeight;
});