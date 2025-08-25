// Firebase SDK (CDN, v10.12.4)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-analytics.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, getDocs,
  collection, query, orderBy, serverTimestamp, onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* ==== 1) Firebase config (your project) ==== */
const firebaseConfig = {
  apiKey: "AIzaSyCvPtBqPQJz-xaXDWA65lsmloBid4IsieI",
  authDomain: "apk-chat-6e708.firebaseapp.com",
  databaseURL: "https://apk-chat-6e708-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "apk-chat-6e708",
  storageBucket: "apk-chat-6e708.firebasestorage.app",
  messagingSenderId: "460028192410",
  appId: "1:460028192410:web:b198ac909e07e2ebb8e123",
  measurementId: "G-J6N73TJVPC"
};

const app = initializeApp(firebaseConfig);
getAnalytics(app); // optional
const auth = getAuth(app);
const db = getFirestore(app);

/* ==== 2) UI elements ==== */
const authModal = document.getElementById("authModal");
const authErrorEl = document.getElementById("authError");
const googleBtn = document.getElementById("googleBtn");
const emailInput = document.getElementById("emailInput");
const passInput = document.getElementById("passInput");
const emailSignInBtn = document.getElementById("emailSignInBtn");
const emailSignUpBtn = document.getElementById("emailSignUpBtn");

const appEl = document.getElementById("app");
const meAvatar = document.getElementById("meAvatar");
const meName = document.getElementById("meName");
const meEmail = document.getElementById("meEmail");
const peopleList = document.getElementById("peopleList");

const peerAvatar = document.getElementById("peerAvatar");
const peerName = document.getElementById("peerName");
const peerStatus = document.getElementById("peerStatus");

const messagesEl = document.getElementById("messages");
const msgForm = document.getElementById("msgForm");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const signOutBtn = document.getElementById("signOutBtn");
const refreshBtn = document.getElementById("refreshBtn");
const replyChip = document.getElementById("replyChip");
const replyText = document.getElementById("replyText");
const replyCancel = document.getElementById("replyCancel");

const menuBtn = document.getElementById("menuBtn");
const closeDrawerBtn = document.getElementById("closeDrawerBtn");
const drawerOverlay = document.getElementById("drawerOverlay");
const sendError = document.getElementById("sendError");

/* ==== 3) State ==== */
let currentUser = null;
let currentPeer = null;
let currentChatId = null;
let unsubscribeMessages = null;
let replyContext = null; // { id, text, senderName }

/* ==== 4) Drawer helpers (mobile full-screen) ==== */
function openDrawer() { document.body.classList.add("drawer-open"); }
function closeDrawer() { document.body.classList.remove("drawer-open"); }
menuBtn?.addEventListener("click", openDrawer);
closeDrawerBtn?.addEventListener("click", closeDrawer);
drawerOverlay?.addEventListener("click", closeDrawer);

/* ==== 5) Auth ==== */
const provider = new GoogleAuthProvider();

googleBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) { showError(e); }
});

emailSignInBtn.addEventListener("click", async () => {
  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value.trim());
  } catch (e) { showError(e); }
});

emailSignUpBtn.addEventListener("click", async () => {
  try {
    const email = emailInput.value.trim();
    const pass = passInput.value.trim();
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (!cred.user.displayName) {
      await updateProfile(cred.user, { displayName: email.split("@")[0] });
    }
  } catch (e) { showError(e); }
});

signOutBtn.addEventListener("click", () => signOut(auth));
refreshBtn.addEventListener("click", () => loadPeople());

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    authModal.classList.remove("show");
    appEl.classList.remove("hidden");
    await ensureUserProfile(user);
    renderMe(user);
    await loadPeople();
    updateSendEnabled();
  } else {
    appEl.classList.add("hidden");
    authModal.classList.add("show");
    clearChat();
  }
});

/* ==== 6) User profile ==== */
async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const base = {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "Anonymous",
    email: user.email || "",
    photoURL: user.photoURL || `https://api.dicebear.com/8.x/personas/svg?seed=${encodeURIComponent(user.uid)}`
  };
  if (!snap.exists()) {
    await setDoc(ref, { ...base, createdAt: serverTimestamp() }, { merge: true });
  } else {
    await setDoc(ref, base, { merge: true });
  }
}

function renderMe(user) {
  meAvatar.src = user.photoURL || `https://api.dicebear.com/8.x/personas/svg?seed=${encodeURIComponent(user.uid)}`;
  meName.textContent = user.displayName || user.email || "You";
  meEmail.textContent = user.email || "";
}

