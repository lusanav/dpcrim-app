const express = require('express');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Banco de dados em memória
const credenciaisDB = new Map();
const usuariosDB = new Map();

function mascararCPF(cpf) {
  const limpo = (cpf || '').replace(/\D/g, '');
  if (limpo.length !== 11) return '***.***.***-**';
  return `${limpo.substring(0, 3)}.***.***-${limpo.substring(9)}`;
}

// PÁGINA PRINCIPAL - FORMULÁRIO DE CADASTRO COMPLETO
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DPCRIM - Cadastro do Perito</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 p-3 sm:p-6 font-sans text-slate-800">
      <div class="max-w-2xl mx-auto bg-white p-6 rounded-2xl shadow-xl border border-slate-200">
        
        <!-- Cabeçalho -->
        <div class="bg-slate-900 text-white p-5 rounded-xl text-center mb-6 shadow">
          <h1 class="text-2xl font-bold tracking-wide uppercase">DPCRIM</h1>
          <p class="text-xs text-slate-300 mt-1">Cadastro de Profissionais e Emissão de Credenciais</p>
        </div>

        <!-- FORMULÁRIO DE CADASTRO COMPLETO -->
        <form id="formCadastro" class="space-y-6">
          
          <!-- SEÇÃO 1: DADOS PESSOAIS -->
          <div class="border-b pb-4">
            <h2 class="text-xs font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center">
              <span class="w-2.5 h-2.5 bg-red-700 rounded-full inline-block mr-2"></span> 1. Dados Pessoais e Documentos
            </h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="sm:col-span-2">
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Nome Completo *</label>
                <input type="text" id="nomePessoa" required placeholder="Ex: Dr. Carlos Eduardo Silva" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">CPF *</label>
                <input type="text" id="cpf" required placeholder="123.456.789-00" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">RG / Órgão Expedidor</label>
                <input type="text" id="rg" placeholder="12.345.678-X SSP/SP" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Data de Nascimento</label>
                <input type="date" id="dataNascimento" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Foto do Perito</label>
                <input type="file" id="fotoInput" accept="image/*" class="w-full p-2 border rounded-xl bg-slate-50 text-xs text-slate-500">
              </div>
            </div>
          </div>

          <!-- SEÇÃO 2: CONTATO E ENDEREÇO -->
          <div class="border-b pb-4">
            <h2 class="text-xs font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center">
              <span class="w-2.5 h-2.5 bg-red-700 rounded-full inline-block mr-2"></span> 2. Contato e Localização
            </h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">E-mail</label>
                <input type="email" id="email" placeholder="perito@exemplo.com" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Telefone / WhatsApp</label>
                <input type="tel" id="telefone" placeholder="(11) 98765-4321" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div class="sm:col-span-2">
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Cidade / Estado</label>
                <input type="text" id="cidadeEstado" placeholder="São Paulo / SP" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
            </div>
          </div>

          <!-- SEÇÃO 3: CURSO E CREDENCIAL -->
          <div>
            <h2 class="text-xs font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center">
              <span class="w-2.5 h-2.5 bg-red-700 rounded-full inline-block mr-2"></span> 3. Curso e Registro
            </h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="sm:col-span-2">
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Curso / Especialidade *</label>
                <input type="text" id="nomeCurso" required placeholder="Ex: Perícia Forense Computacional" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Carga Horária (Horas)</label>
                <input type="number" id="cargaHoraria" placeholder="120" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Data de Validade (Opcional)</label>
                <input type="date" id="dataValidade" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
              </div>
            </div>
          </div>

          <button type="submit" class="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-4 rounded-xl text-sm tracking-wide shadow-md transition uppercase mt-4">
            SALVAR CADASTRO E GERAR CREDENCIAL
          </button>
        </form>

        <!-- RESULTADO DO CADASTRO -->
        <div id="resultado" class="mt-8 hidden space-y-6 border-t pt-6">
          <div class="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-center text-xs font-bold">
            ✅ Cadastro salvo e credencial gerada com sucesso!
          </div>

          <!-- Cartão da Credencial -->
          <div class="max-w-sm mx-auto bg-slate-900 text-white rounded-2xl p-5 shadow-xl relative overflow-hidden border border-slate-700">
            <div class="bg-red-700 text-[9px] font-bold px-2 py-0.5 rounded w-max uppercase mb-3">DPCRIM • Credencial</div>
            <div class="flex space-x-3 items-center">
              <img id="resFoto" src="" class="w-16 h-20 bg-slate-800 rounded object-cover border border-slate-700">
              <div class="text-xs space-y-1">
                <p id="resNome" class="font-bold text-white"></p>
                <p id="resCPF" class="text-slate-300"></p>
                <p id="resCurso" class="text-red-300 font-semibold"></p>
              </div>
            </div>
            <div class="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between">
              <span>REGISTRO: <strong id="resCodigo" class="text-white"></strong></span>
              <span id="resValidade"></span>
            </div>
          </div>

          <!-- QR Code de Validação -->
          <div class="text-center bg-slate-50 p-4 rounded-xl border max-w-sm mx-auto">
            <p class="text-xs font-bold text-slate-700 mb-2">QR Code de Autenticidade Oficial</p>
            <img id="resQR" src="" class="w-32 h-32 mx-auto border p-1 bg-white rounded-lg">
          </div>
        </div>

      </div>

      <script>
        let fotoBase64 = '';

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
            document.getElementById('resultado').classList.remove('hidden');
          }
        });
      </script>
    </body>
    </html>
  `);
});

// ROUTE DA API PARA CADASTRAR
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

// PÁGINA PÚBLICA DE VALIDAÇÃO (AO LER O QR CODE)
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
      <title>DPCRIM - Validação de Registro</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 p-4 font-sans text-slate-800">
      <div class="max-w-sm mx-auto bg-white p-6 rounded-2xl shadow-xl border border-slate-200 text-center">
        <div class="bg-emerald-100 border border-emerald-300 text-emerald-800 p-3 rounded-xl font-bold text-xs mb-4">
          ✅ CREDENCIAL OFICIAL ATIVA
        </div>
        <h2 class="text-slate-900 font-extrabold text-xl">DPCRIM</h2>
        <p class="text-[11px] text-slate-500 mb-4">Departamento de Pesquisas e Perícias Criminológicas</p>
        ${credencial.fotoBase64 ? `<img src="${credencial.fotoBase64}" class="w-24 h-28 mx-auto rounded-lg object-cover border-2 border-slate-200 shadow-sm mb-4">` : ''}
        <div class="text-left space-y-2 text-xs border-t border-b py-4">
          <p><strong>Profissional:</strong> ${credencial.nomePessoa}</p>
          <p><strong>Documento:</strong> ${credencial.cpfMascarado}</p>
          <p><strong>Curso:</strong> ${credencial.nomeCurso}</p>
          <p><strong>Carga Horária:</strong> ${credencial.cargaHoraria}</p>
          <p><strong>Código Registro:</strong> ${credencial.codigoCredencial}</p>
          <p><strong>Data de Emissão:</strong> ${credencial.dataEmissao}</p>
          <p><strong>Validade:</strong> ${credencial.dataValidade || 'Vitalícia'}</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
