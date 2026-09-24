const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const CHAVE_SECRETA = 'DPCRIM_CHAVE_MESTRA_SEGURA_2026';

const membrosDB = new Map();
const usuariosDB = new Map();
const logsDB = [];

usuariosDB.set('admin@dpcrim.org', {
  nome: 'Administrador DPCRIM',
  email: 'admin@dpcrim.org',
  senha: 'admin',
  nivel: 'ADMIN',
  dataCriacao: new Date().toLocaleDateString('pt-BR')
});

function registrarLog(usuario, acao, detalhe) {
  logsDB.unshift({
    dataHora: new Date().toLocaleString('pt-BR'),
    usuario: usuario || 'SISTEMA',
    acao: acao || 'AÇÃO',
    detalhe: detalhe || ''
  });
}

registrarLog('SISTEMA', 'Servidor Iniciado', 'Aplicações DPCRIM operacionais');

function mascararCPF(cpf) {
  const limpo = (cpf || '').replace(/\D/g, '');
  if (limpo.length !== 11) return '***.***.***-**';
  return limpo.substring(0, 3) + '.***.***-' + limpo.substring(9);
}

function gerarTokenSeguro(cpf) {
  const cpfLimpo = (cpf || '').replace(/\D/g, '');
  const timestamp = Date.now();
  const payload = cpfLimpo + ':' + timestamp;
  const hmac = crypto.createHmac('sha256', CHAVE_SECRETA).update(payload).digest('hex');
  return Buffer.from(payload + ':' + hmac).toString('hex');
}

function validarTokenSeguro(tokenHex) {
  try {
    const decodificado = Buffer.from(tokenHex, 'hex').toString('utf8');
    const partes = decodificado.split(':');
    const cpfLimpo = partes[0];
    const timestamp = partes[1];
    const hmacRecebido = partes[2];
    const payload = cpfLimpo + ':' + timestamp;
    const hmacEsperado = crypto.createHmac('sha256', CHAVE_SECRETA).update(payload).digest('hex');
    if (hmacRecebido !== hmacEsperado) return null;
    return cpfLimpo;
  } catch (e) {
    return null;
  }
}

