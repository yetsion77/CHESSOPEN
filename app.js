import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getDatabase, ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-database.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyAp4o22wMDfo4hvkFNgtqwd5lsoWmTM0Yc",
    authDomain: "chess-93fef.firebaseapp.com",
    databaseURL: "https://chess-93fef-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "chess-93fef",
    storageBucket: "chess-93fef.firebasestorage.app",
    messagingSenderId: "142230472814",
    appId: "1:142230472814:web:e845fb42b0719ae6883e7f",
    measurementId: "G-BTXWL50FR5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- App State ---
// Ensure Chess is loaded globally
if (typeof window.Chess === 'undefined') {
    alert('שגיאה: ספריית השחמט לא נטענה. וודא שקובץ chess.js קיים.');
    document.getElementById('board').innerText = 'שגיאה בטעינת הקבצים. אנא רענן את העמוד.';
}

let game = new window.Chess();
let boardEl = document.getElementById('board');
let statusEl = document.getElementById('game-status');
let turnEl = document.getElementById('turn-indicator');
let selectedSquare = null;

// Playback State
let playbackInterval = null;
let currentSequenceMoves = [];
let playbackIndex = 0;

// Practice State
let currentMode = 'record';
let practiceTargetSequence = [];
let practiceMoveIndex = 0;

// Local cache of sequences for playback/practice
let localSequences = {};

// Piece Theme
const pieces = {
    'wP': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    'wR': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'wN': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    'wB': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'wQ': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    'wK': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'bP': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
    'bR': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'bN': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    'bB': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'bQ': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    'bK': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
};

function init() {
    renderBoard();
    updateStatus();
    setupFirebaseListeners(); // Replaces loadSavedSequencesList
    setupEventListeners();
}

// --- Board & Interaction ---
function renderBoard() {
    boardEl.innerHTML = '';
    const boardState = game.board();

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const squareEl = document.createElement('div');
            const isWhite = (r + c) % 2 === 0;
            const squareName = String.fromCharCode(97 + c) + (8 - r);

            squareEl.classList.add('square');
            squareEl.classList.add(isWhite ? 'white-square' : 'black-square');
            squareEl.dataset.square = squareName;

            const piece = boardState[r][c];
            if (piece) {
                const pieceImg = document.createElement('div');
                pieceImg.classList.add('piece');
                const pKey = piece.color + piece.type.toUpperCase();
                pieceImg.style.backgroundImage = `url(${pieces[pKey]})`;
                squareEl.appendChild(pieceImg);
            }

            if (selectedSquare === squareName) squareEl.classList.add('highlight');

            squareEl.addEventListener('click', () => handleSquareClick(squareName));
            boardEl.appendChild(squareEl);
        }
    }
}

function handleSquareClick(square) {
    // Online Check
    if (currentMode === 'online') {
        // Prevent if waiting
        if (document.getElementById('online-status-msg').innerText.includes('ממתין')) return;

        // Prevent if not my turn
        const isMySideWhite = playerSide === 'white';
        const isWhiteTurn = game.turn() === 'w';

        if (isMySideWhite !== isWhiteTurn) {
            // Not my turn
            return;
        }
    }

    if (currentMode === 'practice' && game.turn() !== practiceTargetSequence[practiceMoveIndex]?.color) {
        // ... practice check ...
    }

    if (!selectedSquare) {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
            selectedSquare = square;
            renderBoard();
            highlightLegalMoves(square);
        }
    } else {
        const move = { from: selectedSquare, to: square, promotion: 'q' };
        const legalMove = game.move(move);

        if (legalMove) {
            selectedSquare = null;
            onMoveMade(legalMove);
        } else {
            const piece = game.get(square);
            if (piece && piece.color === game.turn()) {
                selectedSquare = square;
                renderBoard();
                highlightLegalMoves(square);
            } else {
                selectedSquare = null;
                renderBoard();
            }
        }
    }
}

function highlightLegalMoves(square) {
    const moves = game.moves({ square: square, verbose: true });
    moves.forEach(move => {
        const sqEl = document.querySelector(`[data-square="${move.to}"]`);
        if (sqEl) {
            const hint = document.createElement('div');
            hint.classList.add('move-hint');
            hint.style.width = '100%';
            hint.style.height = '100%';
            hint.style.position = 'absolute';
            hint.style.pointerEvents = 'none';
            sqEl.appendChild(hint);
        }
    });
}

