const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Chave Mestra Criptográfica (Camada Extremamente Segura)
const CHAVE_SECRETA = process.env.SECRET_KEY || 'DPCRIM_CHAVE_MESTRA_SEGURA_2026_HMAC_SHA256';

// Bancos de Dados em Memória
const membrosDB = new Map();   // Armazena os filiados pelo CPF limpo
const usuariosDB = new Map();  // Armazena usuários do sistema (Admins)

// Criar Administrador Padrão Inicial
usuariosDB.set('admin@dpcrim.org', {
  id: uuidv4(),
  nome: 'Diretoria DPCRIM',
  email: 'admin@dpcrim.org',
  senha: 'admin'
});

// FUNÇÕES DE SEGURANÇA E CRIPTOGRAFIA
function mascararCPF(cpf) {
  const limpo = (cpf || '').replace(/\D/g, '');
  if (limpo.length !== 11) return '***.***.***-**';
  return `${limpo.substring(0, 3)}.***.***-${limpo.substring(9)}`;
}

function gerarTokenSeguro(cpf) {
  const cpfLimpo = (cpf || '').replace(/\D/g, '');
  const timestamp = Date.now();
  const payload = `${cpfLimpo}:${timestamp}`;
  const hmac = crypto.createHmac('sha256', CHAVE_SECRETA).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

function validarTokenSeguro(tokenBase64) {
  try {
    const decodificado = Buffer.from(tokenBase64, 'base64url').toString('utf8');
    const [cpfLimpo, timestamp, hmacRecebido] = decodificado.split(':');
    const payload = `${cpfLimpo}:${timestamp}`;
    const hmacEsperado = crypto.createHmac('sha256', CHAVE_SECRETA).update(payload).digest('hex');

    if (hmacRecebido !== hmacEsperado) return null;
    return cpfLimpo;
  } catch (e) {
    return null;
  }
}

// ==========================================
// 1. PÁGINA INICIAL: LOGIN & PAINEL ADMIN
// ==========================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DPCRIM - Painel de Gestão</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-900 min-h-screen flex flex-col justify-between p-4 font-sans text-slate-800">
      
      <div class="my-auto flex flex-col items-center justify-center w-full">
        <!-- TELA DE LOGIN -->
        <div id="telaLogin" class="max-w-md w-full bg-white p-6 sm:p-8 rounded-2xl shadow-2xl border border-slate-700">
          <div class="text-center mb-6">
            <div class="bg-red-700 text-white font-black text-xl py-3 px-6 rounded-xl inline-block shadow">DPCRIM</div>
            <h1 class="text-sm font-bold text-slate-800 uppercase tracking-wider mt-3">Painel Administrativo</h1>
            <p class="text-xs text-slate-500">Acesso exclusivo para administradores e operadores</p>
          </div>

          <form id="formLogin" class="space-y-4">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-700 mb-1">E-mail Administrativo</label>
              <input type="email" id="email" required placeholder="admin@dpcrim.org" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-red-700">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-700 mb-1">Senha de Segurança</label>
              <input type="password" id="senha" required placeholder="••••••••" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-red-700">
            </div>
            <button type="submit" class="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3.5 rounded-xl text-sm shadow-md transition uppercase">
              ENTRAR NO PAINEL
            </button>
          </form>

          <div class="mt-6 border-t pt-4 text-center">
            <a href="/filiados" class="text-xs text-slate-600 hover:text-red-700 font-bold underline">
              🔍 Ir para a Consulta Pública de Filiados
            </a>
          </div>
        </div>

        <!-- PAINEL ADMINISTRATIVO (EXIBIDO APÓS LOGIN) -->
        <div id="painelAdmin" class="hidden w-full max-w-4xl bg-white p-6 rounded-2xl shadow-xl border border-slate-200 my-4">
          
          <div class="flex justify-between items-center bg-slate-900 text-white p-4 rounded-xl mb-6">
            <div>
              <h2 class="font-bold text-lg">DPCRIM • Painel Interno</h2>
              <p class="text-xs text-slate-300">Gestão do Sistema de Credenciamento</p>
            </div>
            <button onclick="location.reload()" class="bg-red-700 hover:bg-red-800 text-white text-xs px-3 py-1.5 rounded-lg font-bold">SAIR</button>
          </div>

          <!-- ABAS DE NAVEGAÇÃO -->
          <div class="flex border-b border-slate-200 mb-6 gap-2">
            <button id="tabCadBtn" onclick="alternarAbaAdmin('cad')" class="py-2.5 px-4 font-bold text-xs uppercase rounded-t-lg bg-slate-900 text-white">
              ➕ Cadastrar Novo Membro
            </button>
            <button id="tabListBtn" onclick="alternarAbaAdmin('list')" class="py-2.5 px-4 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
              📋 Lista de Pessoas Cadastradas
            </button>
          </div>

          <!-- ABA 1: FORMULÁRIO DE CADASTRO -->
          <div id="abaCadastro">
            <form id="formCadastroMembro" class="space-y-6">
              <div class="border-b pb-4">
                <h3 class="text-xs font-bold uppercase text-slate-800 mb-3">1. Dados do Membro Filiado</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="sm:col-span-2">
                    <label class="block text-xs font-bold text-slate-700 mb-1">NOME COMPLETO *</label>
                    <input type="text" id="cadNome" required placeholder="Ex: Dr. Carlos Eduardo Silva" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm">
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">NÚMERO DE INSCRIÇÃO *</label>
                    <input type="text" id="cadInscricao" required placeholder="Ex: INC-2026-001" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm">
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">CPF *</label>
                    <input type="text" id="cadCPF" required placeholder="123.456.789-00" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm">
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">RG / ÓRGÃO EXPEDIDOR</label>
                    <input type="text" id="cadRG" placeholder="12.345.678-X SSP/SP" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm">
                  </div>
                </div>
              </div>

              <div>
                <h3 class="text-xs font-bold uppercase text-slate-800 mb-3">2. Curso e Especialização</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="sm:col-span-2">
                    <label class="block text-xs font-bold text-slate-700 mb-1">CURSO / ESPECIALIDADE *</label>
                    <input type="text" id="cadCurso" required placeholder="Ex: Perícia Forense Computacional" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm">
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">CARGA HORÁRIA (HORAS)</label>
                    <input type="number" id="cadCarga" placeholder="120" class="w-full p-2.5 border rounded-lg bg-slate-50 text-sm">
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">FOTO DO PERITO</label>
                    <input type="file" id="cadFoto" accept="image/*" class="w-full p-1 border rounded-lg bg-slate-50 text-xs">
                  </div>
                </div>
              </div>

              <button type="submit" class="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl text-sm uppercase shadow">
                CADASTRAR E EMITIR CREDENCIAL
              </button>
            </form>

            <!-- Alerta visual de gravação com sucesso -->
            <div id="resCadastro" class="mt-6 hidden border-t pt-4 text-center space-y-4">
              <div class="bg-emerald-100 border border-emerald-400 text-emerald-800 p-4 rounded-xl text-center font-bold text-sm">
                🎉 Cadastro gravado com sucesso no sistema DPCRIM!
              </div>

              <div id="cardCredencial" class="max-w-md mx-auto bg-slate-900 text-white p-5 rounded-2xl text-left border border-slate-700 shadow-xl space-y-3"></div>

              <button onclick="imprimirPDF()" class="bg-red-700 hover:bg-red-800 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase shadow-md transition">
                🖨️ IMPRIMIR / GERAR PDF DA CREDENCIAL
              </button>
            </div>
          </div>

          <!-- ABA 2: LISTA DE PESSOAS CADASTRADAS -->
          <div id="abaLista" class="hidden space-y-4">
            <div class="flex justify-between items-center mb-2">
              <input type="text" id="filtroLista" onkeyup="filtrarLista()" placeholder="🔍 Pesquisar por nome, CPF ou inscrição..." class="w-full p-2.5 border rounded-xl bg-slate-50 text-xs outline-none focus:ring-2 focus:ring-slate-900">
            </div>

            <div class="overflow-x-auto border rounded-xl">
              <table class="w-full text-xs text-left border-collapse">
                <thead>
                  <tr class="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                    <th class="p-3">Foto</th>
                    <th class="p-3">Nome Completo</th>
                    <th class="p-3">Inscrição</th>
                    <th class="p-3">CPF</th>
                    <th class="p-3">Curso</th>
                    <th class="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody id="tabelaMembros" class="divide-y divide-slate-200">
                  <!-- Preenchido via JavaScript -->
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      <!-- RODAPÉ DE CRÉDITOS -->
      <footer class="w-full text-center py-4 text-xs text-slate-400 border-t border-slate-800 mt-auto">
        Desenvolvido por <strong class="text-white">Lusana Verissimo</strong>
      </footer>

      <script>
        let fotoBase64 = '';
        let listaMembrosCache = [];
        let ultimoMembroCadastrado = null;

        document.getElementById('cadFoto')?.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => { fotoBase64 = event.target.result; };
            reader.readAsDataURL(file);
          }
        });

        function alternarAbaAdmin(aba) {
          const isCad = aba === 'cad';
          document.getElementById('abaCadastro').classList.toggle('hidden', !isCad);
          document.getElementById('abaLista').classList.toggle('hidden', isCad);

          document.getElementById('tabCadBtn').className = isCad ? 'py-2.5 px-4 font-bold text-xs uppercase rounded-t-lg bg-slate-900 text-white' : 'py-2.5 px-4 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600 hover:bg-slate-200';
          document.getElementById('tabListBtn').className = !isCad ? 'py-2.5 px-4 font-bold text-xs uppercase rounded-t-lg bg-slate-900 text-white' : 'py-2.5 px-4 font-bold text-xs uppercase rounded-t-lg bg-slate-100 text-slate-600 hover:bg-slate-200';

          if (!isCad) carregarListaMembros();
        }

        // Login
        document.getElementById('formLogin').addEventListener('submit', async (e) => {
          e.preventDefault();
          const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: document.getElementById('email').value,
              senha: document.getElementById('senha').value
            })
          });
          const data = await res.json();
          if (data.success) {
            document.getElementById('telaLogin').classList.add('hidden');
            document.getElementById('painelAdmin').classList.remove('hidden');
          } else {
            alert('Acesso negado: E-mail ou senha inválidos.');
          }
        });

        // Submeter Cadastro
        document.getElementById('formCadastroMembro').addEventListener('submit', async (e) => {
          e.preventDefault();
          const res = await fetch('/api/membros', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nome: document.getElementById('cadNome').value,
              inscricao: document.getElementById('cadInscricao').value,
              cpf: document.getElementById('cadCPF').value,
              rg: document.getElementById('cadRG').value,
              curso: document.getElementById('cadCurso').value,
              cargaHoraria: document.getElementById('cadCarga').value,
              fotoBase64: fotoBase64
            })
          });

          const data = await res.json();
          if (data.success) {
            ultimoMembroCadastrado = { ...data.membro, qrCode: data.qrCode };
            
            document.getElementById('cardCredencial').innerHTML = \`
              <div class="bg-red-700 text-[10px] font-bold px-2 py-0.5 rounded w-max uppercase mb-2">DPCRIM • Credencial</div>
              <div class="flex space-x-4 items-center">
                \${data.membro.fotoBase64 ? \`<img src="\${data.membro.fotoBase64}" class="w-16 h-20 object-cover rounded border border-slate-700">\` : ''}
                <div class="text-xs space-y-1">
                  <p class="font-bold text-sm text-white">\${data.membro.nome}</p>
                  <p class="text-slate-300">INSCRIÇÃO: \${data.membro.inscricao}</p>
                  <p class="text-slate-300">CPF: \${data.membro.cpfMascarado}</p>
                  <p class="text-red-300 font-semibold">\${data.membro.curso}</p>
                </div>
              </div>
              <div class="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between items-center">
                <span>REGISTRO: \${data.membro.codigo}</span>
                <img src="\${data.qrCode}" class="w-12 h-12 bg-white p-0.5 rounded">
              </div>
            \`;

            document.getElementById('resCadastro').classList.remove('hidden');
            document.getElementById('formCadastroMembro').reset();
            fotoBase64 = '';
            alert('✅ Membro cadastrado e gravado com sucesso!');
          }
        });

        function imprimirPDF() {
          if (!ultimoMembroCadastrado) return;
          const janela = window.open('', '_blank');
          janela.document.write(\`
            <html>
            <head>
              <title>Credencial DPCRIM - \${ultimoMembroCadastrado.nome}</title>
              <style>
                body { font-family: sans-serif; padding: 20px; background: #fff; text-align: center; }
                .card { width: 350px; border: 2px solid #0f172a; border-radius: 12px; padding: 16px; margin: 0 auto; text-align: left; background: #0f172a; color: white; }
                .badge { background: #b91c1c; color: white; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; display: inline-block; }
                .foto { width: 70px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #334155; }
                .flex { display: flex; gap: 12px; align-items: center; margin-top: 10px; }
                .qr { width: 70px; height: 70px; background: white; padding: 2px; border-radius: 6px; }
                .footer { margin-top: 12px; border-top: 1px solid #334155; pt: 8px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; align-items: center; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="badge">DPCRIM • Carteira Oficial</div>
                <div class="flex">
                  \${ultimoMembroCadastrado.fotoBase64 ? \`<img src="\${ultimoMembroCadastrado.fotoBase64}" class="foto">\` : ''}
                  <div>
                    <h3 style="margin:0; font-size:14px;">\${ultimoMembroCadastrado.nome}</h3>
                    <p style="margin:2px 0; font-size:11px; color:#cbd5e1;">INSCRIÇÃO: \${ultimoMembroCadastrado.inscricao}</p>
                    <p style="margin:2px 0; font-size:11px; color:#cbd5e1;">CPF: \${ultimoMembroCadastrado.cpfMascarado}</p>
                    <p style="margin:2px 0; font-size:11px; color:#fca5a5; font-weight:bold;">\${ultimoMembroCadastrado.curso}</p>
                  </div>
                </div>
                <div class="footer">
                  <div>
                    <p style="margin:0;">REGISTRO: \${ultimoMembroCadastrado.codigo}</p>
                    <p style="margin:0;">EMISSÃO: \${ultimoMembroCadastrado.dataEmissao}</p>
                  </div>
                  <img src="\${ultimoMembroCadastrado.qrCode}" class="qr">
                </div>
              </div>
              <script>window.print();</script>
            </body>
            </html>
          \`);
        }

        async function carregarListaMembros() {
          const res = await fetch('/api/membros');
          listaMembrosCache = await res.json();
          renderizarTabela(listaMembrosCache);
        }

        function renderizarTabela(dados) {
          const tbody = document.getElementById('tabelaMembros');
          if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500">Nenhum membro cadastrado até o momento.</td></tr>';
            return;
          }

          tbody.innerHTML = dados.map(m => \`
            <tr class="hover:bg-slate-50 transition">
              <td class="p-2.5">
                <img src="\${m.fotoBase64 || 'https://via.placeholder.com/40?text=FOTO'}" class="w-8 h-10 object-cover rounded border">
              </td>
              <td class="p-2.5 font-bold text-slate-900">\${m.nome}</td>
              <td class="p-2.5 font-semibold text-slate-700">\${m.inscricao}</td>
              <td class="p-2.5 font-mono text-slate-600">\${m.cpfMascarado}</td>
              <td class="p-2.5 text-slate-700">\${m.curso}</td>
              <td class="p-2.5 text-center">
                <button onclick="verValidacao('\${m.tokenSeguro}')" class="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold px-2.5 py-1 rounded shadow">
                  🔍 Ver Registro
                </button>
              </td>
            </tr>
          \`).join('');
        }

        function filtrarLista() {
          const termo = document.getElementById('filtroLista').value.toLowerCase();
          const filtrados = listaMembrosCache.filter(m => 
            m.nome.toLowerCase().includes(termo) || 
            m.inscricao.toLowerCase().includes(termo) || 
            m.cpfMascarado.includes(termo) || 
            m.codigo.toLowerCase().includes(termo)
          );
          renderizarTabela(filtrados);
        }

        function verValidacao(token) {
          window.open('/validar/' + token, '_blank');
        }
      </script>
    </body>
    </html>
  `);
});

