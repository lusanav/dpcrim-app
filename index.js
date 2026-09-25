const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve todos os ficheiros estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

const CHAVE_SECRETA = process.env.CHAVE_SECRETA || 'DPCRIM_CHAVE_MESTRA_SEGURA_2026';
const DB_FILE = path.join(__dirname, 'database.json');

let dbData = { membros: [], usuarios: [], logs: [] };

function carregarDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } else {
      salvarDB();
    }
  } catch (err) {
    console.error('Erro ao ler DB:', err);
  }
}

function salvarDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf8');
  } catch (err) {
    console.error('Erro ao salvar DB:', err);
  }
}

carregarDB();

if (!dbData.usuarios.find(u => u.email === 'admin@dpcrim.org')) {
  dbData.usuarios.push({
    nome: 'Administrador DPCRIM',
    email: 'admin@dpcrim.org',
    senha: 'admin',
    nivel: 'ADMIN',
    dataCriacao: new Date().toLocaleDateString('pt-BR')
  });
  salvarDB();
}

function registrarLog(usuario, acao, detalhe = '') {
  dbData.logs.unshift({
    dataHora: new Date().toLocaleString('pt-BR'),
    usuario,
    acao,
    detalhe
  });
  salvarDB();
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
    if (partes.length !== 3) return null;

    const [cpfLimpo, timestamp, hmacRecebido] = partes;
    const payload = `${cpfLimpo}:${timestamp}`;
    const hmacEsperado = crypto.createHmac('sha256', CHAVE_SECRETA).update(payload).digest('hex');

    const bufferRecebido = Buffer.from(hmacRecebido, 'hex');
    const bufferEsperado = Buffer.from(hmacEsperado, 'hex');

    if (bufferRecebido.length !== bufferEsperado.length || !crypto.timingSafeEqual(bufferRecebido, bufferEsperado)) {
      return null;
    }
    return cpfLimpo;
  } catch (e) {
    return null;
  }
}

// ROTAS DE PÁGINAS (Redirecionam para os ficheiros em public/)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/filiados', (req, res) => res.sendFile(path.join(__dirname, 'public', 'filiados.html')));
app.get('/validar/:token', (req, res) => res.sendFile(path.join(__dirname, 'public', 'validar.html')));

// ENDPOINTS DA API
app.post('/api/login', (req, res) => {
  const { email, senha } = req.body;
  const usuario = dbData.usuarios.find(u => u.email === email && u.senha === senha);
  if (usuario) {
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
    cpfLimpo,
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

  dbData.membros = dbData.membros.filter(m => m.cpfLimpo !== cpfLimpo);
  dbData.membros.push(membro);
  salvarDB();

  registrarLog(data.operador || 'ADMIN', 'Membro Cadastrado', `Nome: ${data.nome} | CPF: ${membro.cpfMascarado}`);
  const qrCodeApi = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlValidacao)}`;
  res.json({ success: true, membro, qrCode: qrCodeApi });
});

app.post('/api/usuarios', (req, res) => {
  const { nome, email, senha, nivel, operador } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes.' });

  dbData.usuarios = dbData.usuarios.filter(u => u.email !== email);
  dbData.usuarios.push({ nome, email, senha, nivel: nivel || 'OPERADOR', dataCriacao: new Date().toLocaleDateString('pt-BR') });
  salvarDB();

  registrarLog(operador || 'ADMIN', 'Novo Usuário Criado', `Usuário: ${email}`);
  res.json({ success: true });
});

app.get('/api/membros', (req, res) => res.json(dbData.membros));
app.get('/api/usuarios', (req, res) => res.json(dbData.usuarios.map(({ senha, ...rest }) => rest)));
app.get('/api/logs', (req, res) => res.json(dbData.logs));

app.get('/api/validar-token/:token', (req, res) => {
  const cpfLimpo = validarTokenSeguro(req.params.token);
  const membro = cpfLimpo ? dbData.membros.find(m => m.cpfLimpo === cpfLimpo) : null;
  if (membro) return res.json({ valido: true, membro });
  res.json({ valido: false });
});

app.get('/api/filiados/buscar', (req, res) => {
  const cpfLimpo = (req.query.cpf || '').replace(/\D/g, '');
  const membro = dbData.membros.find(m => m.cpfLimpo === cpfLimpo);
  if (membro) return res.json({ encontrado: true, membro });
  res.json({ encontrado: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor DPCRIM rodando na porta ${PORT}`));
