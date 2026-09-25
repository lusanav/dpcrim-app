const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, 'public')));

const CHAVE_SECRETA = process.env.SECRET_KEY || 'DPCRIM_CHAVE_MESTRA_SEGURA_2026';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lusanaverissimo_db_user:SDFqWrmdmP8dOcht@cluster0.vaj9mqg.mongodb.net/dpcrim_db?retryWrites=true&w=majority';

let client;
let db;
let membrosColl;
let usuariosColl;
let logsColl;

async function inicializarBanco() {
  if (!db) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('dpcrim_db');
    membrosColl = db.collection('membros');
    usuariosColl = db.collection('usuarios');
    logsColl = db.collection('logs');

    const adminExiste = await usuariosColl.findOne({ email: 'admin@dpcrim.org' });
    if (!adminExiste) {
      await usuariosColl.insertOne({
        nome: 'Administrador DPCRIM',
        email: 'admin@dpcrim.org',
        senha: 'admin',
        nivel: 'ADMIN',
        dataCriacao: new Date().toLocaleDateString('pt-BR')
      });
    }
  }
}

app.use(async (req, res, next) => {
  try {
    await inicializarBanco();
    next();
  } catch (err) {
    console.error('Erro de conexão MongoDB:', err);
    res.status(500).json({ success: false, error: 'Erro de conexão com o banco de dados' });
  }
});

async function registrarLog(usuario, acao, detalhe) {
  try {
    if (logsColl) {
      await logsColl.insertOne({
        dataHora: new Date().toLocaleString('pt-BR'),
        usuario: usuario || 'SISTEMA',
        acao: acao || 'AÇÃO',
        detalhe: detalhe || '',
        timestamp: new Date()
      });
    }
  } catch (e) {}
}

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

// ----------------- ROTAS DA API -----------------

app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;
  try {
    const usuario = await usuariosColl.findOne({ email, senha });
    if (usuario) {
      await registrarLog(email, 'Login efetuado', 'Acesso autenticado no sistema');
      return res.json({ success: true });
    }
    await registrarLog(email || 'DESCONHECIDO', 'Tentativa de Login Falhou', 'Credenciais incorretas');
    res.status(401).json({ success: false, error: 'E-mail ou senha incorretos' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erro no servidor' });
  }
});

app.post('/api/membros', async (req, res) => {
  try {
    const data = req.body;
    const cpfLimpo = (data.cpf || '').replace(/\D/g, '');
    
    if (!cpfLimpo || !data.nome || !data.inscricao || !data.curso) {
      return res.status(400).json({ success: false, error: 'Preencha os campos obrigatórios.' });
    }

    const host = req.get('host');
    const protocol = req.protocol;

    const existente = await membrosColl.findOne({ cpfLimpo });
    const codigo = existente ? existente.codigo : `DPCRIM-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const tokenSeguro = existente ? existente.tokenSeguro : gerarTokenSeguro(cpfLimpo);
    const urlValidacao = `${protocol}://${host}/validar/${tokenSeguro}`;

    const membro = {
      cpfLimpo,
      nome: data.nome,
      inscricao: data.inscricao,
      cpfMascarado: mascararCPF(data.cpf),
      rg: data.rg || 'Não informado',
      curso: data.curso,
      cargaHoraria: data.cargaHoraria ? `${data.cargaHoraria}h` : 'Não informada',
      codigo,
      fotoBase64: data.fotoBase64 || (existente ? existente.fotoBase64 : null),
      dataEmissao: existente ? existente.dataEmissao : new Date().toLocaleDateString('pt-BR'),
      tokenSeguro,
      ativo: data.ativo !== undefined ? data.ativo : (existente && existente.ativo !== undefined ? existente.ativo : true),
      dataAtualizacao: new Date()
    };

    await membrosColl.updateOne({ cpfLimpo }, { $set: membro }, { upsert: true });
    await registrarLog(data.operador || 'ADMIN', existente ? 'Membro Atualizado' : 'Membro Cadastrado', `Nome: ${data.nome} | CPF: ${membro.cpfMascarado}`);

    const qrCodeApi = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlValidacao)}`;
    return res.json({ success: true, membro, qrCode: qrCodeApi });
  } catch (err) {
    console.error("Erro interno ao salvar membro:", err);
    return res.status(500).json({ success: false, error: 'Erro interno ao salvar no banco.' });
  }
});

app.patch('/api/membros/status', async (req, res) => {
  const { cpfLimpo, ativo, operador } = req.body;
  try {
    await membrosColl.updateOne({ cpfLimpo }, { $set: { ativo: !!ativo } });
    await registrarLog(operador || 'ADMIN', ativo ? 'Membro Reativado' : 'Membro Desativado', `CPF: ${cpfLimpo}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erro ao alterar estado do membro.' });
  }
});

