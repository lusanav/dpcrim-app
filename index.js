const express = require('express');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Bancos de dados em memória
const credenciaisDB = new Map();
const usuariosDB = new Map();

// Usuário padrão inicial para administração
usuariosDB.set('admin@dpcrim.org', {
  id: uuidv4(),
  nome: 'Administrador DPCRIM',
  email: 'admin@dpcrim.org',
  senha: 'admin',
  nivel: 'ADMIN',
  dataCadastro: new Date().toLocaleDateString('pt-BR')
});

function mascararCPF(cpf) {
  const limpo = (cpf || '').replace(/\D/g, '');
  if (limpo.length !== 11) return '***.***.***-**';
  return `${limpo.substring(0, 3)}.***.***-${limpo.substring(9)}`;
}

// 1. INTERFACE PRINCIPAL
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DPCRIM - Sistema Oficial de Credenciamento</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 p-4 font-sans text-slate-800 min-h-screen flex items-center justify-center">
      
      <div class="max-w-md w-full mx-auto bg-white p-6 rounded-2xl shadow-xl border border-slate-200">
        
        <!-- Cabeçalho idêntico à imagem -->
        <div class="bg-slate-900 text-white p-5 rounded-xl text-center mb-6 shadow">
          <h1 class="text-2xl font-bold tracking-wide">DPCRIM</h1>
          <p class="text-xs text-slate-300 mt-1">Sistema Oficial de Credenciamento</p>
        </div>

        <!-- Seletor de Módulos (Credencial / Usuários) -->
        <div class="flex rounded-lg bg-slate-100 p-1 mb-6 border border-slate-200 text-xs font-bold">
          <button id="btnTabCred" onclick="alternarAba('cred')" class="flex-1 py-2 rounded-md bg-white text-slate-900 shadow">
            EMITIR CREDENCIAL
          </button>
          <button id="btnTabUser" onclick="alternarAba('user')" class="flex-1 py-2 rounded-md text-slate-500 hover:text-slate-900">
            CADASTRAR USUÁRIOS
          </button>
        </div>

        <!-- MÓDULO 1: FORMULÁRIO DE CREDENCIAMENTO -->
        <div id="abaCredencial">
          <form id="formCredencial" class="space-y-4">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Nome do Aluno *</label>
              <input type="text" id="nomePessoa" required placeholder="Ex: Dr. Carlos Eduardo" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">CPF *</label>
                <input type="text" id="cpf" required placeholder="123.456.789-00" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">RG (Opcional)</label>
                <input type="text" id="rg" placeholder="12.345.678-X" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Curso / Especialização *</label>
              <input type="text" id="nomeCurso" required placeholder="Ex: Perícia Forense" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Telefone / WhatsApp</label>
                <input type="tel" id="telefone" placeholder="(11) 98765-4321" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Foto do Perito</label>
                <input type="file" id="fotoInput" accept="image/*" class="w-full p-2 border rounded-xl bg-slate-50 text-[10px] text-slate-500">
              </div>
            </div>

            <button type="submit" class="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3.5 rounded-xl text-sm tracking-wide shadow-md transition uppercase">
              EMITIR CREDENCIAL & QR CODE
            </button>
          </form>

          <!-- Resultado da Emissão -->
          <div id="resultadoCredencial" class="mt-6 hidden space-y-4 border-t pt-4">
            <h2 class="text-center font-bold text-slate-900 text-sm">Credencial Gerada com Sucesso!</h2>
            
            <div class="bg-slate-900 text-white p-4 rounded-xl relative shadow-lg">
              <div class="bg-red-700 text-[9px] font-bold px-2 py-0.5 rounded w-max uppercase mb-3">DPCRIM • Credencial</div>
              <div class="flex space-x-3 items-center">
                <img id="resFoto" src="" class="w-16 h-20 bg-slate-800 rounded object-cover border border-slate-700">
                <div>
                  <p id="resNome" class="font-bold text-sm text-white"></p>
                  <p id="resCPF" class="text-xs text-slate-300"></p>
                  <p id="resCurso" class="text-xs text-red-300 font-semibold mt-1"></p>
                  <p id="resCodigo" class="text-[10px] text-slate-400 mt-2 border-t border-slate-800 pt-1"></p>
                </div>
              </div>
            </div>

            <div class="text-center bg-slate-50 p-3 rounded-xl border">
              <p class="text-xs font-bold text-slate-600 mb-2">QR Code de Autenticidade</p>
              <img id="resQR" src="" class="w-32 h-32 mx-auto border p-1 bg-white rounded-lg">
            </div>
          </div>
        </div>

        <!-- MÓDULO 2: CADASTRO DE USUÁRIOS DO SISTEMA -->
        <div id="abaUsuario" class="hidden">
          <form id="formUsuario" class="space-y-4 mb-6">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Nome do Operador *</label>
              <input type="text" id="usrNome" required placeholder="Ex: Maria Santos" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-700 mb-1">E-mail de Login *</label>
              <input type="email" id="usrEmail" required placeholder="operador@dpcrim.org" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Senha *</label>
              <input type="password" id="usrSenha" required placeholder="••••••••" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
            </div>

            <button type="submit" class="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl text-sm tracking-wide shadow-md transition uppercase">
              CADASTRAR USUÁRIO
            </button>
          </form>

          <!-- Tabela com Usuários Cadastrados -->
          <div class="border-t pt-4">
            <p class="text-xs font-bold text-slate-700 uppercase mb-2">Usuários Autorizados</p>
            <div id="listaUsuarios" class="space-y-2 max-h-40 overflow-y-auto"></div>
          </div>
        </div>

      </div>

      <script>
        let fotoBase64 = '';

        function alternarAba(aba) {
          const isCred = aba === 'cred';
          document.getElementById('abaCredencial').classList.toggle('hidden', !isCred);
          document.getElementById('abaUsuario').classList.toggle('hidden', isCred);

          document.getElementById('btnTabCred').className = isCred ? 'flex-1 py-2 rounded-md bg-white text-slate-900 shadow' : 'flex-1 py-2 rounded-md text-slate-500 hover:text-slate-900';
          document.getElementById('btnTabUser').className = !isCred ? 'flex-1 py-2 rounded-md bg-white text-slate-900 shadow' : 'flex-1 py-2 rounded-md text-slate-500 hover:text-slate-900';

          if (!isCred) carregarUsuarios();
        }

        document.getElementById('fotoInput').addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => { fotoBase64 = event.target.result; };
            reader.readAsDataURL(file);
          }
        });

        // Submeter Credencial
        document.getElementById('formCredencial').addEventListener('submit', async (e) => {
          e.preventDefault();
          const payload = {
            nomePessoa: document.getElementById('nomePessoa').value,
            cpf: document.getElementById('cpf').value,
            rg: document.getElementById('rg').value,
            nomeCurso: document.getElementById('nomeCurso').value,
            telefone: document.getElementById('telefone').value,
            fotoBase64: fotoBase64
          };

          const res = await fetch('/api/cadastrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const data = await res.json();
          if (data.success) {
            document.getElementById('resNome').innerText = data.credencial.nomePessoa;
            document.getElementById('resCPF').innerText = 'CPF: ' + data.credencial.cpfMascarado;
            document.getElementById('resCurso').innerText = data.credencial.nomeCurso;
            document.getElementById('resCodigo').innerText = 'REGISTRO: ' + data.credencial.codigoCredencial;
            document.getElementById('resFoto').src = data.credencial.fotoBase64 || 'https://via.placeholder.com/80x100?text=FOTO';
            document.getElementById('resQR').src = data.qrCodeBase64;
            document.getElementById('resultadoCredencial').classList.remove('hidden');
          }
        });

        // Submeter Novo Usuário
        document.getElementById('formUsuario').addEventListener('submit', async (e) => {
          e.preventDefault();
          const payload = {
            nome: document.getElementById('usrNome').value,
            email: document.getElementById('usrEmail').value,
            senha: document.getElementById('usrSenha').value
          };

          const res = await fetch('/api/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const data = await res.json();
          if (data.success) {
            alert('Usuário do sistema cadastrado com sucesso!');
            document.getElementById('formUsuario').reset();
            carregarUsuarios();
          } else {
            alert(data.error || 'Erro ao cadastrar usuário.');
          }
        });

        async function carregarUsuarios() {
          const res = await fetch('/api/usuarios');
          const usuarios = await res.json();
          const container = document.getElementById('listaUsuarios');
          container.innerHTML = usuarios.map(u => `
            <div class="p-2.5 bg-slate-50 border rounded-lg flex justify-between items-center text-xs">
              <div>
                <p class="font-bold text-slate-900">${u.nome}</p>
                <p class="text-slate-500">${u.email}</p>
              </div>
              <span class="px-2 py-0.5 bg-slate-200 text-slate-700 rounded font-semibold text-[10px]">${u.dataCadastro}</span>
            </div>
          `).join('');
        }
      </script>
    </body>
    </html>
  `);
});

// 2. ENDPOINTS DA API
app.post('/api/cadastrar', async (req, res) => {
  const data = req.body;
  const tokenValidacao = uuidv4();
  const codigoCredencial = `DPCRIM-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const host = req.get('host');
  const protocol = req.protocol;
  const urlValidadora = `${protocol}://${host}/validar/${tokenValidacao}`;

  const credencial = {
    id: uuidv4(),
    codigoCredencial,
    tokenValidacao,
    nomePessoa: data.nomePessoa,
    cpfMascarado: mascararCPF(data.cpf),
    rg: data.rg || 'Não informado',
    nomeCurso: data.nomeCurso,
    telefone: data.telefone || 'Não informado',
    dataEmissao: new Date().toLocaleDateString('pt-BR'),
    fotoBase64: data.fotoBase64 || null
  };

  credenciaisDB.set(tokenValidacao, credencial);

  const qrCodeBase64 = await QRCode.toDataURL(urlValidadora, {
    errorCorrectionLevel: 'H',
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' }
  });

  res.json({ success: true, credencial, qrCodeBase64 });
});