// Sound Effect
const moveSound = new Audio('move.ogg');

function onMoveMade(move) {
    // Play sound
    moveSound.currentTime = 0;
    moveSound.play().catch(e => console.log('Audio play failed (user interaction needed first):', e));

    renderBoard();
    updateStatus();

    if (currentMode === 'practice') {
        checkPracticeMove(move);
    }

    if (currentMode === 'online') {
        handleOnlineMove(move);
    }
}

function updateStatus() {
    let status = '';
    let moveColor = game.turn() === 'b' ? 'שחור' : 'לבן';

    if (game.in_checkmate()) {
        status = 'מט! ' + (game.turn() === 'w' ? 'השחור' : 'הלבן') + ' ניצח.';
    } else if (game.in_draw()) {
        status = 'תיקו!';
    } else {
        if (game.in_check()) status = 'שח! ';
    }

    statusEl.innerText = status;
    turnEl.innerText = moveColor;
    document.getElementById('move-history').innerText = game.pgn();
}


// --- Firebase Sequence Management ---

function setupFirebaseListeners() {
    const sequencesRef = ref(db, 'sequences');
    onValue(sequencesRef, (snapshot) => {
        const data = snapshot.val();
        localSequences = data || {};
        updateSequencesListUI(localSequences);
    });
}

function updateSequencesListUI(sequences) {
    const list = document.getElementById('sequences-list');
    const select = document.getElementById('practice-select');
    list.innerHTML = '';
    select.innerHTML = '<option value="">בחר רצף לתרגול...</option>';

    for (const name in sequences) {
        const li = document.createElement('li');
        li.innerHTML = `<span>${name}</span> <span class="delete-seq" data-bs-name="${name}">X</span>`;

        // Load for viewing/playback
        li.querySelector('span:first-child').onclick = () => preparePlayback(name, sequences[name]);

        // Delete button
        li.querySelector('.delete-seq').onclick = (e) => {
            e.stopPropagation(); // prevent triggering parent click
            deleteSequence(name);
        };

        list.appendChild(li);

        const opt = document.createElement('option');
        opt.value = name;
        opt.innerText = name;
        select.appendChild(opt);
    }
}