app.post('/api/usuarios', async (req, res) => {
  const { nome, email, senha, nivel, operador } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ success: false, error: 'Preencha todos os campos do usuário.' });
  }

  try {
    await usuariosColl.updateOne(
      { email },
      { $set: { nome, email, senha, nivel: nivel || 'OPERADOR', dataCriacao: new Date().toLocaleDateString('pt-BR') } },
      { upsert: true }
    );
    await registrarLog(operador || 'ADMIN', 'Novo Usuário Criado', `Usuário: ${email}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erro ao salvar usuário no banco.' });
  }
});

// NOVA ROTA: Alterar Senha de Usuário
app.patch('/api/usuarios/senha', async (req, res) => {
  const { email, novaSenha, operador } = req.body;
  if (!email || !novaSenha) {
    return res.status(400).json({ success: false, error: 'E-mail e nova senha são obrigatórios.' });
  }

  try {
    const resultado = await usuariosColl.updateOne(
      { email },
      { $set: { senha: novaSenha } }
    );

    if (resultado.matchedCount === 0) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    await registrarLog(operador || 'ADMIN', 'Senha Alterada', `E-mail: ${email}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erro ao alterar senha no banco.' });
  }
});

app.get('/api/membros', async (req, res) => {
  try {
    const lista = await membrosColl.find({}).toArray();
    res.json(lista);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const lista = await usuariosColl.find({}, { projection: { senha: 0 } }).toArray();
    res.json(lista);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const lista = await logsColl.find({}).sort({ timestamp: -1 }).limit(100).toArray();
    res.json(lista);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.get('/api/filiados/buscar', async (req, res) => {
  const cpfLimpo = (req.query.cpf || '').replace(/\D/g, '');
  try {
    const membro = await membrosColl.findOne({ cpfLimpo });
    if (membro) return res.json({ encontrado: true, membro });
    res.json({ encontrado: false });
  } catch (err) {
    res.json({ encontrado: false });
  }
});

app.get('/validar/:token', async (req, res) => {
  const cpfLimpo = validarTokenSeguro(req.params.token);
  const membro = cpfLimpo ? await membrosColl.findOne({ cpfLimpo }) : null;

  if (!membro) {
    return res.send(`
      <body style="font-family:sans-serif; text-align:center; padding:40px; background:#fef2f2;">
        <h1 style="color:#dc2626;">❌ CREDENCIAL INVÁLIDA OU ADULTERADA</h1>
        <p style="color:#7f1d1d; font-size:14px;">A assinatura digital deste QR Code falhou na verificação do DPCRIM.</p>
      </body>
    `);
  }

  if (membro.ativo === false) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>DPCRIM - Credencial Inativa</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-red-50 min-h-screen flex items-center justify-center p-4 font-sans">
        <div class="max-w-sm w-full bg-white p-6 rounded-2xl shadow-xl border border-red-200 text-center space-y-4">
          <div class="bg-red-600 text-white font-bold p-3 rounded-xl text-xs uppercase">⚠️ CREDENCIAL SUSPENSA / INATIVA</div>
          <h2 class="text-slate-900 font-black text-xl">DPCRIM</h2>
          <p class="text-xs text-slate-600">Este registro de filiado encontra-se suspenso no sistema oficial do DPCRIM.</p>
          <div class="text-left text-xs bg-slate-50 p-3 rounded-lg border space-y-1">
            <p><strong>NOME:</strong> ${membro.nome}</p>
            <p><strong>REGISTRO:</strong> ${membro.codigo}</p>
            <p><strong>STATUS:</strong> <span class="text-red-600 font-bold">CANCELADO / DESATIVADO</span></p>
          </div>
        </div>
      </body>
      </html>
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor DPCRIM rodando na porta ${PORT}`));