// 1. ROUTE DA PÁGINA INICIAL
app.get('/', (req, res) => {
  res.send('<!DOCTYPE html>' +
'<html lang="pt-BR">' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>DPCRIM - Painel de Gestão</title>' +
'  <script src="https://cdn.tailwindcss.com"></script>' +
'</head>' +
'<body class="bg-slate-900 min-h-screen flex flex-col justify-between p-4 font-sans text-slate-800">' +
'  <div class="my-auto flex flex-col items-center justify-center w-full">' +
'    <div id="telaLogin" class="max-w-md w-full bg-white p-6 sm:p-8 rounded-2xl shadow-2xl border border-slate-700">' +
'      <div class="text-center mb-6">' +
'        <div class="bg-red-700 text-white font-black text-xl py-3 px-6 rounded-xl inline-block shadow">DPCRIM</div>' +
'        <h1 class="text-sm font-bold text-slate-800 uppercase tracking-wider mt-3">Painel Administrativo</h1>' +
'        <p class="text-xs text-slate-500">Acesso exclusivo para administradores</p>' +
'      </div>' +
'      <div class="space-y-4">' +
'        <div>' +
'          <label class="block text-xs font-bold uppercase text-slate-700 mb-1">E-mail Administrativo</label>' +
'          <input type="email" id="email" value="admin@dpcrim.org" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-red-700">' +
'        </div>' +
'        <div>' +
'          <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Senha de Segurança</label>' +
'          <input type="password" id="senha" value="admin" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-red-700">' +
'        </div>' +
'        <button type="button" id="btnEntrar" onclick="fazerLogin()" class="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3.5 rounded-xl text-sm shadow-md transition uppercase">ENTRAR NO PAINEL</button>' +
'      </div>' +
'      <div class="mt-6 border-t pt-4 text-center">' +
'        <a href="/filiados" class="text-xs text-slate-600 hover:text-red-700 font-bold underline">🔍 Ir para a Consulta Pública de Filiados</a>' +
'      </div>' +
'    </div>' +
'    <div id="painelAdmin" class="hidden w-full max-w-4xl bg-white p-6 rounded-2xl shadow-xl border border-slate-200 my-4">' +
'      <div class="flex justify-between items-center bg-slate-900 text-white p-4 rounded-xl mb-6">' +
'        <div>' +
'          <h2 class="font-bold text-lg">DPCRIM • Painel Interno</h2>' +
'          <p id="usrLogado" class="text-xs text-slate-300"></p>' +
'        </div>' +
'        <button onclick="location.reload()" class="bg-red-700 hover:bg-red-800 text-white text-xs px-3 py-1.5 rounded-lg font-bold">SAIR</button>' +
'      </div>' +
'      <div class="flex flex-wrap border-b border-slate-200 mb-6 gap-2">' +
'        <button id="tabCadBtn" onclick="mudarAba(\'cad\')" class="py-2 px-3 font-bold text-xs uppercase rounded-t-lg bg-slate-900 text-white">➕ Cadastrar Membro</button>' +
'        <button id="tabListBtn" onclick="mudarAba(\'list\')" class="py-2 px-3 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600">📋 Lista de Membros</button>' +
'        <button id="tabAccBtn" onclick="mudarAba(\'acc\')" class="py-2 px-3 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600">👤 Cadastrar Acessos</button>' +
'        <button id="tabLogsBtn" onclick="mudarAba(\'logs\')" class="py-2 px-3 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600">📜 Logs de Acesso</button>' +
'      </div>' +
'      <div id="abaCadastro">' +
'        <div class="space-y-6">' +
'          <div class="border-b pb-4">' +
'            <h3 class="text-xs font-bold uppercase text-slate-800 mb-3">1. Dados do Membro Filiado</h3>' +
'            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
'              <div class="sm:col-span-2">' +
'                <label class="block text-xs font-bold text-slate-700 mb-1">NOME COMPLETO *</label>' +
'                <input type="text" id="cadNome" placeholder="Ex: Dr. Carlos Eduardo Silva" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm">' +
'              </div>' +
'              <div>' +
'                <label class="block text-xs font-bold text-slate-700 mb-1">NÚMERO DE INSCRIÇÃO *</label>' +
'                <input type="text" id="cadInscricao" placeholder="Ex: INC-2026-001" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm">' +
'              </div>' +
'              <div>' +
'                <label class="block text-xs font-bold text-slate-700 mb-1">CPF *</label>' +
'                <input type="text" id="cadCPF" placeholder="123.456.789-00" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm">' +
'              </div>' +
'              <div>' +
'                <label class="block text-xs font-bold text-slate-700 mb-1">RG / ÓRGÃO EXPEDIDOR</label>' +
'                <input type="text" id="cadRG" placeholder="12.345.678-X SSP/SP" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm">' +
'              </div>' +
'            </div>' +
'          </div>' +
'          <div>' +
'            <h3 class="text-xs font-bold uppercase text-slate-800 mb-3">2. Curso e Especialização</h3>' +
'            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
'              <div class="sm:col-span-2">' +
'                <label class="block text-xs font-bold text-slate-700 mb-1">CURSO / ESPECIALIDADE *</label>' +
'                <input type="text" id="cadCurso" placeholder="Ex: Perícia Forense Computacional" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm">' +
'              </div>' +
'              <div>' +
'                <label class="block text-xs font-bold text-slate-700 mb-1">CARGA HORÁRIA (HORAS)</label>' +
'                <input type="number" id="cadCarga" placeholder="120" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm">' +
'              </div>' +
'              <div>' +
'                <label class="block text-xs font-bold text-slate-700 mb-1">FOTO DO PERITO</label>' +
'                <input type="file" id="cadFoto" accept="image/*" class="w-full p-1 border rounded-lg bg-slate-50 text-xs">' +
'              </div>' +
'            </div>' +
'          </div>' +
'          <button type="button" onclick="salvarMembro()" class="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl text-sm uppercase shadow">CADASTRAR E EMITIR CREDENCIAL</button>' +
'        </div>' +
'        <div id="resCadastro" class="mt-6 hidden border-t pt-4 text-center space-y-4">' +
'          <div class="bg-emerald-100 border border-emerald-400 text-emerald-800 p-4 rounded-xl text-center font-bold text-sm">🎉 Cadastro gravado com sucesso no sistema DPCRIM!</div>' +
'          <div id="cardCredencial" class="max-w-md mx-auto bg-slate-900 text-white p-5 rounded-2xl text-left border border-slate-700 shadow-xl space-y-3"></div>' +
'          <button onclick="imprimirPDF()" class="bg-red-700 hover:bg-red-800 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase shadow">🖨️ IMPRIMIR / GERAR PDF DA CREDENCIAL</button>' +
'        </div>' +
'      </div>' +
'      <div id="abaLista" class="hidden space-y-4">' +
'        <input type="text" id="filtroLista" onkeyup="filtrarLista()" placeholder="🔍 Pesquisar por nome, CPF ou inscrição..." class="w-full p-2.5 border rounded-xl bg-slate-50 text-xs outline-none">' +
'        <div class="overflow-x-auto border rounded-xl">' +
'          <table class="w-full text-xs text-left border-collapse">' +
'            <thead>' +
'              <tr class="bg-slate-900 text-white uppercase text-[10px]">' +
'                <th class="p-3">Foto</th><th class="p-3">Nome Completo</th><th class="p-3">Inscrição</th><th class="p-3">CPF</th><th class="p-3">Curso</th><th class="p-3 text-center">Ações</th>' +
'              </tr>' +
'            </thead>' +
'            <tbody id="tabelaMembros" class="divide-y divide-slate-200"></tbody>' +
'          </table>' +
'        </div>' +
'      </div>' +
'      <div id="abaAcessos" class="hidden space-y-6">' +
'        <div class="space-y-4 border p-4 rounded-xl bg-slate-50">' +
'          <h3 class="text-xs font-bold uppercase text-slate-800">Cadastrar Novo Usuário Administrativo</h3>' +
'          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
'            <div>' +
'              <label class="block text-xs font-bold text-slate-700 mb-1">NOME COMPLETO *</label>' +
'              <input type="text" id="usrNome" placeholder="Ex: Maria Secretária" class="w-full p-2.5 border rounded-lg bg-white text-sm">' +
'            </div>' +
'            <div>' +
'              <label class="block text-xs font-bold text-slate-700 mb-1">E-MAIL DE LOGIN *</label>' +
'              <input type="email" id="usrEmail" placeholder="operador@dpcrim.org" class="w-full p-2.5 border rounded-lg bg-white text-sm">' +
'            </div>' +
'            <div>' +
'              <label class="block text-xs font-bold text-slate-700 mb-1">SENHA *</label>' +
'              <input type="password" id="usrSenha" placeholder="••••••••" class="w-full p-2.5 border rounded-lg bg-white text-sm">' +
'            </div>' +
'            <div>' +
'              <label class="block text-xs font-bold text-slate-700 mb-1">NÍVEL DE PERMISSÃO</label>' +
'              <select id="usrNivel" class="w-full p-2.5 border rounded-lg bg-white text-sm font-bold">' +
'                <option value="OPERADOR">Operador</option>' +
'                <option value="ADMIN">Administrador</option>' +
'              </select>' +
'            </div>' +
'          </div>' +
'          <button type="button" onclick="salvarNovoUsuario()" class="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3 rounded-xl text-xs uppercase shadow">CADASTRAR NOVO USUÁRIO</button>' +
'        </div>' +
'        <div>' +
'          <h3 class="text-xs font-bold uppercase text-slate-800 mb-2">Usuários com Acesso</h3>' +
'          <div class="overflow-x-auto border rounded-xl">' +
'            <table class="w-full text-xs text-left border-collapse">' +
'              <thead>' +
'                <tr class="bg-slate-900 text-white uppercase text-[10px]">' +
'                  <th class="p-2.5">Nome</th><th class="p-2.5">E-mail</th><th class="p-2.5">Nível</th><th class="p-2.5">Data Cadastro</th>' +
'                </tr>' +
'              </thead>' +
'              <tbody id="tabelaUsuarios" class="divide-y divide-slate-200"></tbody>' +
'            </table>' +
'          </div>' +
'        </div>' +
'      </div>' +
'      <div id="abaLogs" class="hidden space-y-4">' +
'        <h3 class="text-xs font-bold uppercase text-slate-800">Histórico de Acessos e Auditoria</h3>' +
'        <div class="overflow-x-auto border rounded-xl">' +
'          <table class="w-full text-xs text-left border-collapse">' +
'            <thead>' +
'              <tr class="bg-slate-900 text-white uppercase text-[10px]">' +
'                <th class="p-2.5">Data/Hora</th><th class="p-2.5">Usuário</th><th class="p-2.5">Ação Realizada</th><th class="p-2.5">Detalhes</th>' +
'              </tr>' +
'            </thead>' +
'            <tbody id="tabelaLogs" class="divide-y divide-slate-200"></tbody>' +
'          </table>' +
'        </div>' +
'      </div>' +
'    </div>' +
'  </div>' +
'  <footer class="w-full text-center py-4 text-xs text-slate-400 border-t border-slate-800 mt-auto">Desenvolvido por <strong class="text-white">Lusana Verissimo</strong></footer>' +
'  <script>' +
'    var fotoBase64 = "";' +
'    var usuarioAtualEmail = "";' +
'    var listaMembrosCache = [];' +
'    var ultimoMembroCadastrado = null;' +
'    var cadFotoEl = document.getElementById("cadFoto");' +
'    if (cadFotoEl) {' +
'      cadFotoEl.addEventListener("change", function(e) {' +
'        var file = e.target.files[0];' +
'        if (file) {' +
'          var reader = new FileReader();' +
'          reader.onload = function(event) { fotoBase64 = event.target.result; };' +
'          reader.readAsDataURL(file);' +
'        }' +
'      });' +
'    }' +
'    function mudarAba(aba) {' +
'      document.getElementById("abaCadastro").className = (aba === "cad" ? "" : "hidden");' +
'      document.getElementById("abaLista").className = (aba === "list" ? "" : "hidden");' +
'      document.getElementById("abaAcessos").className = (aba === "acc" ? "" : "hidden");' +
'      document.getElementById("abaLogs").className = (aba === "logs" ? "" : "hidden");' +
'      document.getElementById("tabCadBtn").className = aba === "cad" ? "py-2 px-3 font-bold text-xs uppercase rounded-t-lg bg-slate-900 text-white" : "py-2 px-3 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600";' +
'      document.getElementById("tabListBtn").className = aba === "list" ? "py-2 px-3 font-bold text-xs uppercase rounded-t-lg bg-slate-900 text-white" : "py-2 px-3 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600";' +
'      document.getElementById("tabAccBtn").className = aba === "acc" ? "py-2 px-3 font-bold text-xs uppercase rounded-t-lg bg-slate-900 text-white" : "py-2 px-3 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600";' +
'      document.getElementById("tabLogsBtn").className = aba === "logs" ? "py-2 px-3 font-bold text-xs uppercase rounded-t-lg bg-slate-900 text-white" : "py-2 px-3 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600";' +
'      if (aba === "list") carregarListaMembros();' +
'      if (aba === "acc") carregarUsuarios();' +
'      if (aba === "logs") carregarLogs();' +
'    }' +
'    function fazerLogin() {' +
'      var email = document.getElementById("email").value.trim();' +
'      var senha = document.getElementById("senha").value.trim();' +
'      if (!email || !senha) { alert("Por favor, digite e-mail e senha."); return; }' +
'      fetch("/api/login", {' +
'        method: "POST",' +
'        headers: { "Content-Type": "application/json" },' +
'        body: JSON.stringify({ email: email, senha: senha })' +
'      })' +
'      .then(function(res) { return res.json(); })' +
'      .then(function(data) {' +
'        if (data.success) {' +
'          usuarioAtualEmail = email;' +
'          document.getElementById("usrLogado").innerText = "Operador: " + email;' +
'          document.getElementById("telaLogin").className = "hidden";' +
'          document.getElementById("painelAdmin").className = "w-full max-w-4xl bg-white p-6 rounded-2xl shadow-xl border border-slate-200 my-4";' +
'        } else {' +
'          alert("Acesso negado: E-mail ou senha incorretos.");' +
'        }' +
'      })' +
'      .catch(function(err) { alert("Erro ao conectar ao servidor."); });' +
'    }' +
'    function salvarMembro() {' +
'      var nome = document.getElementById("cadNome").value.trim();' +
'      var inscricao = document.getElementById("cadInscricao").value.trim();' +
'      var cpf = document.getElementById("cadCPF").value.trim();' +
'      var curso = document.getElementById("cadCurso").value.trim();' +
'      if (!nome || !inscricao || !cpf || !curso) { alert("Preencha os campos obrigatórios (*)."); return; }' +
'      fetch("/api/membros", {' +
'        method: "POST",' +
'        headers: { "Content-Type": "application/json" },' +
'        body: JSON.stringify({' +
'          nome: nome, inscricao: inscricao, cpf: cpf,' +
'          rg: document.getElementById("cadRG").value,' +
'          curso: curso, cargaHoraria: document.getElementById("cadCarga").value,' +
'          fotoBase64: fotoBase64, operador: usuarioAtualEmail' +
'        })' +
'      })' +
'      .then(function(res) { return res.json(); })' +
'      .then(function(data) {' +
'        if (data.success) {' +
'          ultimoMembroCadastrado = Object.assign({}, data.membro, { qrCode: data.qrCode });' +
'          var fotoHtml = data.membro.fotoBase64 ? "<img src=\\"" + data.membro.fotoBase64 + "\\" class=\\"w-16 h-20 object-cover rounded border border-slate-700\\">" : "";' +
'          document.getElementById("cardCredencial").innerHTML =' +
'            "<div class=\\"bg-red-700 text-[10px] font-bold px-2 py-0.5 rounded w-max uppercase mb-2\\">DPCRIM • Credencial</div>" +' +
'            "<div class=\\"flex space-x-4 items-center\\">" + fotoHtml +' +
'              "<div class=\\"text-xs space-y-1\\">" +' +
'                "<p class=\\"font-bold text-sm text-white\\">" + data.membro.nome + "</p>" +' +
'                "<p class=\\"text-slate-300\\">INSCRIÇÃO: " + data.membro.inscricao + "</p>" +' +
'                "<p class=\\"text-slate-300\\">CPF: " + data.membro.cpfMascarado + "</p>" +' +
'                "<p class=\\"text-red-300 font-semibold\\">" + data.membro.curso + "</p>" +' +
'              "</div>" +' +
'            "</div>" +' +
'            "<div class=\\"mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between items-center\\">" +' +
'              "<span>REGISTRO: " + data.membro.codigo + "</span>" +' +
'              "<img src=\\"" + data.qrCode + "\\" class=\\"w-12 h-12 bg-white p-0.5 rounded\\">" +' +
'            "</div>";' +
'          document.getElementById("resCadastro").className = "mt-6 border-t pt-4 text-center space-y-4";' +
'          fotoBase64 = "";' +
'          alert("✅ Membro cadastrado com sucesso!");' +
'        }' +
'      });' +
'    }' +
'    function salvarNovoUsuario() {' +
'      var nome = document.getElementById("usrNome").value.trim();' +
'      var email = document.getElementById("usrEmail").value.trim();' +
'      var senha = document.getElementById("usrSenha").value.trim();' +
'      var nivel = document.getElementById("usrNivel").value;' +
'      if (!nome || !email || !senha) { alert("Preencha nome, e-mail e senha."); return; }' +
'      fetch("/api/usuarios", {' +
'        method: "POST",' +
'        headers: { "Content-Type": "application/json" },' +
'        body: JSON.stringify({ nome: nome, email: email, senha: senha, nivel: nivel, operador: usuarioAtualEmail })' +
'      })' +
'      .then(function(res) { return res.json(); })' +
'      .then(function(data) {' +
'        if (data.success) { alert("✅ Novo usuário cadastrado!"); carregarUsuarios(); } else { alert(data.error || "Erro ao cadastrar usuário."); }' +
'      });' +
'    }' +
'    function imprimirPDF() {' +
'      if (!ultimoMembroCadastrado) return;' +
'      var janela = window.open("", "_blank");' +
'      var fotoHtml = ultimoMembroCadastrado.fotoBase64 ? "<img src=\\"" + ultimoMembroCadastrado.fotoBase64 + "\\" class=\\"foto\\">" : "";' +
'      janela.document.write(' +
'        "<html><head><title>Credencial DPCRIM - " + ultimoMembroCadastrado.nome + "</title>" +' +
'        "<style>body { font-family: sans-serif; padding: 20px; text-align: center; } .card { width: 350px; border: 2px solid #0f172a; border-radius: 12px; padding: 16px; margin: 0 auto; text-align: left; background: #0f172a; color: white; } .badge { background: #b91c1c; color: white; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; display: inline-block; } .foto { width: 70px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #334155; } .flex { display: flex; gap: 12px; align-items: center; margin-top: 10px; } .qr { width: 70px; height: 70px; background: white; padding: 2px; border-radius: 6px; } .footer { margin-top: 12px; border-top: 1px solid #334155; padding-top: 8px; font-size: 9px; color: #94a3b8; display: flex; justify-between; align-items: center; }</style></head><body>" +' +
'        "<div class=\\"card\\"><div class=\\"badge\\">DPCRIM • Carteira Oficial</div><div class=\\"flex\\">" + fotoHtml + "<div><h3 style=\\"margin:0; font-size:14px;\\">" + ultimoMembroCadastrado.nome + "</h3><p style=\\"margin:2px 0; font-size:11px; color:#cbd5e1;\\">INSCRIÇÃO: " + ultimoMembroCadastrado.inscricao + "</p><p style=\\"margin:2px 0; font-size:11px; color:#cbd5e1;\\">CPF: " + ultimoMembroCadastrado.cpfMascarado + "</p><p style=\\"margin:2px 0; font-size:11px; color:#fca5a5; font-weight:bold;\\">" + ultimoMembroCadastrado.curso + "</p></div></div><div class=\\"footer\\"><div><p style=\\"margin:0;\\">REGISTRO: " + ultimoMembroCadastrado.codigo + "</p><p style=\\"margin:0;\\">EMISSÃO: " + ultimoMembroCadastrado.dataEmissao + "</p></div><img src=\\"" + ultimoMembroCadastrado.qrCode + "\\" class=\\"qr\\"></div></div>" +' +
'        "<script>window.print();</script></body></html>"' +
'      );' +
'    }' +
'    function carregarListaMembros() {' +
'      fetch("/api/membros").then(function(res) { return res.json(); }).then(function(data) { listaMembrosCache = data; renderizarTabela(listaMembrosCache); });' +
'    }' +
'    function renderizarTabela(dados) {' +
'      var tbody = document.getElementById("tabelaMembros");' +
'      var html = "";' +
'      for (var i = 0; i < dados.length; i++) {' +
'        var m = dados[i];' +
'        var foto = m.fotoBase64 || "https://via.placeholder.com/40?text=FOTO";' +
'        html += "<tr class=\\"hover:bg-slate-50 transition\\">" +' +
'          "<td class=\\"p-2.5\\"><img src=\\"" + foto + "\\" class=\\"w-8 h-10 object-cover rounded border\\"></td>" +' +
'          "<td class=\\"p-2.5 font-bold text-slate-900\\">" + m.nome + "</td>" +' +
'          "<td class=\\"p-2.5 font-semibold text-slate-700\\">" + m.inscricao + "</td>" +' +
'          "<td class=\\"p-2.5 font-mono text-slate-600\\">" + m.cpfMascarado + "</td>" +' +
'          "<td class=\\"p-2.5 text-slate-700\\">" + m.curso + "</td>" +' +
'          "<td class=\\"p-2.5 text-center\\"><button onclick=\\"window.open(\'/validar/\' + \'" + m.tokenSeguro + "\', \'_blank\')\\" class=\\"bg-slate-900 text-white text-[10px] font-bold px-2.5 py-1 rounded\\">🔍 Ver Registro</button></td>" +' +
'        "</tr>";' +
'      }' +
'      tbody.innerHTML = html;' +
'    }' +
'    function carregarUsuarios() {' +
'      fetch("/api/usuarios").then(function(res) { return res.json(); }).then(function(dados) {' +
'        var html = "";' +
'        for (var i = 0; i < dados.length; i++) {' +
'          var u = dados[i];' +
'          html += "<tr class=\\"hover:bg-slate-50\\"><td class=\\"p-2.5 font-bold\\">" + u.nome + "</td><td class=\\"p-2.5 font-mono\\">" + u.email + "</td><td class=\\"p-2.5\\"><span class=\\"bg-red-100 text-red-800 font-bold text-[10px] px-2 py-0.5 rounded\\">" + u.nivel + "</span></td><td class=\\"p-2.5 text-slate-500\\">" + u.dataCriacao + "</td></tr>";' +
'        }' +
'        document.getElementById("tabelaUsuarios").innerHTML = html;' +
'      });' +
'    }' +
'    function carregarLogs() {' +
'      fetch("/api/logs").then(function(res) { return res.json(); }).then(function(dados) {' +
'        var html = "";' +
'        for (var i = 0; i < dados.length; i++) {' +
'          var l = dados[i];' +
'          html += "<tr class=\\"hover:bg-slate-50\\"><td class=\\"p-2.5 font-mono text-[11px] text-slate-500\\">" + l.dataHora + "</td><td class=\\"p-2.5 font-bold text-slate-800\\">" + l.usuario + "</td><td class=\\"p-2.5 font-bold text-red-700\\">" + l.acao + "</td><td class=\\"p-2.5 text-slate-600\\">" + l.detalhe + "</td></tr>";' +
'        }' +
'        document.getElementById("tabelaLogs").innerHTML = html;' +
'      });' +
'    }' +
'    function filtrarLista() {' +
'      var termo = document.getElementById("filtroLista").value.toLowerCase();' +
'      var filtrados = [];' +
'      for (var i = 0; i < listaMembrosCache.length; i++) {' +
'        var m = listaMembrosCache[i];' +
'        if (m.nome.toLowerCase().indexOf(termo) !== -1 || m.inscricao.toLowerCase().indexOf(termo) !== -1 || m.cpfMascarado.indexOf(termo) !== -1) {' +
'          filtrados.push(m);' +
'        }' +
'      }' +
'      renderizarTabela(filtrados);' +
'    }' +
'  </script>' +
'</body>' +
'</html>');
});