function saveSequence() {
    const name = document.getElementById('sequence-name').value.trim();
    if (!name) return alert('אנא הכנס שם לרצף');
    if (game.history().length === 0) return alert('הלוח ריק');

    // Use Firebase set
    // Note: Firebase keys cannot contain certain characters like . $ # [ ] /
    // For simplicity, we assume simple names or we could sanitize.
    // Let's replace illegal chars with '_'
    const safeName = name.replace(/[.#$/\[\]]/g, '_');

    set(ref(db, 'sequences/' + safeName), game.pgn())
        .then(() => {
            alert('הרצף נשמר בהצלחה (משותף לכולם)!');
            document.getElementById('sequence-name').value = '';
        })
        .catch((error) => {
            console.error(error);
            alert('שגיאה בשמירת הרצף: ' + error.message);
        });
}

function deleteSequence(name) {
    if (!confirm('למחוק את "' + name + '" מהענן? (יימחק לכולם)')) return;

    remove(ref(db, 'sequences/' + name))
        .then(() => {
            // UI updates automatically via listener
        })
        .catch((error) => {
            alert('שגיאה במחיקה: ' + error.message);
        });
}


// --- Auto-Play / Playback Logic ---
function preparePlayback(name, pgn) {
    game.reset();

    const tempGame = new window.Chess();
    tempGame.load_pgn(pgn);
    currentSequenceMoves = tempGame.history({ verbose: true });

    playbackIndex = 0;

    renderBoard();
    updateStatus();

    document.querySelector('[data-tab="record-mode"]').click();
    currentMode = 'record';

    document.querySelector('.playback-controls').style.display = 'block';
    document.getElementById('sequence-name').value = name;

    stopPlayback();
}

function stepForward() {
    if (playbackIndex >= currentSequenceMoves.length) return;

    const move = currentSequenceMoves[playbackIndex];
    game.move(move);
    renderBoard();
    updateStatus();
    playbackIndex++;
}

function startPlayback() {
    stopPlayback();
    if (playbackIndex >= currentSequenceMoves.length) {
        game.reset();
        playbackIndex = 0;
        renderBoard();
    }

    playbackInterval = setInterval(() => {
        if (playbackIndex >= currentSequenceMoves.length) {
            stopPlayback();
        } else {
            stepForward();
        }
    }, 1000);
}

function stopPlayback() {
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
}


// --- Practice Logic ---
function startPractice() {
    const select = document.getElementById('practice-select');
    const name = select.value;
    if (!name) return alert('אנא בחר רצף לתרגול');

    const pgn = localSequences[name];

    const tempGame = new window.Chess();
    tempGame.load_pgn(pgn);
    const history = tempGame.history({ verbose: true });

    if (history.length === 0) return alert('הרצף ריק');

    practiceTargetSequence = history;
    practiceMoveIndex = 0;

    game.reset();
    renderBoard();
    updateStatus();
    currentMode = 'practice';

    updatePracticeFeedback("עשה את המהלך הראשון: " + history[0].color + " " + history[0].san, 'neutral');
    document.getElementById('show-hint-btn').style.display = 'none';
}

function checkPracticeMove(moveMade) {
    const targetMove = practiceTargetSequence[practiceMoveIndex];

    // Check minimal condition
    if (moveMade.from === targetMove.from && moveMade.to === targetMove.to) {
        practiceMoveIndex++;
        updatePracticeFeedback("נכון! המשך...", 'success');
        document.getElementById('show-hint-btn').style.display = 'none';

        if (practiceMoveIndex >= practiceTargetSequence.length) {
            updatePracticeFeedback("סיימת את הרצף בהצלחה!", 'success');
            setTimeout(() => alert("כל הכבוד!"), 500);
            return;
        }

    } else {
        game.undo();
        renderBoard();
        updateStatus();
        updatePracticeFeedback("טעות! נסה שנית.", 'error');
        document.getElementById('show-hint-btn').style.display = 'block';
    }
}

function showHint() {
    if (currentMode !== 'practice' || practiceMoveIndex >= practiceTargetSequence.length) return;

    const targetMove = practiceTargetSequence[practiceMoveIndex];

    const fromEl = document.querySelector(`[data-square="${targetMove.from}"]`);
    const toEl = document.querySelector(`[data-square="${targetMove.to}"]`);

    if (fromEl) fromEl.style.backgroundColor = 'rgba(0, 255, 0, 0.4)';
    if (toEl) toEl.style.backgroundColor = 'rgba(0, 255, 0, 0.4)';
}

function updatePracticeFeedback(msg, type) {
    const fb = document.getElementById('practice-feedback');
    fb.innerText = msg;
    fb.className = 'feedback-msg';
    if (type === 'success') fb.classList.add('feedback-success');
    if (type === 'error') fb.classList.add('feedback-error');
    else fb.style.background = '#333';
}


// --- Event Listeners ---
function setupEventListeners() {
    document.getElementById('reset-btn').addEventListener('click', () => {
        try {
            game.reset();
            renderBoard();
            updateStatus();
            selectedSquare = null;
            document.getElementById('move-history').innerText = '';
            stopPlayback();
            const controls = document.querySelector('.playback-controls');
            if (controls) controls.style.display = 'none';
        } catch (e) {
            console.error(e);
            alert('אירעה שגיאה בנסיון לאפס את הלוח');
        }
    });

    document.getElementById('undo-btn').addEventListener('click', () => {
        game.undo();
        renderBoard();
        updateStatus();
        selectedSquare = null;
    });

    document.getElementById('save-btn').addEventListener('click', saveSequence);
    document.getElementById('start-practice-btn').addEventListener('click', startPractice);

    document.getElementById('play-btn').addEventListener('click', startPlayback);
    document.getElementById('pause-btn').addEventListener('click', stopPlayback);
    document.getElementById('next-move-btn').addEventListener('click', stepForward);

    document.getElementById('show-hint-btn').addEventListener('click', showHint);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            e.target.classList.add('active');
            const tabId = e.target.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');

            if (tabId === 'record-mode') {
                currentMode = 'record';
                updatePracticeFeedback("", 'neutral');
            } else {
                stopPlayback();
            }
        });
    });
}

// Global Exports for HTML event handlers if needed (though we attached listeners)
// But 'deleteSequence' was used inline. We attached listener in updateSequencesListUI instead.
// To be safe for any inline onclick remnants in HTML that might slip through (though I removed them in updateSequencesListUI logic above)
window.preparePlayback = preparePlayback;

init();