app.get('/api/usuarios', (req, res) => {
  const lista = Array.from(usuariosDB.values()).map(u => ({
    nome: u.nome,
    email: u.email,
    dataCadastro: u.dataCadastro
  }));
  res.json(lista);
});

app.post('/api/usuarios', (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ success: false, error: 'Preencha todos os campos.' });
  if (usuariosDB.has(email)) return res.status(400).json({ success: false, error: 'E-mail já cadastrado.' });

  const novoUsuario = {
    id: uuidv4(),
    nome,
    email,
    senha,
    dataCadastro: new Date().toLocaleDateString('pt-BR')
  };

  usuariosDB.set(email, novoUsuario);
  res.json({ success: true, usuario: novoUsuario });
});

// 3. PÁGINA PÚBLICA DE VALIDAÇÃO (QR CODE)
app.get('/validar/:token', (req, res) => {
  const credencial = credenciaisDB.get(req.params.token);

  if (!credencial) {
    return res.send(`
      <body style="font-family:sans-serif; text-align:center; padding:40px; background:#fef2f2;">
        <h1 style="color:#dc2626;">❌ CREDENCIAL INVÁLIDA</h1>
        <p>Este registro não existe na base oficial do DPCRIM.</p>
      </body>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DPCRIM - Validação</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 p-4 font-sans text-slate-800">
      <div class="max-w-sm mx-auto bg-white p-6 rounded-2xl shadow-xl border border-slate-200 text-center">
        <div class="bg-emerald-100 border border-emerald-300 text-emerald-800 p-3 rounded-xl font-bold text-xs mb-4">
          ✅ CREDENCIAL OFICIAL ATIVA
        </div>
        <h2 class="text-slate-900 font-extrabold text-xl tracking-wider">DPCRIM</h2>
        <p class="text-[11px] text-slate-500 mb-4">Departamento de Pesquisas e Perícias Criminológicas</p>
        ${credencial.fotoBase64 ? `<img src="${credencial.fotoBase64}" class="w-24 h-28 mx-auto rounded-lg object-cover border-2 border-slate-200 shadow-sm mb-4">` : ''}
        <div class="text-left space-y-2 text-xs border-t border-b py-4">
          <p><strong>Profissional:</strong> ${credencial.nomePessoa}</p>
          <p><strong>Documento:</strong> ${credencial.cpfMascarado}</p>
          <p><strong>Curso:</strong> ${credencial.nomeCurso}</p>
          <p><strong>Código Registro:</strong> ${credencial.codigoCredencial}</p>
          <p><strong>Data de Emissão:</strong> ${credencial.dataEmissao}</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));