// 2. CONSULTA PÚBLICA
app.get('/filiados', (req, res) => {
  res.send('<!DOCTYPE html>' +
'<html lang="pt-BR">' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>DPCRIM - Consulta de Filiados</title>' +
'  <script src="https://cdn.tailwindcss.com"></script>' +
'</head>' +
'<body class="bg-slate-100 min-h-screen flex flex-col justify-between p-4 font-sans text-slate-800">' +
'  <div class="my-auto flex flex-col items-center justify-center w-full">' +
'    <div class="max-w-md w-full bg-white p-6 rounded-2xl shadow-xl border border-slate-200 text-center">' +
'      <div class="bg-slate-900 text-white p-4 rounded-xl mb-6">' +
'        <h1 class="text-xl font-bold uppercase tracking-wide">DPCRIM</h1>' +
'        <p class="text-xs text-slate-300">Portal Público de Validação de Filiados</p>' +
'      </div>' +
'      <div class="space-y-4 mb-6">' +
'        <div>' +
'          <label class="block text-xs font-bold uppercase text-slate-700 mb-1 text-left">Consultar por CPF do Filiado</label>' +
'          <input type="text" id="buscaCPF" placeholder="Digite o CPF (somente números)" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none">' +
'        </div>' +
'        <button type="button" onclick="buscarFiliado()" class="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3.5 rounded-xl text-sm shadow uppercase">BUSCAR FILIADO</button>' +
'      </div>' +
'      <div id="resultadoBusca" class="hidden text-left border-t pt-4 space-y-3"></div>' +
'      <div class="mt-6 border-t pt-4">' +
'        <a href="/" class="text-xs text-slate-500 hover:text-slate-800 font-bold">🔒 Área Administrativa (Restrita)</a>' +
'      </div>' +
'    </div>' +
'  </div>' +
'  <footer class="w-full text-center py-4 text-xs text-slate-500 border-t border-slate-200 mt-auto">Desenvolvido por <strong class="text-slate-800">Lusana Verissimo</strong></footer>' +
'  <script>' +
'    function buscarFiliado() {' +
'      var cpf = document.getElementById("buscaCPF").value.trim();' +
'      if (!cpf) { alert("Digite um CPF."); return; }' +
'      fetch("/api/filiados/buscar?cpf=" + encodeURIComponent(cpf))' +
'        .then(function(res) { return res.json(); })' +
'        .then(function(data) {' +
'          var container = document.getElementById("resultadoBusca");' +
'          container.className = "text-left border-t pt-4 space-y-3";' +
'          if (data.encontrado) {' +
'            var fotoHtml = data.membro.fotoBase64 ? "<img src=\\"" + data.membro.fotoBase64 + "\\" class=\\"w-20 h-24 mx-auto rounded-lg object-cover border my-2\\">" : "";' +
'            container.innerHTML = ' +
'              "<div class=\\"bg-emerald-50 border border-emerald-300 text-emerald-800 p-3 rounded-xl font-bold text-center text-xs\\">✅ REGISTRO OFICIAL ENCONTRADO E VÁLIDO</div>" + fotoHtml +' +
'              "<div class=\\"text-xs space-y-1.5 border-t border-b py-3\\"><p><strong>NOME:</strong> " + data.membro.nome + "</p><p><strong>INSCRIÇÃO:</strong> " + data.membro.inscricao + "</p><p><strong>DOCUMENTO:</strong> " + data.membro.cpfMascarado + "</p><p><strong>CURSO:</strong> " + data.membro.curso + "</p><p><strong>REGISTRO:</strong> " + data.membro.codigo + "</p><p><strong>EMISSÃO:</strong> " + data.membro.dataEmissao + "</p><p><strong>STATUS:</strong> <span class=\\"bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded text-[10px]\\">ATIVO</span></p></div>";' +
'          } else {' +
'            container.innerHTML = "<div class=\\"bg-red-50 border border-red-300 text-red-800 p-3 rounded-xl font-bold text-center text-xs\\">❌ NENHUM FILIADO ENCONTRADO COM ESTE CPF</div>";' +
'          }' +
'        });' +
'    }' +
'  </script>' +
'</body>' +
'</html>');
});

