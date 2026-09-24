const express = require('express');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Base de dados em memória
const credenciaisDB = new Map();

function mascararCPF(cpf) {
  const limpo = (cpf || '').replace(/\D/g, '');
  if (limpo.length !== 11) return '***.***.***-**';
  return `${limpo.substring(0, 3)}.***.***-${limpo.substring(9)}`;
}

// 1. PÁGINA DO PAINEL ADMIN (CADASTRO)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DPCRIM - Emissão de Credenciais</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 p-4 font-sans text-slate-800">
      <div class="max-w-md mx-auto bg-white p-6 rounded-xl shadow-md border border-slate-200">
        <div class="bg-slate-900 text-white p-4 rounded-lg text-center mb-6">
          <h1 class="text-xl font-bold tracking-wide">DPCRIM</h1>
          <p class="text-xs text-slate-300">Sistema Oficial de Credenciamento</p>
        </div>

        <form id="form" class="space-y-4">
          <div>
            <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Nome do Aluno</label>
            <input type="text" id="nomePessoa" required placeholder="Ex: Dr. Carlos Eduardo" class="w-full p-3 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
          </div>
          <div>
            <label class="block text-xs font-bold uppercase text-slate-600 mb-1">CPF</label>
            <input type="text" id="cpf" required placeholder="123.456.789-00" class="w-full p-3 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
          </div>
          <div>
            <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Curso / Especialização</label>
            <input type="text" id="nomeCurso" required placeholder="Ex: Perícia Forense" class="w-full p-3 border rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
          </div>
          <button type="submit" class="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3 rounded-lg text-sm shadow">
            EMITIR CREDENCIAL & QR CODE
          </button>
        </form>

        <div id="resultado" class="mt-6 hidden space-y-4 border-t pt-4">
          <h2 class="text-center font-bold text-slate-900 text-sm">Credencial Gerada com Sucesso!</h2>
          <div class="bg-slate-900 text-white p-4 rounded-xl relative shadow">
            <div class="bg-red-700 text-[9px] font-bold px-2 py-0.5 rounded w-max uppercase mb-2">DPCRIM • Credencial</div>
            <p id="resNome" class="font-bold text-sm text-white"></p>
            <p id="resCPF" class="text-xs text-slate-300"></p>
            <p id="resCurso" class="text-xs text-red-300 font-semibold mt-1"></p>
            <p id="resCodigo" class="text-[10px] text-slate-400 mt-2 border-t border-slate-700 pt-1"></p>
          </div>
          <div class="text-center bg-slate-50 p-3 rounded-lg border">
            <p class="text-xs font-bold text-slate-600 mb-2">QR Code de Validação</p>
            <img id="resQR" src="" class="w-32 h-32 mx-auto border p-1 bg-white rounded">
          </div>
        </div>
      </div>

      <script>
        document.getElementById('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const res = await fetch('/api/cadastrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nomePessoa: document.getElementById('nomePessoa').value,
              cpf: document.getElementById('cpf').value,
              nomeCurso: document.getElementById('nomeCurso').value
            })
          });
          const data = await res.json();
          if(data.success) {
            document.getElementById('resNome').innerText = data.credencial.nomePessoa;
            document.getElementById('resCPF').innerText = 'CPF: ' + data.credencial.cpfMascarado;
            document.getElementById('resCurso').innerText = data.credencial.nomeCurso;
            document.getElementById('resCodigo').innerText = 'REGISTRO: ' + data.credencial.codigoCredencial;
            document.getElementById('resQR').src = data.qrCodeBase64;
            document.getElementById('resultado').classList.remove('hidden');
          }
        });
      </script>
    </body>
    </html>
  `);
});

// 2. API PARA EMITIR CREDENCIAL
app.post('/api/cadastrar', async (req, res) => {
  const { nomePessoa, cpf, nomeCurso } = req.body;
  const tokenValidacao = uuidv4();
  const codigoCredencial = `DPCRIM-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const host = req.get('host');
  const protocol = req.protocol;
  const urlValidadora = `${protocol}://${host}/validar/${tokenValidacao}`;

  const credencial = {
    codigoCredencial,
    tokenValidacao,
    nomePessoa,
    cpfMascarado: mascararCPF(cpf),
    nomeCurso,
    dataEmissao: new Date().toLocaleDateString('pt-BR')
  };

  credenciaisDB.set(tokenValidacao, credencial);

  const qrCodeBase64 = await QRCode.toDataURL(urlValidadora, {
    errorCorrectionLevel: 'H',
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' }
  });

  res.json({ success: true, credencial, qrCodeBase64 });
});

// 3. PÁGINA PÚBLICA DE VALIDAÇÃO VIA QR CODE
app.get('/validar/:token', (req, res) => {
  const credencial = credenciaisDB.get(req.params.token);

  if (!credencial) {
    return res.send(`
      <body style="font-family:sans-serif; text-align:center; padding:40px; background:#fef2f2;">
        <h1 style="color:#dc2626;">❌ CREDENCIAL INVÁLIDA</h1>
        <p>Este registo não existe na base oficial do DPCRIM.</p>
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
      <div class="max-w-sm mx-auto bg-white p-6 rounded-xl shadow-lg border border-slate-200 text-center">
        <div class="bg-emerald-100 text-emerald-800 p-3 rounded-lg font-bold text-sm mb-4">
          ✅ CREDENCIAL OFICIAL ATIVA
        </div>
        <h2 class="text-slate-900 font-bold text-lg">DPCRIM</h2>
        <p class="text-xs text-slate-500 mb-4">Departamento de Pesquisas e Perícias Criminológicas</p>
        <div class="text-left space-y-2 text-sm border-t border-b py-3">
          <p><strong>Profissional:</strong> ${credencial.nomePessoa}</p>
          <p><strong>Documento:</strong> ${credencial.cpfMascarado}</p>
          <p><strong>Curso:</strong> ${credencial.nomeCurso}</p>
          <p><strong>Registo:</strong> ${credencial.codigoCredencial}</p>
          <p><strong>Emissão:</strong> ${credencial.dataEmissao}</p>
        </div>
        <p class="text-[10px] text-slate-400 mt-4">Autenticidade verificada na base oficial DPCRIM.</p>
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));