// ==========================================
// 2. PORTAL DE CONSULTA PÚBLICA DE FILIADOS
// ==========================================
app.get('/filiados', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DPCRIM - Consulta de Filiados</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 min-h-screen flex flex-col justify-between p-4 font-sans text-slate-800">
      
      <div class="my-auto flex flex-col items-center justify-center w-full">
        <div class="max-w-md w-full bg-white p-6 rounded-2xl shadow-xl border border-slate-200 text-center">
          <div class="bg-slate-900 text-white p-4 rounded-xl mb-6">
            <h1 class="text-xl font-bold uppercase tracking-wide">DPCRIM</h1>
            <p class="text-xs text-slate-300">Portal Público de Validação de Filiados</p>
          </div>

          <form id="formBusca" class="space-y-4 mb-6">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-700 mb-1 text-left">Consultar por CPF do Filiado</label>
              <input type="text" id="buscaCPF" required placeholder="Digite o CPF (somente números)" class="w-full p-3 border rounded-xl bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-900">
            </div>
            <button type="submit" class="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3.5 rounded-xl text-sm shadow uppercase">
              BUSCAR FILIADO
            </button>
          </form>

          <div id="resultadoBusca" class="hidden text-left border-t pt-4 space-y-3"></div>

          <div class="mt-6 border-t pt-4">
            <a href="/" class="text-xs text-slate-500 hover:text-slate-800 font-bold">🔒 Área Administrativa (Restrita)</a>
          </div>
        </div>
      </div>

      <!-- RODAPÉ DE CRÉDITOS -->
      <footer class="w-full text-center py-4 text-xs text-slate-500 border-t border-slate-200 mt-auto">
        Desenvolvido por <strong class="text-slate-800">Lusana Verissimo</strong>
      </footer>

      <script>
        document.getElementById('formBusca').addEventListener('submit', async (e) => {
          e.preventDefault();
          const cpf = document.getElementById('buscaCPF').value;
          const res = await fetch('/api/filiados/buscar?cpf=' + encodeURIComponent(cpf));
          const data = await res.json();

          const container = document.getElementById('resultadoBusca');
          container.classList.remove('hidden');

          if (data.encontrado) {
            container.innerHTML = \`
              <div class="bg-emerald-50 border border-emerald-300 text-emerald-800 p-3 rounded-xl font-bold text-center text-xs">
                ✅ REGISTRO OFICIAL ENCONTRADO E VÁLIDO
              </div>
              \${data.membro.fotoBase64 ? \`<img src="\${data.membro.fotoBase64}" class="w-20 h-24 mx-auto rounded-lg object-cover border my-2">\` : ''}
              <div class="text-xs space-y-1.5 border-t border-b py-3">
                <p><strong>NOME:</strong> \${data.membro.nome}</p>
                <p><strong>INSCRIÇÃO:</strong> \${data.membro.inscricao}</p>
                <p><strong>DOCUMENTO:</strong> \${data.membro.cpfMascarado}</p>
                <p><strong>CURSO:</strong> \${data.membro.curso}</p>
                <p><strong>REGISTRO:</strong> \${data.membro.codigo}</p>
                <p><strong>EMISSÃO:</strong> \${data.membro.dataEmissao}</p>
                <p><strong>STATUS:</strong> <span class="bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded text-[10px]">ATIVO</span></p>
              </div>
            \`;
          } else {
            container.innerHTML = \`
              <div class="bg-red-50 border border-red-300 text-red-800 p-3 rounded-xl font-bold text-center text-xs">
                ❌ NENHUM FILIADO ENCONTRADO COM ESTE CPF
              </div>
            \`;
          }
        });
      </script>
    </body>
    </html>
  `);
});

// ==========================================
// 3. PÁGINA DE VALIDAÇÃO (QR CODE SEGURO)
// ==========================================
app.get('/validar/:token', (req, res) => {
  const cpfLimpo = validarTokenSeguro(req.params.token);
  const membro = cpfLimpo ? membrosDB.get(cpfLimpo) : null;

  if (!membro) {
    return res.send(`
      <body style="font-family:sans-serif; text-align:center; padding:40px; background:#fef2f2;">
        <h1 style="color:#dc2626;">❌ CREDENCIAL INVÁLIDA OU ADULTERADA</h1>
        <p style="color:#7f1d1d; font-size:14px;">A assinatura digital deste QR Code falhou na verificação de segurança do DPCRIM.</p>
      </body>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DPCRIM - Validação Oficial</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 min-h-screen flex flex-col justify-between p-4 font-sans text-slate-800">
      <div class="my-auto flex flex-col items-center justify-center w-full">
        <div class="max-w-sm w-full bg-white p-6 rounded-2xl shadow-xl border border-slate-200 text-center">
          <div class="bg-emerald-100 border border-emerald-300 text-emerald-800 p-3 rounded-xl font-bold text-xs mb-4">
            ✅ AUTENTICIDADE VERIFICADA E VÁLIDA
          </div>
          <h2 class="text-slate-900 font-extrabold text-xl">DPCRIM</h2>
          <p class="text-[11px] text-slate-500 mb-4">Departamento de Pesquisas e Perícias Criminológicas</p>
          ${membro.fotoBase64 ? `<img src="${membro.fotoBase64}" class="w-24 h-28 mx-auto rounded-lg object-cover border shadow-sm mb-4">` : ''}
          <div class="text-left space-y-2 text-xs border-t border-b py-4">
            <p><strong>NOME DO PERITO:</strong> ${membro.nome}</p>
            <p><strong>INSCRIÇÃO:</strong> ${membro.inscricao}</p>
            <p><strong>DOCUMENTO:</strong> ${membro.cpfMascarado}</p>
            <p><strong>ESPECIALIDADE:</strong> ${membro.curso}</p>
            <p><strong>REGISTRO OFICIAL:</strong> ${membro.codigo}</p>
            <p><strong>DATA DE EMISSÃO:</strong> ${membro.dataEmissao}</p>
          </div>
          <p class="text-[10px] text-slate-400 mt-4">Documento assinado digitalmente via protocolo de segurança HMAC-SHA256 do DPCRIM.</p>
        </div>
      </div>

      <!-- RODAPÉ DE CRÉDITOS -->
      <footer class="w-full text-center py-4 text-xs text-slate-500 border-t border-slate-200 mt-auto">
        Desenvolvido por <strong class="text-slate-800">Lusana Verissimo</strong>
      </footer>
    </body>
    </html>
  `);
});

// ==========================================
// 4. ENDPOINTS DA API
// ==========================================
app.post('/api/login', (req, res) => {
  const { email, senha } = req.body;
  const usuario = usuariosDB.get(email);
  if (usuario && usuario.senha === senha) {
    return res.json({ success: true });
  }
  res.status(401).json({ success: false });
});

app.post('/api/membros', async (req, res) => {
  const data = req.body;
  const cpfLimpo = (data.cpf || '').replace(/\D/g, '');
  const codigo = `DPCRIM-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const tokenSeguro = gerarTokenSeguro(cpfLimpo);

  const host = req.get('host');
  const protocol = req.protocol;
  const urlValidacao = `${protocol}://${host}/validar/${tokenSeguro}`;

  const membro = {
    nome: data.nome,
    inscricao: data.inscricao,
    cpfMascarado: mascararCPF(data.cpf),
    rg: data.rg || 'Não informado',
    curso: data.curso,
    cargaHoraria: data.cargaHoraria ? `${data.cargaHoraria}h` : 'Não informada',
    codigo,
    fotoBase64: data.fotoBase64 || null,
    dataEmissao: new Date().toLocaleDateString('pt-BR'),
    tokenSeguro
  };

  membrosDB.set(cpfLimpo, membro);

  const qrCode = await QRCode.toDataURL(urlValidacao, { errorCorrectionLevel: 'H' });
  res.json({ success: true, membro, qrCode });
});

app.get('/api/membros', (req, res) => {
  const lista = Array.from(membrosDB.values());
  res.json(lista);
});

app.get('/api/filiados/buscar', (req, res) => {
  const cpfLimpo = (req.query.cpf || '').replace(/\D/g, '');
  const membro = membrosDB.get(cpfLimpo);
  if (membro) {
    return res.json({ encontrado: true, membro });
  }
  res.json({ encontrado: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));