/* ==== 7) People list ==== */
async function loadPeople() {
  if (!currentUser) return;
  peopleList.innerHTML = "";
  const q = query(collection(db, "users"));
  const qs = await getDocs(q);
  const frag = document.createDocumentFragment();
  qs.forEach((docSnap) => {
    const u = docSnap.data();
    if (u.uid === currentUser.uid) return;
    const el = personItem(u);
    frag.appendChild(el);
  });
  if (!frag.childNodes.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No other users yet.";
    frag.appendChild(empty);
  }
  peopleList.appendChild(frag);
}

function personItem(u) {
  const div = document.createElement("div");
  div.className = "person";
  div.innerHTML = `
    <img class="avatar" src="${u.photoURL || ""}" alt="">
    <div>
      <div class="name">${escapeHtml(u.displayName || u.email || "User")}</div>
      <div class="email">${escapeHtml(u.email || "")}</div>
    </div>
  `;
  div.addEventListener("click", () => {
    openChatWith(u);
    closeDrawer(); // close full-screen drawer on mobile
  });
  return div;
}

/* ==== 8) Chat open / deterministic chatId ==== */
function makeChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

async function openChatWith(peer) {
  currentPeer = peer;
  currentChatId = makeChatId(currentUser.uid, peer.uid);
  peerName.textContent = peer.displayName || peer.email || "Unknown";
  peerStatus.textContent = peer.email || "";
  peerAvatar.src = peer.photoURL || "";

  await ensureChatDoc(currentChatId, currentUser, peer);
  subscribeMessages(currentChatId);
  updateSendEnabled();
}

