import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp, deleteDoc, doc, limit, startAfter, onSnapshot } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// --- 0. AXON PERSISTENT CONSOLE ---
const LOG_KEY = 'axon_debug_logs';

function saveLog(type, message) {
    try {
        const logs = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
        logs.push({ type, message, time: new Date().toLocaleTimeString(), page: window.location.pathname.split('/').pop() || 'index' });
        if (logs.length > 50) logs.shift();
        sessionStorage.setItem(LOG_KEY, JSON.stringify(logs));
        updateDebugUI();
    } catch (e) { }
}

console.log = function(...args) {
    const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    saveLog('log', msg);
};
console.error = function(...args) {
    const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    saveLog('error', msg);
};

// --- 1. FIREBASE & GLOBALS ---
const firebaseConfig = {
    apiKey: "AIzaSyCauvT9dlzWwFVcIbNTjyJPlDKFm_tjla8",
    authDomain: "axon-by-aldebarang13.firebaseapp.com",
    projectId: "axon-by-aldebarang13",
    storageBucket: "axon-by-aldebarang13.firebasestorage.app",
    messagingSenderId: "405907784098",
    appId: "1:405907784098:web:1b67ea1539c6a1f3e1f2fb",
    measurementId: "G-28L33Z2RS4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const activeUser = JSON.parse(localStorage.getItem('axonUser'));
let selectedFile = null;
let lastVisible = null;
const postsPerPage = 10;
let lastPostTime = 0;
const COOLDOWN_MS = 10000;

// --- 2. UI TEMPLATES ---
const navTemplate = `
    <nav class="navbar">
        <div class="logo-font-messiri">Axon</div>
        <ul class="nav-links">
            <li><a href="home.html"><span class="material-symbols-rounded">home</span>Home</a></li>
            <li><a href="#"><span class="material-symbols-rounded">play_arrow</span>Videos</a></li>
            <li><a href="forum.html"><span class="material-symbols-rounded">forum</span>Forum</a></li>
            <li><a href="news.html"><span class="material-symbols-rounded">newsstand</span>News</a></li>
            <li id="nav-user-item" style="display: none; margin-left: 20px; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 20px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div id="nav-user-name" class="font-messiri" style="font-size: 14px; color: #fff;"></div>
                    <img id="nav-user-photo" src="" style="width: 35px; height: 35px; border-radius: 50%; border: 1.5px solid #4da6ff;" />
                    <button id="logout-btn" title="Logout" style="background: rgba(255, 77, 77, 0.1); border: 1px solid rgba(255, 77, 77, 0.3); color: #ff4d4d; cursor: pointer; border-radius: 8px; padding: 4px; display: flex; align-items: center;">
                        <span class="material-symbols-rounded" style="font-size: 20px">logout</span>
                    </button>
                </div>
            </li>
        </ul>
    </nav>`;

const footerTemplate = `
    <footer class="footer" style="padding: 30px 50px; border-top: 1px solid rgba(77, 166, 255, 0.1); margin-top: 100px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 40px; text-align: left;">
            <div>
                <h4 style="color: #4da6ff; margin-bottom: 15px; font-family: 'El Messiri', sans-serif;">BROADCAST</h4>
                <a href="https://forms.gle/Bi9cf9kHq23CRLeB8"><span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle;">sensors</span> Submit News</a><br>
                <a href="archive.html"><span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle;">inventory_2</span> Archive (Soon)</a>
            </div>
            <div>
                <h4 style="color: #4da6ff; margin-bottom: 15px; font-family: 'El Messiri', sans-serif;">NETWORK</h4>
                <a href="https://github.com/AldebaranG13/axon-by-aldebarang13"><i class='bx bxl-github'></i> GitHub</a>
            </div>
            <div>
                <h4 style="color: #4da6ff; margin-bottom: 15px; font-family: 'El Messiri', sans-serif;">SYSTEM</h4>
                <a href="credits.html"><span class="material-symbols-rounded" style="font-size:16px">military_tech</span> Hall of Fame</a><br>
                <a href="LICENSE.txt"><span class="material-symbols-rounded" style="font-size:16px">gavel</span> MIT License</a>
            </div>
            <div>
                <h4 style="color: #4da6ff; margin-bottom: 15px; font-family: 'El Messiri', sans-serif;">CONTACTS</h4>
                <a href="mailto:aldebaran.gibran@fiwa.sch.id">aldebaran.gibran@fiwa.sch.id</a><br>
                <a href="mailto:aldebaran.gibranaltaf1704@gmail.com">aldebaran.gibranaltaf1704@gmail.com</a>
            </div>
        </div>
        <div style="margin-top: 50px; text-align: center; opacity: 0.4; font-size: 0.8rem;">© 2025 Axon</div>
    </footer>`;

function loadElements() {
    const navPlacer = document.getElementById('navbar-placeholder');
    const footPlacer = document.getElementById('footer-placeholder');
    if (navPlacer) navPlacer.innerHTML = navTemplate;
    if (footPlacer) footPlacer.innerHTML = footerTemplate;
}
loadElements();

// --- 3. AUTH LOGIC ---
const path = window.location.pathname.toLowerCase();
const isAtLogin = path.includes('login');
const isAtIndex = path === '/' || path.includes('index');
const isPublic = path.includes('credits') || path.includes('license');

if (activeUser) {
    if (isAtLogin || isAtIndex) window.location.href = "home.html";
} else {
    if (!isAtLogin && !isAtIndex && !isPublic) window.location.href = "login.html";
}

function initUI() {
    if (activeUser) {
        const nameEl = document.getElementById('nav-user-name');
        const photoEl = document.getElementById('nav-user-photo');
        const navItem = document.getElementById('nav-user-item');
        const composerImg = document.getElementById('composer-img');
        if (nameEl) nameEl.innerText = activeUser.name;
        if (photoEl) photoEl.src = activeUser.photo;
        if (navItem) navItem.style.display = 'flex';
        if (composerImg) composerImg.src = activeUser.photo;

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.onclick = async () => {
                await auth.signOut();
                localStorage.removeItem('axonUser');
                window.location.href = "login.html";
            };
        }
    }
}
initUI();

