import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, OAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Configuração do projeto Firebase (pode ser pública)
const firebaseConfig = {
  apiKey: "AIzaSyDqRlLvI8amZMu-P5cXM-bVS9xkNLVz4kY",
  authDomain: "epbjc-r-de-equipamentos.firebaseapp.com",
  projectId: "epbjc-r-de-equipamentos",
  storageBucket: "epbjc-r-de-equipamentos.firebasestorage.app",
  messagingSenderId: "465236000425",
  appId: "1:465236000425:web:eb0c6f5eab1603e89d73b8"
};

const DOMINIO = "alunos.epbjc.pt";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Atalho para ir buscar elementos da página
const $ = (id) => document.getElementById(id);

function mostrarMensagem(texto, tipo = "") {
  const m = $("mensagem");
  m.textContent = texto;
  m.className = tipo;
  m.hidden = !texto;
}

// ---------- LOGIN / LOGOUT ----------
$("btn-entrar").addEventListener("click", async () => {
  mostrarMensagem("");
  const provider = new OAuthProvider("microsoft.com");
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error(e);
    mostrarMensagem("Não foi possível iniciar sessão (" + e.code + ").", "erro");
  }
});

$("btn-sair").addEventListener("click", () => signOut(auth));

// Corre sempre que o estado de autenticação muda
onAuthStateChanged(auth, async (user) => {
  if (!user) return mostrarEcra(false);

  const email = (user.email || "").toLowerCase();

  // Verificação 1: domínio institucional
  if (!email.endsWith("@" + DOMINIO)) {
    mostrarMensagem("Usa a conta @" + DOMINIO + ".", "erro");
    return signOut(auth);
  }
  // Verificação 2: whitelist (documento authorizedUsers/<email> com active == true)
  try {
    const snap = await getDoc(doc(db, "authorizedUsers", email));
    if (!snap.exists() || snap.data().active !== true) {
      mostrarMensagem("A conta " + email + " não está autorizada.", "erro");
      return signOut(auth);
    }
  } catch (e) {
    console.error(e);
    mostrarMensagem("Erro ao verificar autorização (" + e.code + ").", "erro");
    return signOut(auth);
  }

  $("nome-utilizador").textContent = user.displayName || email;
  mostrarEcra(true);
  carregarPedidos(user);
});

function mostrarEcra(autenticado) {
  $("ecra-login").hidden = autenticado;
  $("ecra-app").hidden = !autenticado;
  $("sessao").hidden = !autenticado;
  if (autenticado) mostrarMensagem("");
}

// ---------- CRIAR REQUISIÇÃO ----------
function gerarCodigo() {
  const d = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `REQ-${d}-${r}`;
}

$("form-requisicao").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const user = auth.currentUser;
  const dataPedido = $("dataPedido").value;
  const devolucaoPrevista = $("devolucaoPrevista").value;

  if (devolucaoPrevista < dataPedido) {
    return mostrarMensagem("A devolução tem de ser igual ou posterior à data do pedido.", "erro");
  }

  const botao = ev.submitter;
  botao.disabled = true;
  try {
    await addDoc(collection(db, "requisicoes"), {
      codigo: gerarCodigo(),
      uid: user.uid,
      requisitante: user.displayName || "",
      email: user.email.toLowerCase(),
      equipamento: $("equipamento").value,
      dataPedido,
      devolucaoPrevista,
      estado: "Pendente",
      observacoes: $("observacoes").value.trim(),
      criadoEm: serverTimestamp()
    });
    ev.target.reset();
    mostrarMensagem("Requisição enviada. Estado: Pendente.", "ok");
    carregarPedidos(user);
  } catch (e) {
    console.error(e);
    mostrarMensagem("Não foi possível enviar (" + e.code + ").", "erro");
  } finally {
    botao.disabled = false;
  }
});

// ---------- LER OS MEUS PEDIDOS ----------
async function carregarPedidos(user) {
  const corpo = $("corpo-tabela");
  corpo.replaceChildren();
  try {
    // O filtro por uid é obrigatório: as regras só deixam ler pedidos próprios
    const q = query(collection(db, "requisicoes"), where("uid", "==", user.uid));
    const res = await getDocs(q);
    const pedidos = res.docs.map((d) => d.data())
      .sort((a, b) => (b.dataPedido || "").localeCompare(a.dataPedido || ""));

    $("vazio").hidden = pedidos.length > 0;
    $("tabela").hidden = pedidos.length === 0;

    for (const p of pedidos) {
      const tr = document.createElement("tr");
      for (const valor of [p.codigo, p.equipamento, p.dataPedido, p.devolucaoPrevista, p.estado]) {
        const td = document.createElement("td");
        td.textContent = valor ?? "";   // textContent evita injeção de HTML
        tr.appendChild(td);
      }
      corpo.appendChild(tr);
    }
  } catch (e) {
    console.error(e);
    mostrarMensagem("Não foi possível carregar os pedidos (" + e.code + ").", "erro");
  }
}
