const express = require('express');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Bancos de dados em memória
const credenciaisDB = new Map();
const usuariosDB = new Map();

// Usuário padrão inicial (Admin)
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

// 1. PAINEL PRINCIPAL (SISTEMA COMPLETO)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DPCRIM - Gestão Integrada</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 p-3 sm:p-6 font-sans text-slate-800">
      <div class="max-w-4xl mx-auto bg-white p-6 rounded-2xl shadow-xl border border-slate-200">
        
        <!-- Cabeçalho -->
        <div class="bg-slate-900 text-white p-5 rounded-xl text-center mb-6 shadow">
          <h1 class="text-2xl font-black tracking-wider uppercase">DPCRIM</h1>
          <p class="text-xs text-slate-300 font-medium">Departamento de Pesquisas e Perícias Criminológicas</p>
        </div>

        <!-- Abas de Navegação -->
        <div class="flex border-b border-slate-200 mb-6 gap-2">
          <button id="tabCredencialBtn" onclick="mudarAba('credencial')" class="py-2.5 px-4 font-bold text-xs uppercase rounded-t-lg bg-slate-900 text-white">
            🎓 Emitir Credencial
          </button>
          <button id="tabUsuarioBtn" onclick="mudarAba('usuario')" class="py-2.5 px-4 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
            👤 Cadastrar Usuários do Sistema
          </button>
        </div>

        <!-- ABA 1: CADASTRO DE PERITO E CREDENCIAL -->
        <div id="abaCredencial">
          <form id="formCadastro" class="space-y-6">
            <div class="border-b pb-4">
              <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center">
                <span class="w-2.5 h-2.5 bg-red-700 rounded-full inline-block mr-2"></span> 1. Dados Pessoais do Profissional
              </h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="md:col-span-2">
                  <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Nome Completo *</label>
                  <input type="text" id="nomePessoa" required placeholder="Ex: Dr. Carlos Eduardo Silva" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
                </div>
                <div>
                  <label class="block text-xs font-bold uppercase text-slate-600 mb-1">CPF *</label>
                  <input type="text" id="cpf" required placeholder="123.456.789-00" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
                </div>
                <div>
                  <label class="block text-xs font-bold uppercase text-slate-600 mb-1">RG / Órgão Expedidor</label>
                  <input type="text" id="rg" placeholder="12.345.678-X SSP/SP" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
                </div>
                <div>
                  <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Data de Nascimento</label>
                  <input type="date" id="dataNascimento" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
                </div>
                <div>
                  <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Foto do Perito (Opcional)</label>
                  <input type="file" id="fotoInput" accept="image/*" class="w-full p-1.5 border rounded-lg bg-slate-50 text-xs text-slate-600">
                </div>
              </div>
            </div>

            <div class="border-b pb-4">
              <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center">
                <span class="w-2.5 h-2.5 bg-red-700 rounded-full inline-block mr-2"></span> 2. Contato & Localização
              </h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold uppercase text-slate-600 mb-1">E-mail</label>
                  <input type="email" id="email" placeholder="perito@exemplo.com" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
                </div>
                <div>
                  <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Telefone / WhatsApp</label>
                  <input type="tel" id="telefone" placeholder="(11) 98765-4321" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
                </div>
                <div>
                  <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Cidade / Estado</label>
                  <input type="text" id="cidadeEstado" placeholder="São Paulo / SP" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
                </div>
              </div>
            </div>

            <div>
              <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center">
                <span class="w-2.5 h-2.5 bg-red-700 rounded-full inline-block mr-2"></span> 3. Informações do Curso & Credenciamento
              </h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="md:col-span-2">
                  <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Curso / Especialidade *</label>
                  <input type="text" id="nomeCurso" required placeholder="Ex: Capacitação Avançada em Perícia Forense Computacional" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
                </div>
                <div>
                  <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Carga Horária (Horas)</label>
                  <input type="number" id="cargaHoraria" placeholder="120" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
                </div>
                <div>
                  <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Data de Validade (Opcional)</label>
                  <input type="date" id="dataValidade" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
                </div>
              </div>
            </div>

            <button type="submit" class="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl text-sm shadow-lg transition">
              SALVAR CADASTRO & GERAR CREDENCIAL OFICIAL
            </button>
          </form>

          <!-- Resultado -->
          <div id="resultado" class="mt-8 hidden space-y-6 border-t pt-6">
            <div class="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-center">
              <p class="font-bold text-sm">✅ Perito cadastrado com sucesso!</p>
            </div>
            <div class="max-w-sm mx-auto bg-slate-900 text-white rounded-2xl p-5 shadow-2xl relative overflow-hidden border border-slate-700">
              <div class="bg-red-700 text-[10px] font-bold px-3 py-1 rounded-md w-max uppercase mb-3 tracking-wider">
                DPCRIM • Credencial Oficial
              </div>
              <div class="flex space-x-4 items-center">
                <img id="resFoto" src="" class="w-20 h-24 bg-slate-800 border border-slate-600 rounded-lg object-cover">
                <div class="text-xs space-y-1 overflow-hidden">
                  <p id="resNome" class="font-bold text-sm text-white truncate"></p>
                  <p id="resCPF" class="text-slate-300"></p>
                  <p id="resCurso" class="text-red-300 font-semibold text-[11px] leading-tight mt-1"></p>
                </div>
              </div>
              <div class="mt-4 pt-2 border-t border-slate-800 flex justify-between items-center text-[10px] text-slate-400">
                <span>REGISTRO: <strong id="resCodigo" class="text-white"></strong></span>
                <span id="resValidade"></span>
              </div>
            </div>
            <div class="text-center bg-slate-50 p-4 rounded-xl border border-slate-200 max-w-sm mx-auto">
              <p class="text-xs font-bold text-slate-700 mb-2">QR Code de Autenticidade Pública</p>
              <img id="resQR" src="" class="w-36 h-36 mx-auto border p-1 bg-white rounded-lg shadow-sm">
              <p id="resURL" class="text-[10px] text-slate-500 font-mono mt-2 break-all"></p>
            </div>
          </div>
        </div>

        <!-- ABA 2: CADASTRO DE USUÁRIOS DO SISTEMA -->
        <div id="abaUsuario" class="hidden">
          <form id="formUsuario" class="space-y-4 mb-8">
            <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center">
              <span class="w-2.5 h-2.5 bg-red-700 rounded-full inline-block mr-2"></span> Novo Operador / Administrador
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Nome do Usuário *</label>
                <input type="text" id="usrNome" required placeholder="Ex: Maria Secretária" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-600 mb-1">E-mail de Acesso *</label>
                <input type="email" id="usrEmail" required placeholder="operador@dpcrim.org" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Senha de Acesso *</label>
                <input type="password" id="usrSenha" required placeholder="••••••••" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Nível de Permissão</label>
                <select id="usrNivel" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
                  <option value="OPERADOR">Operador (Cadastra peritos)</option>
                  <option value="ADMIN">Administrador (Acesso Total)</option>
                </select>
              </div>
            </div>
            <button type="submit" class="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3 rounded-xl text-sm shadow transition">
              CADASTRAR USUÁRIO NO SISTEMA
            </button>
          </form>

          <!-- Tabela de Usuários Cadastrados -->
          <div class="border-t pt-4">
            <h3 class="text-xs font-bold uppercase text-slate-700 mb-3">Usuários com Acesso ao Sistema</h3>
            <div class="overflow-x-auto">
              <table class="w-full text-xs text-left border-collapse">
                <thead>
                  <tr class="bg-slate-100 text-slate-700 uppercase border-b">
                    <th class="p-2.5">Nome</th>
                    <th class="p-2.5">E-mail</th>
                    <th class="p-2.5">Nível</th>
                    <th class="p-2.5">Data Cadastro</th>
                  </tr>
                </thead>
                <tbody id="tabelaUsuarios">
                  <!-- Carregado via JS -->
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      <script>
        let fotoBase64 = '';

        function mudarAba(aba) {
          const isCred = aba === 'credencial';
          document.getElementById('abaCredencial').classList.toggle('hidden', !isCred);
          document.getElementById('abaUsuario').classList.toggle('hidden', isCred);

          document.getElementById('tabCredencialBtn').className = isCred ? 'py-2.5 px-4 font-bold text-xs uppercase rounded-t-lg bg-slate-900 text-white' : 'py-2.5 px-4 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600 hover:bg-slate-200';
          document.getElementById('tabUsuarioBtn').className = !isCred ? 'py-2.5 px-4 font-bold text-xs uppercase rounded-t-lg bg-slate-900 text-white' : 'py-2.5 px-4 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600 hover:bg-slate-200';

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

        document.getElementById('formCadastro').addEventListener('submit', async (e) => {
          e.preventDefault();
          const payload = {
            nomePessoa: document.getElementById('nomePessoa').value,
            cpf: document.getElementById('cpf').value,
            rg: document.getElementById('rg').value,
            dataNascimento: document.getElementById('dataNascimento').value,
            email: document.getElementById('email').value,
            telefone: document.getElementById('telefone').value,
            cidadeEstado: document.getElementById('cidadeEstado').value,
            nomeCurso: document.getElementById('nomeCurso').value,
            cargaHoraria: document.getElementById('cargaHoraria').value,
            dataValidade: document.getElementById('dataValidade').value,
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
            document.getElementById('resCodigo').innerText = data.credencial.codigoCredencial;
            document.getElementById('resValidade').innerText = data.credencial.dataValidade ? 'VAL: ' + data.credencial.dataValidade : 'VITALÍCIA';
            document.getElementById('resFoto').src = data.credencial.fotoBase64 || 'https://via.placeholder.com/80x100?text=FOTO';
            document.getElementById('resQR').src = data.qrCodeBase64;
            document.getElementById('resURL').innerText = data.urlValidadora;
            document.getElementById('resultado').classList.remove('hidden');
          }
        });

        // Cadastro de Usuários
        document.getElementById('formUsuario').addEventListener('submit', async (e) => {
          e.preventDefault();
          const payload = {
            nome: document.getElementById('usrNome').value,
            email: document.getElementById('usrEmail').value,
            senha: document.getElementById('usrSenha').value,
            nivel: document.getElementById('usrNivel').value
          };

          const res = await fetch('/api/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const data = await res.json();
          if (data.success) {
            alert('Usuário cadastrado com sucesso!');
            document.getElementById('formUsuario').reset();
            carregarUsuarios();
          } else {
            alert(data.error || 'Erro ao cadastrar usuário.');
          }
        });

        async function carregarUsuarios() {
          const res = await fetch('/api/usuarios');
          const usuarios = await res.json();
          const tbody = document.getElementById('tabelaUsuarios');
          tbody.innerHTML = usuarios.map(u => `
            <tr class="border-b hover:bg-slate-50">
              <td class="p-2.5 font-bold">${u.nome}</td>
              <td class="p-2.5 text-slate-600">${u.email}</td>
              <td class="p-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.nivel === 'ADMIN' ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-800'}">${u.nivel}</span></td>
              <td class="p-2.5 text-slate-500">${u.dataCadastro}</td>
            </tr>
          `).join('');
        }
      </script>
    </body>
    </html>
  `);
});

// 2. APIS DE CADASTRO
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
    dataNascimento: data.dataNascimento || 'Não informada',
    email: data.email || 'Não informado',
    telefone: data.telefone || 'Não informado',
    cidadeEstado: data.cidadeEstado || 'Não informada',
    nomeCurso: data.nomeCurso,
    cargaHoraria: data.cargaHoraria ? `${data.cargaHoraria}h` : 'Não informada',
    dataEmissao: new Date().toLocaleDateString('pt-BR'),
    dataValidade: data.dataValidade ? new Date(data.dataValidade).toLocaleDateString('pt-BR') : null,
    fotoBase64: data.fotoBase64 || null,
    status: 'ATIVA'
  };

  credenciaisDB.set(tokenValidacao, credencial);

  const qrCodeBase64 = await QRCode.toDataURL(urlValidadora, {
    errorCorrectionLevel: 'H',
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' }
  });

  res.json({ success: true, credencial, qrCodeBase64, urlValidadora });
});

// APIS DE GESTÃO DE USUÁRIOS
app.get('/api/usuarios', (req, res) => {
  const lista = Array.from(usuariosDB.values()).map(u => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    nivel: u.nivel,
    dataCadastro: u.dataCadastro
  }));
  res.json(lista);
});

app.post('/api/usuarios', (req, res) => {
  const { nome, email, senha, nivel } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ success: false, error: 'Todos os campos são obrigatórios.' });
  }

  if (usuariosDB.has(email)) {
    return res.status(400).json({ success: false, error: 'E-mail já cadastrado.' });
  }

  const novoUsuario = {
    id: uuidv4(),
    nome,
    email,
    senha,
    nivel: nivel || 'OPERADOR',
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
        <p>Este registro não consta na base oficial do DPCRIM.</p>
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
          <p><strong>Emissão:</strong> ${credencial.dataEmissao}</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));