// --- 4. FORUM ENGINE (REPAIRED) ---
const messagesDisplay = document.getElementById('messages-display');
const postBtn = document.getElementById('post-btn');
const postInput = document.getElementById('post-input');

// --- 4. FORUM ENGINE (SURGICAL REPAIR) ---
if (messagesDisplay) {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(postsPerPage));
    let isInitialSync = true;
    const loadBtn = document.getElementById('load-more-btn');

    onSnapshot(q, (snapshot) => {
        if (isInitialSync) {
            if (snapshot.docs.length > 0) {
                lastVisible = snapshot.docs[snapshot.docs.length - 1];
                console.log("Axon: Bookmark set to " + lastVisible.id);
                
                if (loadBtn && snapshot.docs.length >= postsPerPage) {
                    loadBtn.style.display = 'flex'; 
                }
            } else {
                console.log("Axon: Forum is empty.");
            }
        }
        
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" && !document.getElementById(change.doc.id)) {
                renderPost(change.doc, !isInitialSync && change.newIndex === 0);
            }
            if (change.type === "removed") {
                const el = document.getElementById(change.doc.id);
                if (el) el.remove();
            }
        });
        isInitialSync = false;
    });

    if (loadBtn) {
        // Force the click listener to bind to the function
        loadBtn.onclick = () => window.loadMore();
    }
}

function renderPost(docSnap, isNew) {
    const data = docSnap.data();
    const isMyPost = activeUser && data.uid === activeUser.uid;
    const postHTML = `
        <div class="post-card ${isNew ? 'drop-in' : ''}" id="${docSnap.id}">
            <div style="display: flex; gap: 12px;">
                <img src="${data.userPhoto}" style="width: 40px; height: 40px; border-radius: 50%;">
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #4da6ff; font-weight: bold;">${data.userName}</span>
                        ${isMyPost ? `<button onclick="deletePost('${docSnap.id}')" style="color:#ff4d4d; background:none; border:none; cursor:pointer;">&times;</button>` : ''}
                    </div>
                    <div style="color: #eee; margin-top: 8px;">${data.message}</div>
                    ${data.postImage ? `<img src="${data.postImage}" style="width:100%; border-radius:8px; margin-top:10px;">` : ''}
                </div>
            </div>
        </div>`;
    messagesDisplay.insertAdjacentHTML(isNew ? 'afterbegin' : 'beforeend', postHTML);
}

window.deletePost = async (id) => {
    const confirmDelete = confirm("Axon System: Permanent deletion of this post?");
    if (!confirmDelete) return;

    try {
        console.log("Deleting document ID:", id);
        
        // 1. Delete from Firebase
        await deleteDoc(doc(db, "posts", id));
        
        // 2. MANUAL REPAIR: Since onSnapshot isn't watching older posts,
        // we must manually find the element by its ID and remove it.
        const postElement = document.getElementById(id);
        if (postElement) {
            postElement.style.opacity = '0';
            postElement.style.transform = 'scale(0.9)';
            setTimeout(() => postElement.remove(), 300); // Smooth fade out
            console.log("UI Element removed manually.");
        }

    } catch (e) {
        console.error("Deletion failed:", e);
        alert("Error: Could not delete. Check your connection.");
    }
};