/* Create chat document lazily */
async function ensureChatDoc(chatId, me, peer) {
  const ref = doc(db, "chats", chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      participants: [me.uid, peer.uid],
      meta: {
        [me.uid]: { name: me.displayName || me.email, photo: me.photoURL || "" },
        [peer.uid]: { name: peer.displayName || peer.email, photo: peer.photoURL || "" }
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } else {
    try {
      await updateDoc(ref, { updatedAt: serverTimestamp() });
    } catch (_) { /* ignore strict rule */ }
  }
}

/* ==== 9) Messages stream ==== */
function subscribeMessages(chatId) {
  if (unsubscribeMessages) unsubscribeMessages();
  messagesEl.innerHTML = "";
  let lastDayKey = "";

  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "asc")
  );

  unsubscribeMessages = onSnapshot(q, (qs) => {
    messagesEl.innerHTML = "";
    lastDayKey = "";
    qs.forEach((docSnap) => {
      const msg = { id: docSnap.id, ...docSnap.data() };
      const dayKey = formatDayKey(msg.createdAt);
      if (dayKey !== lastDayKey) {
        messagesEl.appendChild(daySeparator(dayKey));
        lastDayKey = dayKey;
      }
      messagesEl.appendChild(messageBubble(msg));
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

/* ==== 10) Sending, reply, reactions ==== */
msgForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  sendError.textContent = "";

  if (!currentUser) {
    sendError.textContent = "Please sign in first.";
    return;
  }
  if (!currentChatId || !currentPeer) {
    sendError.textContent = "প্রথমে একটি person সিলেক্ট করুন।";
    return;
  }

  const text = msgInput.value.trim();
  if (!text) { updateSendEnabled(); return; }

  sendBtn.disabled = true;
  try {
    const payload = {
      text,
      senderId: currentUser.uid,
      createdAt: serverTimestamp(),
      reply: replyContext ? {
        id: replyContext.id,
        text: replyContext.text,
        senderName: replyContext.senderName
      } : null,
      reactions: {} // emoji -> [uids]
    };
    await addDoc(collection(db, "chats", currentChatId, "messages"), payload);
    msgInput.value = "";
    clearReply();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (e2) {
    console.error(e2);
    sendError.textContent = humanizeError(e2);
  } finally {
    updateSendEnabled();
  }
});

replyCancel.addEventListener("click", clearReply);

function setReply(ctx) {
  replyContext = ctx;
  replyText.textContent = `Replying to ${ctx.senderName}: ${ctx.text}`;
  replyChip.classList.remove("hidden");
}
function clearReply() {
  replyContext = null;
  replyChip.classList.add("hidden");
}

/* Toggle reaction atomically */
async function toggleReaction(chatId, msgId, emoji, uid) {
  const ref = doc(db, "chats", chatId, "messages", msgId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const reactions = { ...(data.reactions || {}) };
    const arr = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    const has = arr.includes(uid);
    const next = has ? arr.filter(x => x !== uid) : [...arr, uid];
    reactions[emoji] = next;
    tx.update(ref, { reactions });
  });
}

/* ==== 11) Render helpers ==== */
function messageBubble(m) {
  const isMe = m.senderId === currentUser.uid;
  const div = document.createElement("div");
  div.className = `msg ${isMe ? "me" : "other"}`;

  const quote = m.reply ? `
    <div class="reply-quote">
      <div style="opacity:.8">${escapeHtml(m.reply.senderName || "User")}</div>
      <div style="opacity:.9">${escapeHtml(truncate(m.reply.text, 120))}</div>
    </div>` : "";

  div.innerHTML = `
    <div class="react-bar">
      <span class="react-btn">👍</span>
      <span class="react-btn">😂</span>
      <span class="react-btn">❤️</span>
      <span class="react-btn">🔥</span>
      <span class="react-btn">😮</span>
    </div>

    <div class="msg-reply">Reply</div>

    ${quote}
    <div>${linkify(escapeHtml(m.text || ""))}</div>

    <div class="meta">
      <span>${formatTime(m.createdAt)}</span>
      <span>${isMe ? "You" : ""}</span>
    </div>

    <div class="msg-reactions">
      ${renderReactions(m.reactions || {}, currentUser.uid)}
    </div>
  `;

  div.querySelectorAll(".react-btn").forEach(btn => {
    btn.addEventListener("click", () => toggleReaction(currentChatId, m.id, btn.textContent, currentUser.uid));
  });

  div.querySelector(".msg-reply").addEventListener("click", () => {
    setReply({
      id: m.id,
      text: truncate(m.text || "", 140),
      senderName: m.senderId === currentUser.uid ? "You" : (currentPeer?.displayName || "User")
    });
  });

  return div;
}

function renderReactions(reactions, myUid) {
  const parts = [];
  Object.entries(reactions).forEach(([emoji, arr]) => {
    if (!Array.isArray(arr) || arr.length === 0) return;
    const mine = arr.includes(myUid) ? "outline:1px solid rgba(255,255,255,.3);border-radius:8px;padding:0 4px" : "";
    parts.push(`<span style="background:rgba(255,255,255,.08);padding:0 6px;border-radius:8px;${mine}">${emoji} ${arr.length}</span>`);
  });
  return parts.join(" ");
}

function daySeparator(dayKey) {
  const el = document.createElement("div");
  el.className = "day-sep";
  el.textContent = dayKey;
  return el;
}

function clearChat() {
  currentPeer = null;
  currentChatId = null;
  if (unsubscribeMessages) unsubscribeMessages();
  messagesEl.innerHTML = `<div class="day-sep">No conversation yet</div>`;
  peerName.textContent = "Select a person";
  peerStatus.textContent = "—";
  peerAvatar.src = "";
  updateSendEnabled();
}

function showError(e) {
  console.error(e);
  authErrorEl.textContent = e?.message || "Something went wrong";
}

function humanizeError(e) {
  const m = String(e?.code || e?.message || e);
  if (m.includes("permission-denied")) return "পারমিশন নেই: Firestore rules/Authorized domain চেক করুন।";
  if (m.includes("unauthenticated")) return "লগইন প্রয়োজন—দয়া করে সাইন‑ইন করুন।";
  return "মেসেজ পাঠাতে সমস্যা হচ্ছে। পরে আবার চেষ্টা করুন।";
}

/* ==== 12) Utilities ==== */
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function linkify(text) {
  const urlRe = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRe, url => `<a href="${url}" target="_blank" rel="noopener" style="color:var(--accent)">${url}</a>`);
}
function tsToDate(ts) {
  if (!ts) return new Date();
  if (ts.toDate) return ts.toDate();
  return new Date(ts.seconds ? ts.seconds * 1000 : ts);
}
function formatTime(ts) {
  const d = tsToDate(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}
function formatDayKey(ts) {
  const d = tsToDate(ts);
  const today = new Date(); today.setHours(0,0,0,0);
  const dMid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((today - dMid) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/* ==== 13) Send button enable logic ==== */
function updateSendEnabled() {
  const ok = !!currentChatId && msgInput.value.trim().length > 0;
  sendBtn.disabled = !ok;
}
msgInput.addEventListener("input", updateSendEnabled);
updateSendEnabled();
