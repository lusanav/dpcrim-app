const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, 'public')));

const CHAVE_SECRETA = process.env.SECRET_KEY || 'DPCRIM_CHAVE_MESTRA_SEGURA_2026';

const membrosDB = new Map();
const usuariosDB = new Map();
const logsDB = [];

// Garantir usuário ADMIN inicial
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
  return `${limpo.substring(0, 3)}.***.***-${limpo.substring(9)}`;
}

function gerarTokenSeguro(cpf) {
  const cpfLimpo = (cpf || '').replace(/\D/g, '');
  const timestamp = Date.now();
  const payload = `${cpfLimpo}:${timestamp}`;
  const hmac = crypto.createHmac('sha256', CHAVE_SECRETA).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('hex');
}

function validarTokenSeguro(tokenHex) {
  try {
    const decodificado = Buffer.from(tokenHex, 'hex').toString('utf8');
    const partes = decodificado.split(':');
    const cpfLimpo = partes[0];
    const timestamp = partes[1];
    const hmacRecebido = partes[2];
    const payload = `${cpfLimpo}:${timestamp}`;
    const hmacEsperado = crypto.createHmac('sha256', CHAVE_SECRETA).update(payload).digest('hex');
    if (hmacRecebido !== hmacEsperado) return null;
    return cpfLimpo;
  } catch (e) {
    return null;
  }
}

// ENDPOINTS DA API
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
  registrarLog(data.operador || 'ADMIN', 'Membro Cadastrado', `Nome: ${data.nome} | CPF: ${membro.cpfMascarado}`);

  const qrCodeApi = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlValidacao)}`;
  res.json({ success: true, membro, qrCode: qrCodeApi });
});

app.post('/api/usuarios', (req, res) => {
  const { nome, email, senha, nivel, operador } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes.' });

  usuariosDB.set(email, {
    nome, email, senha, nivel: nivel || 'OPERADOR', dataCriacao: new Date().toLocaleDateString('pt-BR')
  });

  registrarLog(operador || 'ADMIN', 'Novo Usuário Criado', `Usuário: ${email}`);
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

// PÁGINA DE VALIDAÇÃO DE QR CODE
app.get('/validar/:token', (req, res) => {
  const cpfLimpo = validarTokenSeguro(req.params.token);
  const membro = cpfLimpo ? membrosDB.get(cpfLimpo) : null;

  if (!membro) {
    return res.send(`
      <body style="font-family:sans-serif; text-align:center; padding:40px; background:#fef2f2;">
        <h1 style="color:#dc2626;">❌ CREDENCIAL INVÁLIDA OU ADULTERADA</h1>
        <p style="color:#7f1d1d; font-size:14px;">A assinatura digital deste QR Code falhou na verificação do DPCRIM.</p>
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
          <div class="bg-emerald-100 border border-emerald-300 text-emerald-800 p-3 rounded-xl font-bold text-xs mb-4">✅ AUTENTICIDADE VERIFICADA E VÁLIDA</div>
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
          <p class="text-[10px] text-slate-400 mt-4">Documento assinado digitalmente via protocolo HMAC-SHA256.</p>
        </div>
      </div>
      <footer class="w-full text-center py-4 text-xs text-slate-500 border-t border-slate-200 mt-auto">Desenvolvido por <strong class="text-slate-800">Lusana Verissimo</strong></footer>
    </body>
    </html>
  `);
});

// Redirecionamento padrão para a interface HTML
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor DPCRIM rodando na porta ${PORT}`));