// 3. ROUTE VALIDAÇÃO QR CODE
app.get('/validar/:token', (req, res) => {
  const cpfLimpo = validarTokenSeguro(req.params.token);
  const membro = cpfLimpo ? membrosDB.get(cpfLimpo) : null;

  if (!membro) {
    return res.send('<body style="font-family:sans-serif; text-align:center; padding:40px; background:#fef2f2;"><h1 style="color:#dc2626;">❌ CREDENCIAL INVÁLIDA OU ADULTERADA</h1><p style="color:#7f1d1d; font-size:14px;">A assinatura digital deste QR Code falhou na verificação do DPCRIM.</p></body>');
  }

  const fotoTag = membro.fotoBase64 ? '<img src="' + membro.fotoBase64 + '" class="w-24 h-28 mx-auto rounded-lg object-cover border shadow-sm mb-4">' : '';

  res.send('<!DOCTYPE html>' +
'<html lang="pt-BR">' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>DPCRIM - Validação Oficial</title>' +
'  <script src="https://cdn.tailwindcss.com"></script>' +
'</head>' +
'<body class="bg-slate-100 min-h-screen flex flex-col justify-between p-4 font-sans text-slate-800">' +
'  <div class="my-auto flex flex-col items-center justify-center w-full">' +
'    <div class="max-w-sm w-full bg-white p-6 rounded-2xl shadow-xl border border-slate-200 text-center">' +
'      <div class="bg-emerald-100 border border-emerald-300 text-emerald-800 p-3 rounded-xl font-bold text-xs mb-4">✅ AUTENTICIDADE VERIFICADA E VÁLIDA</div>' +
'      <h2 class="text-slate-900 font-extrabold text-xl">DPCRIM</h2>' +
'      <p class="text-[11px] text-slate-500 mb-4">Departamento de Pesquisas e Perícias Criminológicas</p>' +
'      ' + fotoTag + '' +
'      <div class="text-left space-y-2 text-xs border-t border-b py-4">' +
'        <p><strong>NOME DO PERITO:</strong> ' + membro.nome + '</p>' +
'        <p><strong>INSCRIÇÃO:</strong> ' + membro.inscricao + '</p>' +
'        <p><strong>DOCUMENTO:</strong> ' + membro.cpfMascarado + '</p>' +
'        <p><strong>ESPECIALIDADE:</strong> ' + membro.curso + '</p>' +
'        <p><strong>REGISTRO OFICIAL:</strong> ' + membro.codigo + '</p>' +
'        <p><strong>DATA DE EMISSÃO:</strong> ' + membro.dataEmissao + '</p>' +
'      </div>' +
'      <p class="text-[10px] text-slate-400 mt-4">Documento assinado digitalmente via protocolo HMAC-SHA256.</p>' +
'    </div>' +
'  </div>' +
'  <footer class="w-full text-center py-4 text-xs text-slate-500 border-t border-slate-200 mt-auto">Desenvolvido por <strong class="text-slate-800">Lusana Verissimo</strong></footer>' +
'</body>' +
'</html>');
});