window.loadMore = async () => {
    const loadBtn = document.getElementById('load-more-btn');
    
    // 1. Safety check: Do we even have a bookmark?
    if (!lastVisible) {
        console.error("Load More Error: No 'lastVisible' document found to start from.");
        return;
    }
    
    if (!loadBtn) return;

    loadBtn.disabled = true;
    loadBtn.innerHTML = `<span class="material-symbols-rounded">sync</span> Loading...`;
    
    console.log("Attempting to load more posts starting after:", lastVisible.id);

    try {
        // 2. The Query
        const nextQ = query(
            collection(db, "posts"), 
            orderBy("createdAt", "desc"), 
            startAfter(lastVisible), 
            limit(postsPerPage)
        );

        const snap = await getDocs(nextQ);
        
        // 3. Check if we actually found anything
        if (snap.empty) {
            console.log("No more posts found in database.");
            loadBtn.innerHTML = "You've reached the end";
            loadBtn.style.opacity = "0.5";
            loadBtn.style.cursor = "default";
            setTimeout(() => { loadBtn.style.display = 'none'; }, 2500);
            return;
        }

        console.log(`Successfully fetched ${snap.docs.length} more posts.`);

        // 4. CRITICAL: Update the bookmark for the NEXT click
        lastVisible = snap.docs[snap.docs.length - 1];

        // 5. Render them
        snap.forEach(d => {
            // Only render if it doesn't already exist on screen
            if (!document.getElementById(d.id)) {
                renderPost(d, false); // false = no "drop-in" animation for old posts
            }
        });
        
        loadBtn.disabled = false;
        loadBtn.innerHTML = `<span class="material-symbols-rounded">refresh</span> Load More`;

    } catch (e) {
        console.error("Pagination Logic Failed:", e);
        loadBtn.innerText = "Error! Try again";
        loadBtn.disabled = false;
    }
};

if (postBtn && postInput) {
    postBtn.onclick = async () => {
        const text = postInput.value.trim();
        if (!text) return;
        try {
            await addDoc(collection(db, "posts"), {
                message: text, userName: activeUser.name, userPhoto: activeUser.photo,
                uid: activeUser.uid, createdAt: serverTimestamp()
            });
            postInput.value = "";
        } catch (e) { alert(e.message); }
    };
}

// --- 5. NEWS & CREDITS ---
async function initCredits() {
    const grid = document.getElementById('credits-grid');
    if (!grid) return;
    try {
        const res = await fetch('credits.json');
        const data = await res.json();
        grid.innerHTML = data.contributors.map(u => `
            <div class="credit-card">
                <img src="${u.img}">
                <div class="info">
                    <h3>${u.name}</h3>
                    <p class="role">${u.role}</p>
                </div>
                <p class="quote">"${u.quote}"</p>
            </div>`).join('');
    } catch (e) { console.error("Credits failed:", e); }
}
initCredits();

const FEATURED_ID = 'axon-alpha-release';
async function initFeaturedCard() {
    const container = document.getElementById('featured-news');
    if (!container) return;
    try {
        const res = await fetch('news/list.json');
        const list = await res.json();
        const article = list.find(a => a.id === FEATURED_ID);
        if (article) {
            container.innerHTML = `
                <div class="featured-card" onclick="location.href='news-viewer.html?id=${article.id}'">
                    <div class="featured-left">
                        <h1 class="featured-header">${article.title}</h1>
                        <p class="featured-text">${article.summary}</p>
                    </div>
                    <div class="featured-right"><img src="${article.thumbnail}" class="featured-image"></div>
                </div>`;
        }
    } catch (err) { console.error("Featured Error:", err); }
}
initFeaturedCard();

// --- 6. DEBUG UI ---
function updateDebugUI() {
    const content = document.getElementById('debug-content');
    if (!content) return;
    // Fix: Pull from sessionStorage, not a non-existent variable
    const logs = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
    content.innerHTML = logs.map(log => `
        <div style="margin-bottom:8px; border-bottom:1px solid #21262d; padding-bottom:4px;">
            <span style="color:#8b949e">[${log.time}]</span> <span style="color:#58a6ff">${log.page}:</span><br>
            <span style="color:${log.type === 'error' ? '#ff7b72' : '#7ee787'}">${log.message}</span>
        </div>`).reverse().join('');
}

(function initDebugSidebar() {
    if (document.getElementById('axon-debug-sidebar')) return; // Prevent double sidebar
    const sb = document.createElement('div');
    sb.id = 'axon-debug-sidebar';
    sb.style = "position:fixed; top:0; right:-350px; width:320px; height:100%; background:#0d1117; border-left:2px solid #4da6ff; color:#7ee787; font-family:monospace; font-size:11px; padding:15px; z-index:10000; overflow-y:auto; transition:0.3s; box-shadow:-10px 0 20px rgba(0,0,0,0.8);";
    sb.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #4da6ff;"><h3 style="margin:0; color:#4da6ff;">AXON_LOG</h3><button id="clr-logs" style="background:#ff4d4d; color:white; border:none; padding:2px 5px; cursor:pointer;">CLR</button></div><div id="debug-content"></div>`;
    document.body.appendChild(sb);
    
    document.getElementById('clr-logs').onclick = () => { sessionStorage.removeItem(LOG_KEY); updateDebugUI(); };
    
    window.addEventListener('keydown', (e) => {
        if (e.shiftKey && e.key.toLowerCase() === 'd') {
            sb.style.right = sb.style.right === '0px' ? '-350px' : '0px';
        }
    });
    updateDebugUI();
})();