// APIS
app.post('/api/login', (req, res) => {
  const { email, senha } = req.body;
  if ((email === 'admin@dpcrim.org' && senha === 'admin') || (usuariosDB.has(email) && usuariosDB.get(email).senha === senha)) {
    registrarLog(email, 'Login efetuado', 'Acesso autenticado com sucesso');
    return res.json({ success: true });
  }
  registrarLog(email || 'DESCONHECIDO', 'Tentativa de Login Falhou', 'Credenciais incorretas');
  res.status(401).json({ success: false });
});

app.post('/api/membros', (req, res) => {
  const data = req.body;
  const cpfLimpo = (data.cpf || '').replace(/\D/g, '');
  const codigo = 'DPCRIM-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
  const tokenSeguro = gerarTokenSeguro(cpfLimpo);

  const host = req.get('host');
  const protocol = req.protocol;
  const urlValidacao = protocol + '://' + host + '/validar/' + tokenSeguro;

  const membro = {
    nome: data.nome,
    inscricao: data.inscricao,
    cpfMascarado: mascararCPF(data.cpf),
    rg: data.rg || 'Não informado',
    curso: data.curso,
    cargaHoraria: data.cargaHoraria ? data.cargaHoraria + 'h' : 'Não informada',
    codigo,
    fotoBase64: data.fotoBase64 || null,
    dataEmissao: new Date().toLocaleDateString('pt-BR'),
    tokenSeguro
  };

  membrosDB.set(cpfLimpo, membro);
  registrarLog(data.operador || 'ADMIN', 'Membro Cadastrado', 'Nome: ' + data.nome + ' | CPF: ' + membro.cpfMascarado);

  const qrCodeApi = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(urlValidacao);
  res.json({ success: true, membro, qrCode: qrCodeApi });
});

app.post('/api/usuarios', (req, res) => {
  const { nome, email, senha, nivel, operador } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes.' });
  }

  usuariosDB.set(email, {
    nome, email, senha, nivel: nivel || 'OPERADOR', dataCriacao: new Date().toLocaleDateString('pt-BR')
  });

  registrarLog(operador || 'ADMIN', 'Novo Usuário Criado', 'Usuário: ' + email);
  res.json({ success: true });
});

app.get('/api/membros', (req, res) => res.json(Array.from(membrosDB.values())));
app.get('/api/usuarios', (req, res) => res.json(Array.from(usuariosDB.values())));
app.get('/api/logs', (req, res) => res.json(logsDB));
app.get('/api/filiados/buscar', (req, res) => {
  const cpfLimpo = (req.query.cpf || '').replace(/\D/g, '');
  const membro = membrosDB.get(cpfLimpo);
  if (membro) return res.json({ encontrado: true, membro });
  res.json({ encontrado: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor DPCRIM rodando na porta ${PORT}`));
