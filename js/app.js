// ===== DADOS DO APLICATIVO =====
const CHAVE_DADOS = 'controle_receitas_v2';
const CHAVE_TEMA = 'tema';
const CHAVE_ULTIMO_BACKUP = 'ultimo_backup';
const LIMITE_DIAS = 30;

const $ = id => document.getElementById(id);

// ===== JANELA DE AVISO DO APLICATIVO =====
function mostrarAviso(titulo, mensagem, aoFechar) {
  const dialogo = document.getElementById('dlgAviso');
  const tituloElemento = document.getElementById('avisoTitulo');
  const textoElemento = document.getElementById('avisoTexto');
  const botaoOk = document.getElementById('avisoOk');

  if (!dialogo || !tituloElemento || !textoElemento || !botaoOk ||
    typeof dialogo.showModal !== 'function') {
    alert(mensagem);
    if (typeof aoFechar === 'function') aoFechar();
    return;
  }

  const botaoCancelar = document.getElementById('avisoCancelar');
  if (botaoCancelar) {
    botaoCancelar.hidden = true;
    botaoCancelar.onclick = null;
  }
  botaoOk.textContent = 'OK';
  tituloElemento.textContent = titulo;
  textoElemento.textContent = mensagem;

  dialogo.onclose = () => {
    dialogo.onclose = null;
    if (typeof aoFechar === 'function') aoFechar();
  };

  botaoOk.onclick = () => dialogo.close();

  if (dialogo.open) dialogo.close();
  dialogo.showModal();
  botaoOk.focus();
}

function mostrarConfirmacao(titulo, mensagem, textoConfirmar = 'Confirmar') {
  return new Promise(resolve => {
    const dialogo = document.getElementById('dlgAviso');
    const tituloElemento = document.getElementById('avisoTitulo');
    const textoElemento = document.getElementById('avisoTexto');
    const botaoOk = document.getElementById('avisoOk');
    const botaoCancelar = document.getElementById('avisoCancelar');

    if (!dialogo || !tituloElemento || !textoElemento || !botaoOk ||
      !botaoCancelar || typeof dialogo.showModal !== 'function') {
      resolve(false);
      return;
    }

    if (dialogo.open) dialogo.close();
    tituloElemento.textContent = titulo;
    textoElemento.textContent = mensagem;
    botaoOk.textContent = textoConfirmar;
    botaoCancelar.textContent = 'Cancelar';
    botaoCancelar.hidden = false;

    let resolvido = false;
    const finalizar = resposta => {
      if (resolvido) return;
      resolvido = true;
      dialogo.onclose = null;
      botaoOk.onclick = null;
      botaoCancelar.onclick = null;
      botaoCancelar.hidden = true;
      botaoOk.textContent = 'OK';
      if (dialogo.open) dialogo.close();
      resolve(resposta);
    };

    dialogo.onclose = () => finalizar(false);
    botaoOk.onclick = () => finalizar(true);
    botaoCancelar.onclick = () => finalizar(false);
    dialogo.showModal();
    botaoCancelar.focus();
  });
}

let db = carregarDados();
let itensTemporarios = [];
let ordemReceitas = { campo: 'dataRetida', direcao: 'desc' };
let usuarioAtual = null; // guarda o id do usuário logado (somente enquanto a página está aberta)

function nomeEhAdministrador(nome) {
  const normalizado = String(nome || '').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  return normalizado === 'fabio';
}

function ehAdministrador() {
  const usuario = db.usuarios.find(item => item.id === usuarioAtual);
  return Boolean(usuario && usuario.perfil === 'administrador');
}

function criarBancoVazio() {
  return {
    versao: 3,
    usuarios: [],
    medicamentos: [],
    receitas: [],
    excluidos: [],
    unidades: []
  };
}

function ajustarBanco(dados) {
  if (!dados || typeof dados !== 'object') return criarBancoVazio();

  // Backups antigos tinham "equipe"; agora são "usuarios"
  const listaUsuarios = Array.isArray(dados.usuarios)
    ? dados.usuarios
    : (Array.isArray(dados.equipe) ? dados.equipe : []);

  return {
    versao: 3,
    usuarios: listaUsuarios.map(usuario => ({
      id: usuario.id,
      nome: usuario.nome,
      senhaHash: usuario.senhaHash || '',
      ultimoAcesso: usuario.ultimoAcesso || '',
      perfil: usuario.perfil === 'administrador' || nomeEhAdministrador(usuario.nome)
        ? 'administrador'
        : 'usuario'
    })),
    medicamentos: Array.isArray(dados.medicamentos) ? dados.medicamentos : [],
    receitas: Array.isArray(dados.receitas) ? dados.receitas : [],
    excluidos: Array.isArray(dados.excluidos) ? dados.excluidos : [],
    unidades: Array.isArray(dados.unidades)
      ? dados.unidades.filter(u => typeof u === 'string' && u.trim() !== '')
      : []
  };
}

function carregarDados() {
  try {
    const dados = localStorage.getItem(CHAVE_DADOS);
    return dados ? ajustarBanco(JSON.parse(dados)) : criarBancoVazio();
  } catch (erro) {
    return criarBancoVazio();
  }
}

function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function dataDeHoje() {
  const data = new Date();
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function verificarLembreteBackup() {
  const ultimoBackup = localStorage.getItem(CHAVE_ULTIMO_BACKUP);

  if (!ultimoBackup) {
    mostrarAviso(
      'Lembrete de backup',
      'Ainda não há backup registrado. Clique em “Salvar backup” para baixar uma cópia dos seus dados.'
    );
    return;
  }

  const diasDesdeBackup = diasEntre(ultimoBackup, dataDeHoje());

  if (diasDesdeBackup >= 30) {
    mostrarAviso(
      'Lembrete de backup',
      `Já faz ${diasDesdeBackup} dias desde o último backup. Clique em “Salvar backup” para baixar uma cópia atualizada dos seus dados.`
    );
  }
}

function formatarData(data) {
  return data ? data.split('-').reverse().join('/') : '—';
}

function formatarDataHora(iso) {
  if (!iso) return '—';
  const data = new Date(iso);
  if (isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function numero(valor) {
  return Number(String(valor ?? '').replace(',', '.')) || 0;
}

// Total por dia. Registros antigos (com manhã e noite) mostram a soma dos dois
function totalDoItem(objeto) {
  if (!objeto) return 0;

  if (objeto.total !== undefined && objeto.total !== null && objeto.total !== '') {
    return numero(objeto.total);
  }

  return numero(objeto.manha) + numero(objeto.noite);
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, caractere => ({
    '&': '&',
    '<': '<',
    '>': '>',
    '"': '&quot;',
    "'": '&#39;'
  })[caractere]);
}

function nomeDaPessoa(id) {
  const pessoa = db.usuarios.find(item => item.id === id);
  return pessoa ? pessoa.nome : '—';
}

function statusDaReceita(receita) {
  return receita.dataEntrega ? 'entregue' : 'aguardando';
}

// Rótulo da identificação (cadastro ou nascimento)
function rotuloIdentificacao(receita) {
  return receita.tipoCadastro === 'nascimento'
    ? 'Data de nascimento'
    : 'Nº do cadastro';
}

// ===== DOSAGEM COM UNIDADE (mg, ml, cp, mcg e tipos novos) =====
const UNIDADES_PADRAO = ['mg', 'ml', 'cp', 'mcg'];
const UNIDADE_VALIDA = /^[A-Za-zÀ-ÖØ-öø-ÿ%\/.]{1,12}$/;

function todasUnidades() {
  return [...UNIDADES_PADRAO, ...db.unidades];
}

// Registros antigos podem ter "10 mg" no mesmo texto: separa valor e unidade
function normalizarDosagem(objeto) {
  if (!objeto) return objeto;

  const texto = String(objeto.dosagem || '').trim();
  const partes = /^(\d+(?:[.,]\d+)?)\s*([A-Za-zÀ-ÖØ-öø-ÿ%\/.]*)$/.exec(texto);

  if (partes) {
    objeto.dosagem = partes[1];
    const unidade = partes[2].toLowerCase();
    if (!objeto.unidadeDosagem) {
      objeto.unidadeDosagem = unidade || 'mg';
    }
  } else if (!objeto.unidadeDosagem) {
    objeto.unidadeDosagem = 'mg';
  }

  return objeto;
}

// Texto para exibir, por exemplo: "10 mg"
function textoDosagem(objeto) {
  if (!objeto) return '—';
  const copia = normalizarDosagem({ ...objeto });
  const valor = String(copia.dosagem || '').trim();
  if (!valor) return '—';

  return copia.unidadeDosagem ? `${valor} ${copia.unidadeDosagem}` : valor;
}

// Lista de opções para os seletores de unidade
function opcoesUnidade(selecionada, comOpcaoNova = false) {
  const lista = todasUnidades();
  if (selecionada && !lista.includes(selecionada)) lista.push(selecionada);

  let html = lista.map(unidade =>
    `<option value="${escapar(unidade)}" ${unidade === selecionada ? 'selected' : ''}>${escapar(unidade)}</option>`
  ).join('');

  if (comOpcaoNova) {
    html += '<option value="__novo__">+ Novo tipo…</option>';
  }

  return html;
}

function atualizarSeletorUnidadeMed() {
  const seletor = $('mUnidadeDosagem');
  const botao = $('btnUnidadeDosagem');
  const lista = $('listaUnidadesMed');
  const opcaoAtual = seletor.options[seletor.selectedIndex];
  botao.textContent = opcaoAtual ? opcaoAtual.textContent : 'mg';
  lista.replaceChildren();

  Array.from(seletor.options).forEach(opcao => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'opcao-unidade-med';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(opcao.value === seletor.value));
    item.textContent = opcao.textContent;
    item.addEventListener('click', () => {
      seletor.value = opcao.value;
      botao.textContent = opcao.textContent;
      lista.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
      botao.focus();
    });
    lista.appendChild(item);
  });
}

function preencherUnidadesMed(selecionada = 'mg') {
  $('mUnidadeDosagem').innerHTML = opcoesUnidade(selecionada);
  $('mUnidadeDosagem').value = selecionada;
  atualizarSeletorUnidadeMed();
}

function salvarTipoDosagem(texto) {
  const nova = String(texto || '').trim().toLowerCase();
  if (!nova) {
    mostrarAviso('Atenção', 'Digite o novo tipo de dosagem.');
    return '';
  }
  if (!UNIDADE_VALIDA.test(nova)) {
    mostrarAviso('Atenção', 'O tipo deve ter até 12 caracteres, usando apenas letras, %, / ou ponto.');
    return '';
  }
  const existente = todasUnidades().find(u => u.toLowerCase() === nova);
  if (existente) return existente;
  db.unidades.push(nova);
  try { localStorage.setItem(CHAVE_DADOS, JSON.stringify(db)); } catch (erro) {}
  return nova;
}

$('btnUnidadeDosagem').addEventListener('click', () => {
  const lista = $('listaUnidadesMed');
  lista.hidden = !lista.hidden;
  $('btnUnidadeDosagem').setAttribute('aria-expanded', String(!lista.hidden));
});

$('mUnidadeDosagem').addEventListener('change', atualizarSeletorUnidadeMed);

document.addEventListener('click', evento => {
  if (!evento.target.closest('.seletor-unidade-med')) {
    $('listaUnidadesMed').hidden = true;
    $('btnUnidadeDosagem').setAttribute('aria-expanded', 'false');
  }
});

// ===== CÁLCULO DE DIAS =====
function criarData(texto) {
  const [ano, mes, dia] = texto.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia);
  data.setHours(0, 0, 0, 0);
  return data;
}

function diasEntre(inicio, fim) {
  if (!inicio || !fim) return 0;
  const milissegundos = criarData(fim) - criarData(inicio);
  return Math.round(milissegundos / (1000 * 60 * 60 * 24));
}

function diasDesde(data) {
  return diasEntre(data, dataDeHoje());
}

function diasDaReceita(receita) {
  if (!receita.dataRetida) return 0;

  return receita.dataEntrega
    ? diasEntre(receita.dataRetida, receita.dataEntrega)
    : diasDesde(receita.dataRetida);
}

// ===== TEMA CLARO E ESCURO =====
function aplicarTema(tema, salvarPreferencia = true) {
  const temaValido = tema === 'escuro' ? 'escuro' : 'claro';
  document.documentElement.setAttribute('data-tema', temaValido);

  const botao = $('btnTema');
  if (botao) {
    botao.textContent = temaValido === 'escuro' ? 'Modo claro' : 'Modo escuro';
    botao.setAttribute(
      'aria-label',
      temaValido === 'escuro' ? 'Mudar para modo claro' : 'Mudar para modo escuro'
    );
  }

  if (salvarPreferencia) {
    localStorage.setItem(CHAVE_TEMA, temaValido);
  }
}

$('btnTema').addEventListener('click', () => {
  const temaAtual = document.documentElement.getAttribute('data-tema');
  aplicarTema(temaAtual === 'escuro' ? 'claro' : 'escuro');
});

aplicarTema(localStorage.getItem(CHAVE_TEMA) || 'claro', false);

// ===== SENHA (4 NÚMEROS, GUARDADA EMBARALHADA) =====
async function calcularHashes(texto) {
  const resultados = [];

  try {
    if (window.crypto && window.crypto.subtle) {
      const bytes = new TextEncoder().encode(texto);
      const resumo = await window.crypto.subtle.digest('SHA-256', bytes);
      const hex = Array.from(new Uint8Array(resumo))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
      resultados.push('sha256:' + hex);
    }
  } catch (erro) {
    // segue para o método simples
  }

  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  }
  resultados.push('simples:' + h);

  return resultados;
}

async function criarHashSenha(usuarioId, senha) {
  const hashes = await calcularHashes(`${usuarioId}:${senha}`);
  return hashes[0];
}

async function senhaConfere(usuario, senha) {
  if (!usuario.senhaHash) return false;
  const hashes = await calcularHashes(`${usuario.id}:${senha}`);
  return hashes.includes(usuario.senhaHash);
}

const SENHA_4_NUMEROS = /^\d{4}$/;

// ===== LOGIN (APARECE SEMPRE) =====
function mostrarErroLogin(mensagem) {
  const caixa = $('erroLogin');
  caixa.textContent = mensagem;
  caixa.hidden = !mensagem;
}

function preencherUsuariosDoLogin(selecionado = '') {
  const usuarios = [...db.usuarios].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR')
  );
  const seletor = $('lUsuario');
  const botao = $('btnUsuarioLogin');
  const lista = $('listaUsuariosLogin');

  seletor.innerHTML =
    '<option value="">— Escolha seu nome —</option>' +
    usuarios.map(usuario => `
      <option value="${escapar(usuario.id)}"
        ${usuario.id === selecionado ? 'selected' : ''}>
        ${escapar(usuario.nome)}
      </option>
    `).join('');

  lista.replaceChildren();
  lista.hidden = true;
  botao.setAttribute('aria-expanded', 'false');

  const usuarioSelecionado = usuarios.find(usuario => usuario.id === selecionado);
  botao.textContent = usuarioSelecionado
    ? usuarioSelecionado.nome
    : '— Escolha seu nome —';

  if (usuarios.length === 0) {
    const mensagem = document.createElement('p');
    mensagem.className = 'vazio';
    mensagem.textContent = 'Nenhum usuário cadastrado. Use “Cadastrar novo usuário”.';
    lista.appendChild(mensagem);
    return;
  }

  usuarios.forEach(usuario => {
    const opcao = document.createElement('button');
    opcao.type = 'button';
    opcao.textContent = usuario.nome;
    opcao.addEventListener('click', () => {
      seletor.value = usuario.id;
      botao.textContent = usuario.nome;
      lista.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
      mostrarErroLogin('');
      $('lSenha').focus();
    });
    lista.appendChild(opcao);
  });
}

$('btnUsuarioLogin').addEventListener('click', () => {
  const lista = $('listaUsuariosLogin');
  lista.hidden = !lista.hidden;
  $('btnUsuarioLogin').setAttribute('aria-expanded', String(!lista.hidden));
  if (!lista.hidden) lista.querySelector('button')?.focus();
});

document.addEventListener('click', evento => {
  if (evento.target.closest('.seletor-usuario-login')) return;
  $('listaUsuariosLogin').hidden = true;
  $('btnUsuarioLogin').setAttribute('aria-expanded', 'false');
});

function bloquearTelaPrincipal(bloquear) {
  document.querySelectorAll('.topo, .conteudo, .rodape').forEach(elemento => {
    elemento.hidden = bloquear;
  });
}

function mostrarLogin() {
  usuarioAtual = null;
  bloquearTelaPrincipal(true);

  ['dlgReceita', 'dlgMed', 'dlgPessoa', 'dlgNovoUsuario', 'dlgExcluida'].forEach(nome => {
    if ($(nome).open) $(nome).close();
  });

  preencherUsuariosDoLogin();
  $('lSenha').value = '';
  mostrarErroLogin('');

  if (!$('dlgLogin').open) $('dlgLogin').showModal();
}

// Impede fechar a janela de login com a tecla Esc
$('dlgLogin').addEventListener('cancel', evento => evento.preventDefault());

function entrar(usuario) {
  usuarioAtual = usuario.id;
  usuario.ultimoAcesso = new Date().toISOString();

  $('usuarioAtual').textContent = usuario.perfil === 'administrador'
    ? `Usuário: ${usuario.nome} · Administrador`
    : `Usuário: ${usuario.nome}`;
  bloquearTelaPrincipal(false);

  if ($('dlgNovoUsuario').open) $('dlgNovoUsuario').close();
  if ($('dlgLogin').open) $('dlgLogin').close();

  salvarDados();
}

$('formAlterarSenha').addEventListener('submit', async evento => {
  evento.preventDefault();

  const senhaAtual = $('asSenhaAtual').value;
  const novaSenha = $('asNovaSenha').value;
  const confirmarSenha = $('asNovaSenha2').value;

  const usuario = db.usuarios.find(u => u.id === usuarioAtual);

  if (!usuario) {
    mostrarAviso('Atenção', 'Não foi possível identificar o usuário conectado.');
    return;
  }

  if (!SENHA_4_NUMEROS.test(senhaAtual)) {
    mostrarAviso('Atenção', 'Informe sua senha atual de 4 números.', () => $('asSenhaAtual').focus());
    return;
  }

  if (!await senhaConfere(usuario, senhaAtual)) {
    mostrarAviso('Atenção', 'A senha atual está incorreta.', () => $('asSenhaAtual').focus());
    return;
  }

  if (!SENHA_4_NUMEROS.test(novaSenha)) {
    mostrarAviso('Atenção', 'A nova senha deve ter exatamente 4 números.', () => $('asNovaSenha').focus());
    return;
  }

  if (novaSenha !== confirmarSenha) {
    mostrarAviso('Atenção', 'As duas novas senhas não são iguais.', () => $('asNovaSenha2').focus());
    return;
  }

  usuario.senhaHash = await criarHashSenha(usuario.id, novaSenha);
  salvarDados();

  $('dlgAlterarSenha').close();
  mostrarAviso('Sucesso', 'Sua senha foi alterada.');
});

$('formLogin').addEventListener('submit', async evento => {
  evento.preventDefault();

  const id = $('lUsuario').value;
  const senha = $('lSenha').value;
  const usuario = db.usuarios.find(item => item.id === id);

  if (!usuario) {
    mostrarErroLogin('Escolha seu nome na lista ou cadastre um novo usuário.');
    return;
  }

  if (!SENHA_4_NUMEROS.test(senha)) {
    mostrarErroLogin('A senha deve ter exatamente 4 números.');
    return;
  }

  // Usuário antigo, ainda sem senha: a senha digitada passa a valer
  if (!usuario.senhaHash) {
    const mensagem =
      `${usuario.nome} ainda não tem senha.\n\n` +
      'A senha que você digitou será a sua senha daqui para frente. Continuar?';

    if (!await mostrarConfirmacao('Definir senha', mensagem, 'Continuar')) return;

    usuario.senhaHash = await criarHashSenha(usuario.id, senha);
    entrar(usuario);
    return;
  }

  if (!(await senhaConfere(usuario, senha))) {
    mostrarErroLogin('Senha incorreta.');
    $('lSenha').value = '';
    return;
  }

  entrar(usuario);
});

$('lSenha').addEventListener('input', () => {
  $('lSenha').value = $('lSenha').value.replace(/\D/g, '').slice(0, 4);
});

// O botão de sair abre a confirmação; as opções permitem voltar ao login ou continuar conectado.
$('btnSair').addEventListener('click', () => {
  $('dlgConfirmarSaida').showModal();
});

$('btnCancelarSaida').addEventListener('click', () => {
  $('dlgConfirmarSaida').close();
});

$('btnConfirmarSaida').addEventListener('click', () => {
  $('dlgConfirmarSaida').close();
  mostrarLogin();
});

// ===== CADASTRAR NOVO USUÁRIO =====
$('btnNovoUsuario').addEventListener('click', () => {
  $('nuNome').value = '';
  $('nuSenha').value = '';
  $('nuSenha2').value = '';
  $('dlgNovoUsuario').showModal();
});

$('btnCancelarNovoUsuario').addEventListener('click', () => {
  $('dlgNovoUsuario').close();
});

$('btnAlterarSenha').addEventListener('click', () => {
  $('asSenhaAtual').value = '';
  $('asNovaSenha').value = '';
  $('asNovaSenha2').value = '';
  $('dlgAlterarSenha').showModal();
  $('asSenhaAtual').focus();
});

$('btnCancelarAlterarSenha').addEventListener('click', () => {
  $('dlgAlterarSenha').close();
});

['nuSenha', 'nuSenha2', 'pSenha'].forEach(campo => {
  $(campo).addEventListener('input', () => {
    $(campo).value = $(campo).value.replace(/\D/g, '').slice(0, 4);
  });
});

function nomeJaExiste(nome, ignorarId = '') {
  const alvo = nome.toLocaleLowerCase('pt-BR');
  return db.usuarios.some(usuario =>
    usuario.id !== ignorarId &&
    usuario.nome.trim().toLocaleLowerCase('pt-BR') === alvo
  );
}

$('formNovoUsuario').addEventListener('submit', async evento => {
  evento.preventDefault();

  const nome = $('nuNome').value.trim();
  const senha = $('nuSenha').value;
  const senha2 = $('nuSenha2').value;

  if (!nome) {
    mostrarAviso('Atenção', 'Informe o nome do usuário.', () => $('nuNome').focus());
    return;
  }

  if (nomeJaExiste(nome)) {
    mostrarAviso('Atenção', 'Já existe um usuário com esse nome. Escolha-o na lista de login.', () => $('nuNome').focus());
    return;
  }

  if (!SENHA_4_NUMEROS.test(senha)) {
    mostrarAviso('Atenção', 'A senha deve ter exatamente 4 números.', () => $('nuSenha').focus());
    return;
  }

  if (senha !== senha2) {
    mostrarAviso('Atenção', 'As duas senhas não são iguais.', () => $('nuSenha2').focus());
    return;
  }

  const id = novoId();
  const usuario = {
    id,
    nome,
    senhaHash: await criarHashSenha(id, senha),
    ultimoAcesso: '',
    perfil: nomeEhAdministrador(nome) ? 'administrador' : 'usuario'
  };

  db.usuarios.push(usuario);
  entrar(usuario);
});

// ===== SALVAR DADOS =====
function textoDosDados() {
  return JSON.stringify(
    {
      versao: 3,
      salvoEm: new Date().toISOString(),
      usuarios: db.usuarios,
      medicamentos: db.medicamentos,
      receitas: db.receitas,
      excluidos: db.excluidos,
      unidades: db.unidades
    },
    null,
    2
  );
}

function salvarDados() {
  try {
    localStorage.setItem(CHAVE_DADOS, JSON.stringify(db));
  } catch (erro) {
    mostrarAviso(
      'Erro ao salvar',
      'O navegador não conseguiu guardar os dados. Salve um backup e libere espaço no dispositivo.'
    );
  }

  atualizarTelas();
}

function atualizarTelas() {
  // Se os dados foram trocados (importação) e o usuário logado não existe mais, volta ao login
  if (usuarioAtual && !db.usuarios.some(usuario => usuario.id === usuarioAtual)) {
    mostrarLogin();
  }

  mostrarReceitas();
  mostrarMedicamentos();
  mostrarEntregues();
  mostrarExcluidos();

  $('nReceitas').textContent =
    db.receitas.filter(receita => !receita.dataEntrega).length;
  $('nEntregues').textContent =
    db.receitas.filter(receita => Boolean(receita.dataEntrega)).length;
  $('nMeds').textContent = db.medicamentos.length;
  $('nExcluidos').textContent = db.excluidos.length;
}

function mostrarReceitas() {
  const termo = $('busca').value.trim().toLocaleLowerCase('pt-BR');

  const receitas = db.receitas
    .filter(receita => !receita.dataEntrega)
    .filter(receita =>
      (receita.paciente || '')
        .toLocaleLowerCase('pt-BR')
        .includes(termo)
    )
    .sort((a, b) => {
      const campo = ordemReceitas.campo;
      let valorA;
      let valorB;

      if (campo === 'paciente') {
        valorA = (a.paciente || '').toLocaleLowerCase('pt-BR');
        valorB = (b.paciente || '').toLocaleLowerCase('pt-BR');
      } else if (campo === 'retidaPor') {
        valorA = nomeDaPessoa(a.retidaPor).toLocaleLowerCase('pt-BR');
        valorB = nomeDaPessoa(b.retidaPor).toLocaleLowerCase('pt-BR');
      } else if (campo === 'medicamentos') {
        valorA = (a.itens || []).length;
        valorB = (b.itens || []).length;
      } else {
        valorA = a[campo] || '';
        valorB = b[campo] || '';
      }

      let resultado;

      if (typeof valorA === 'number' && typeof valorB === 'number') {
        resultado = valorA - valorB;
      } else {
        resultado = String(valorA).localeCompare(
          String(valorB),
          'pt-BR',
          { numeric: true }
        );
      }

      return ordemReceitas.direcao === 'asc' ? resultado : -resultado;
    });

  $('listaReceitas').innerHTML = receitas.map(receita => {
    const quantidade = (receita.itens || []).length;
    const textoQuantidade =
      quantidade === 1 ? '1 medicamento' : `${quantidade} medicamentos`;

    const dataRetirar = receita.dataRetida
      ? (() => {
        const [ano, mes, dia] = receita.dataRetida.split('-').map(Number);
        const data = new Date(ano, mes - 1, dia);
        data.setDate(data.getDate() + 15);

        const anoFinal = data.getFullYear();
        const mesFinal = String(data.getMonth() + 1).padStart(2, '0');
        const diaFinal = String(data.getDate()).padStart(2, '0');

        return `${anoFinal}-${mesFinal}-${diaFinal}`;
      })()
      : '';

    const dias = diasDaReceita(receita);
    const passouDoLimite = dias > LIMITE_DIAS;
    const avisoDias = dias === LIMITE_DIAS - 1
      ? '<span class="alerta-dias">Falta 1 dia para completar 30 dias</span>'
      : passouDoLimite
        ? `<span class="alerta-dias">${dias} dias</span>`
        : '';

    return `
      <tr class="${passouDoLimite ? 'atrasada' : ''}">
        <td data-label="Paciente">
          <button
            class="link-nome"
            type="button"
            data-acao="abrir-receita"
            data-id="${escapar(receita.id)}">
            ${escapar(receita.paciente)}
          </button>
        </td>
       <td data-label="Retida em">${formatarData(receita.dataRetida)}</td>
<td data-label="Retirar a partir de">${formatarData(dataRetirar) || '—'}</td>
<td data-label="Retida por">${escapar(nomeDaPessoa(receita.retidaPor))}</td>
        <td data-label="Status">
          <span class="tag aguardando">Aguardando entrega</span>
          ${avisoDias}
        </td>
        <td data-label="Medicamentos">${textoQuantidade}</td>
        <td data-label="Entregue em">—</td>
      </tr>
    `;
  }).join('');

  $('vazioReceitas').hidden = receitas.length > 0;

  $('kTotal').textContent = db.receitas.length;
  $('kRetidas').textContent =
    db.receitas.filter(receita => Boolean(receita.dataRetida)).length;
  $('kEntregue').textContent =
    db.receitas.filter(receita => Boolean(receita.dataEntrega)).length;
  $('kAguardando').textContent =
    db.receitas.filter(receita => !receita.dataEntrega).length;
}

function mostrarMedicamentos() {
  const busca = $('buscaMed').value.trim().toLocaleLowerCase('pt-BR');

  const medicamentos = db.medicamentos
    .filter(medicamento =>
      `${medicamento.nome} ${textoDosagem(medicamento)}`
        .toLocaleLowerCase('pt-BR')
        .includes(busca)
    )
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  $('listaMeds').innerHTML = medicamentos.map(medicamento => `
      <tr>
        <td data-label="Medicamento"><strong>${escapar(medicamento.nome)}</strong></td>
        <td data-label="Dosagem">${escapar(textoDosagem(medicamento))}</td>
        <td data-label="Ações">
          <button class="btn pequeno" type="button"
            data-acao="editar-medicamento" data-id="${escapar(medicamento.id)}">
            Editar
          </button>
          <button class="btn pequeno perigo" type="button"
            data-acao="excluir-medicamento" data-id="${escapar(medicamento.id)}">
            Excluir
          </button>
        </td>
      </tr>
    `).join('');

  $('vazioMeds').hidden = medicamentos.length > 0;
}

// ===== LISTA DE MEDICAMENTOS NA JANELA DE SELEÇÃO =====
function mostrarMedsParaEscolha() {
  const campoBusca = $('buscaEscolherMed');
  const lista = $('listaEscolherMeds');

  if (!campoBusca || !lista) return;

  const termo = campoBusca.value.trim().toLocaleLowerCase('pt-BR');

  const medicamentos = db.medicamentos
    .filter(medicamento =>
      `${medicamento.nome} ${textoDosagem(medicamento)}`
        .toLocaleLowerCase('pt-BR')
        .includes(termo)
    )
    .sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR')
    );

  if (medicamentos.length === 0) {
    lista.innerHTML = '<p class="vazio">Nenhum medicamento encontrado.</p>';
    return;
  }

  lista.innerHTML = medicamentos.map(medicamento => `
    <label>
      <input
        type="checkbox"
        value="${escapar(medicamento.id)}"
        data-escolher-medicamento>
      <span>
        <strong>${escapar(medicamento.nome)}</strong>
        ${medicamento.dosagem
      ? ` — ${escapar(textoDosagem(medicamento))}`
      : ''}
      </span>
    </label>
  `).join('');
}

$('buscaEscolherMed').addEventListener('input', mostrarMedsParaEscolha);

// ===== EXCLUÍDOS (SOMENTE CONSULTA) =====
function mostrarExcluidos() {
  const lista = [...db.excluidos].sort((a, b) =>
    String(b.excluidaEm || '').localeCompare(String(a.excluidaEm || ''))
  );

  $('listaExcluidos').innerHTML = lista.map(receita => `
    <tr>
      <td data-label="Paciente">
        <button
          class="link-nome"
          type="button"
          data-consultar-excluida="${escapar(receita.id)}">
          ${escapar(receita.paciente)}
        </button>
      </td>
      <td data-label="Retida em">${formatarData(receita.dataRetida)}</td>
      <td data-label="Retirada em">${formatarData(receita.dataEntrega)}</td>
      <td data-label="Excluída por">${escapar(nomeDaPessoa(receita.excluidaPor))}</td>
      <td data-label="Excluída em">${formatarDataHora(receita.excluidaEm)}</td>
    </tr>
  `).join('');

  $('vazioExcluidos').hidden = lista.length > 0;
}

function mostrarResultadosBuscaGeral() {
  const termo = $('busca').value.trim().toLocaleLowerCase('pt-BR');
  const resultados = $('resultadosBuscaGeral');

  if (!termo) {
    resultados.hidden = true;
    resultados.innerHTML = '';
    return;
  }

  const encontrados = [
    ...db.receitas.map(receita => ({
      receita,
      categoria: receita.dataEntrega ? 'Entregues' : 'Receitas'
    })),
    ...db.excluidos.map(receita => ({
      receita,
      categoria: 'Excluídos'
    }))
  ].filter(item =>
    (item.receita.paciente || '')
      .toLocaleLowerCase('pt-BR')
      .includes(termo)
  );

  resultados.hidden = false;

  resultados.innerHTML = encontrados.length
    ? `
      <strong>Pacientes encontrados:</strong>
      <ul>
        ${encontrados.map(item => `
          <li>
            <button
              type="button"
              data-acao="abrir-receita"
              data-id="${escapar(item.receita.id)}"
            >
              ${escapar(item.receita.paciente)}
              — <strong>${item.categoria}</strong>
            </button>
          </li>
        `).join('')}
      </ul>
    `
    : '<p>Nenhum paciente encontrado nas abas Receitas, Entregues ou Excluídos.</p>';
}

// ===== ENTREGUES (SOMENTE CONSULTA) =====
function mostrarEntregues() {
  const receitas = db.receitas
    .filter(receita => Boolean(receita.dataEntrega))
    .sort((a, b) =>
      String(b.dataEntrega || '').localeCompare(String(a.dataEntrega || ''))
    );

  $('listaEntregues').innerHTML = receitas.map(receita => {
    const dias = diasDaReceita(receita);
    const avisoAntecipado =
      dias === LIMITE_DIAS - 1
        ? '<span class="alerta-dias">Falta 1 dia para completar 30 dias</span>'
        : '';

    return `
      <tr class="${dias >= LIMITE_DIAS - 1 ? 'atrasada' : ''}">
        <td data-label="Paciente">
          <button
            class="link-nome"
            type="button"
            data-consultar-entregue="${escapar(receita.id)}">
            ${escapar(receita.paciente)}
          </button>
        </td>
        <td data-label="Retida em">${formatarData(receita.dataRetida)}</td>
        <td data-label="Retirada em">
          ${formatarData(receita.dataEntrega)}
          ${avisoAntecipado}
        </td>
        <td data-label="Retida por">${escapar(nomeDaPessoa(receita.retidaPor))}</td>
        <td data-label="Entregue por">${escapar(nomeDaPessoa(receita.entreguePor))}</td>
      </tr>
    `;
  }).join('');

  $('vazioEntregues').hidden = receitas.length > 0;
}

// ===== CONSULTAR RECEITA (SOMENTE LEITURA) =====
function abrirConsulta(receita, titulo) {
  const itens = Array.isArray(receita.itens) ? receita.itens : [];
  const estaExcluida = db.excluidos.some(item => item.id === receita.id);
  const administrador = ehAdministrador();

  const linhasMedicamentos = itens.length
    ? itens.map(item => `
        <tr>
          <td>${escapar(item.nome) || '—'}</td>
          <td>${escapar(textoDosagem(item))}</td>
          <td>${totalDoItem(item)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3">Nenhum medicamento registrado.</td></tr>';

  const linhasExclusao = receita.excluidaPor
    ? `
      <p><strong>Excluída por:</strong> ${escapar(nomeDaPessoa(receita.excluidaPor))}</p>
      <p><strong>Excluída em:</strong> ${formatarDataHora(receita.excluidaEm)}</p>
    `
    : '';

  const linhaAlteracao = receita.alteradaPor
    ? `<p><strong>Última alteração:</strong> ${escapar(nomeDaPessoa(receita.alteradaPor))} em ${formatarDataHora(receita.alteradaEm)}</p>`
    : '';

  let dataRetirar = '';

  if (receita.dataRetida) {
    const [ano, mes, dia] = receita.dataRetida.split('-').map(Number);
    const dataCalculada = new Date(ano, mes - 1, dia);
    dataCalculada.setDate(dataCalculada.getDate() + 15);

    const anoFinal = dataCalculada.getFullYear();
    const mesFinal = String(dataCalculada.getMonth() + 1).padStart(2, '0');
    const diaFinal = String(dataCalculada.getDate()).padStart(2, '0');

    dataRetirar = `${anoFinal}-${mesFinal}-${diaFinal}`;
  }

  $('detalheExcluida').innerHTML = `
    <p><strong>Paciente:</strong> ${escapar(receita.paciente) || '—'}</p>
    <p><strong>${rotuloIdentificacao(receita)}:</strong> ${escapar(receita.cadastro) || '—'}</p>
    <p><strong>Retida em:</strong> ${formatarData(receita.dataRetida)}</p>
    <p><strong>Retirar a partir de:</strong> ${formatarData(dataRetirar) || '—'}</p>
    <p><strong>Retida por:</strong> ${escapar(nomeDaPessoa(receita.retidaPor))}</p>
    <p><strong>Retirada em:</strong> ${formatarData(receita.dataEntrega)}</p>
    <p><strong>Entregue por:</strong> ${escapar(nomeDaPessoa(receita.entreguePor))}</p>
    ${linhaAlteracao}
    ${linhasExclusao}

    <h3>Medicamentos</h3>
    <div class="tabela-box">
      <table>
        <thead>
          <tr>
            <th>Nome do medicamento</th>
            <th>Dosagem</th>
            <th>Total/Dia</th>
          </tr>
        </thead>
        <tbody>${linhasMedicamentos}</tbody>
      </table>
    </div>

    <h3>Observações</h3>
    <p>${escapar(receita.obs) || '—'}</p>
  `;

  const tituloJanela = $('dlgExcluida').querySelector('h2');
  if (tituloJanela) tituloJanela.textContent = titulo;

  const botaoEditar = $('btnEditarConsulta');
  botaoEditar.hidden = !administrador && Boolean(receita.dataEntrega || receita.excluidaPor);
  botaoEditar.textContent = administrador ? 'Editar registro' : 'Editar';
  botaoEditar.dataset.receitaId = receita.id;
  botaoEditar.dataset.origem = estaExcluida ? 'excluidos' : 'receitas';

  const botaoExcluirDefinitivamente = $('btnExcluirDefinitivamente');
  botaoExcluirDefinitivamente.hidden = !administrador || !estaExcluida;
  botaoExcluirDefinitivamente.dataset.receitaId = receita.id;

  $('dlgExcluida').showModal();
}

$('listaExcluidos').addEventListener('click', evento => {
  const botao = evento.target.closest('[data-consultar-excluida]');
  if (!botao) return;

  const receita = db.excluidos.find(
    item => item.id === botao.dataset.consultarExcluida
  );

  if (!receita) return;

  abrirConsulta(receita, 'Receita excluída (somente consulta)');
});

$('listaEntregues').addEventListener('click', evento => {
  const botao = evento.target.closest('[data-consultar-entregue]');
  if (!botao) return;

  const receita = db.receitas.find(
    item => item.id === botao.dataset.consultarEntregue
  );

  if (!receita || !receita.dataEntrega) return;

  abrirConsulta(receita, 'Receita entregue (somente consulta)');
});

$('btnEditarConsulta').addEventListener('click', () => {
  const botao = $('btnEditarConsulta');
  const id = botao.dataset.receitaId;
  const origem = botao.dataset.origem || 'receitas';
  $('dlgExcluida').close();
  abrirReceita(id, origem);
});

$('btnExcluirDefinitivamente').addEventListener('click', async () => {
  if (!ehAdministrador()) return;
  const id = $('btnExcluirDefinitivamente').dataset.receitaId;
  const receita = db.excluidos.find(item => item.id === id);
  if (!receita) return;
  const confirmar = await mostrarConfirmacao(
    'Excluir registro definitivamente?',
    `O registro de ${receita.paciente || 'paciente'} será removido permanentemente deste navegador. Esta ação não pode ser desfeita.`,
    'Excluir definitivamente'
  );
  if (!confirmar) return;
  db.excluidos = db.excluidos.filter(item => item.id !== id);
  $('dlgExcluida').close();
  salvarDados();
});

$('btnFecharExcluida').addEventListener('click', () => {
  $('dlgExcluida').close();
});

// ===== ORDENAR RECEITAS AO CLICAR NO TÍTULO =====
document.querySelectorAll('[data-ordenar]').forEach(botao => {
  botao.addEventListener('click', () => {
    const campo = botao.dataset.ordenar;

    if (ordemReceitas.campo === campo) {
      ordemReceitas.direcao =
        ordemReceitas.direcao === 'asc' ? 'desc' : 'asc';
    } else {
      ordemReceitas.campo = campo;
      ordemReceitas.direcao = 'asc';
    }

    document.querySelectorAll('[data-ordenar]').forEach(outroBotao => {
      const setaAntiga = outroBotao.querySelector('.seta');
      if (setaAntiga) setaAntiga.remove();
    });

    const seta = document.createElement('span');
    seta.className = 'seta';
    seta.textContent = ordemReceitas.direcao === 'asc' ? '▲' : '▼';
    botao.appendChild(seta);

    mostrarReceitas();
  });
});

// ===== ABAS =====
document.querySelectorAll('.aba').forEach(botao => {
  botao.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach(aba => {
      aba.classList.toggle('ativa', aba === botao);
    });

    ['receitas', 'medicamentos', 'entregues', 'excluidos'].forEach(nome => {
      $(`aba-${nome}`).hidden = nome !== botao.dataset.aba;
    });
  });
});

let avisoBuscaMostrado = false;

// ===== POUP-UP DO CAMPO SOMENTE NOME DO PACIENTE =====

$('busca').addEventListener('focus', () => {
  if (!avisoBuscaMostrado) {
    mostrarAviso('Busca por paciente', 'A busca localiza pacientes somente pelo nome e mostra em qual aba estão.');
    avisoBuscaMostrado = true;
  }
});

$('busca').addEventListener('input', () => {
  mostrarReceitas();
  mostrarResultadosBuscaGeral();
});

$('buscaMed').addEventListener('input', mostrarMedicamentos);

// ===== ABRIR JANELAS E EXECUTAR AÇÕES =====
document.addEventListener('click', evento => {
  const botao = evento.target.closest('[data-acao]');
  if (!botao || !usuarioAtual) return;

  const id = botao.dataset.id;

  switch (botao.dataset.acao) {
    case 'abrir-receita': {
      const receita =
        db.receitas.find(item => item.id === id) ||
        db.excluidos.find(item => item.id === id);

      if (receita) {
        const aba = db.excluidos.some(item => item.id === id)
          ? 'excluidos'
          : receita.dataEntrega
            ? 'entregues'
            : 'receitas';

        const botaoAba = document.querySelector(`.aba[data-aba="${aba}"]`);

        if (botaoAba) {
          botaoAba.click();
        }

        abrirConsulta(receita, 'Receita (somente consulta)');
      }

      break;
    }

    case 'editar-medicamento':
      abrirMedicamento(id);
      break;

    case 'excluir-medicamento':
      excluirMedicamento(id);
      break;

    case 'editar-pessoa':
      abrirPessoa(id);
      break;
  }
});

// ===== RECEITAS =====
function textoInfoRegistro(receita) {
  const partes = [`Cadastrada por: ${nomeDaPessoa(receita.retidaPor)}`];

  if (receita.dataEntrega) {
    partes.push(`Entregue por: ${nomeDaPessoa(receita.entreguePor)}`);
  }

  if (receita.alteradaPor) {
    partes.push(
      `Última alteração: ${nomeDaPessoa(receita.alteradaPor)} em ${formatarDataHora(receita.alteradaEm)}`
    );
  }

  return partes.join(' | ');
}

function abrirReceita(id = '', origem = 'receitas') {
  const listaFonte = origem === 'excluidos' ? db.excluidos : db.receitas;
  const receita = listaFonte.find(item => item.id === id);

  if (origem === 'excluidos' && !ehAdministrador()) {
    mostrarAviso('Atenção', 'Somente o administrador pode alterar registros excluídos.');
    return;
  }

  // Receitas entregues são somente consulta para usuários comuns.
  if (receita && receita.dataEntrega && !ehAdministrador()) {
    abrirConsulta(receita, 'Receita entregue (somente consulta)');
    return;
  }

  $('formReceita').dataset.id = receita ? receita.id : '';
  $('formReceita').dataset.origem = receita ? origem : 'receitas';
  $('tituloReceita').textContent = receita
    ? (origem === 'excluidos' ? 'Editar registro excluído' : receita.dataEntrega ? 'Editar receita entregue' : 'Conferir ou alterar receita')
    : 'Nova receita';

  $('infoRegistro').hidden = !receita;
  $('infoRegistro').textContent = receita ? textoInfoRegistro(receita) : '';

  $('rPaciente').value = receita ? receita.paciente : '';

  // Tipo de identificação (receitas antigas ficam como "cadastro")
  $('rTipoCadastro').value =
    receita && receita.tipoCadastro === 'nascimento' ? 'nascimento' : 'cadastro';

  aplicarTipoCadastro(false);
  $('rCadastro').value = receita ? receita.cadastro || '' : '';

  // Receita existente mantém a data salva; receita nova recebe a data de hoje.
  $('rDataRetida').value = receita
    ? receita.dataRetida || dataDeHoje()
    : dataDeHoje();

  // A data retida não pode ser alterada.
  $('rDataRetida').disabled = true;

  // Calcula "Retirar a partir de" para 15 dias depois da retenção.
  const dataBaseRetirada = $('rDataRetida').value;

  if (dataBaseRetirada) {
    const [ano, mes, dia] = dataBaseRetirada.split('-').map(Number);
    const dataRetirada = new Date(ano, mes - 1, dia);
    dataRetirada.setDate(dataRetirada.getDate() + 15);

    const anoRetirada = dataRetirada.getFullYear();
    const mesRetirada = String(dataRetirada.getMonth() + 1).padStart(2, '0');
    const diaRetirada = String(dataRetirada.getDate()).padStart(2, '0');

    $('rDataRetirar').value =
      `${anoRetirada}-${mesRetirada}-${diaRetirada}`;
  } else {
    $('rDataRetirar').value = '';
  }

  // A data de retirada também é automática e não pode ser alterada.
  $('rDataRetirar').disabled = true;

  $('rDataEntrega').value = receita ? receita.dataEntrega || '' : '';
  $('rObs').value = receita ? receita.obs || '' : '';

  // A seleção de medicamentos é feita pela janela aberta no botão
  // "Adicionar do catálogo".
  itensTemporarios = receita
    ? JSON.parse(JSON.stringify(receita.itens || []))
    : [];

  itensTemporarios.forEach(item => {
    normalizarDosagem(item);
    item.total = totalDoItem(item);
  });

  $('btnExcluirReceita').hidden = !receita;
  $('btnExcluirReceita').textContent = origem === 'excluidos'
    ? 'Excluir definitivamente'
    : 'Excluir receita';
  mostrarItensDaReceita();

  $('dlgReceita').showModal();
}

function mostrarItensDaReceita() {
  $('rContagem').textContent = itensTemporarios.length;

  if (itensTemporarios.length === 0) {
    $('rItens').innerHTML =
      '<div class="sem-itens">Nenhum medicamento incluído nesta receita.</div>';
    return;
  }

  $('rItens').innerHTML = itensTemporarios.map((item, indice) => `
    <div class="item-med">
      <label>
        <span>Nome do medicamento</span>
        <input data-indice="${indice}" data-campo="nome"
          value="${escapar(item.nome)}" placeholder="Ex.: nome do medicamento">
      </label>

      <label>
        <span>Dosagem</span>
        <div class="dosagem-campo">
          <input data-indice="${indice}" data-campo="dosagem"
            inputmode="decimal" value="${escapar(item.dosagem)}" placeholder="Ex.: 10">
          <select data-indice="${indice}" data-campo="unidadeDosagem"
            aria-label="Unidade da dosagem">
            ${opcoesUnidade(item.unidadeDosagem || 'mg', true)}
          </select>
        </div>
      </label>

      <label>
        <span>Total/Dia</span>
        <input data-indice="${indice}" data-campo="total"
          type="number" step="0.5" min="0" value="${totalDoItem(item)}">
      </label>

      <button type="button" class="btn pequeno perigo"
        data-remover-item="${indice}">Remover</button>
    </div>
  `).join('');
}

$('rItens').addEventListener('input', evento => {
  const indice = evento.target.dataset.indice;
  const campo = evento.target.dataset.campo;

  if (indice === undefined || !campo) return;

  // Dosagem: somente números, vírgula ou ponto
  if (campo === 'dosagem') {
    evento.target.value = evento.target.value.replace(/[^0-9.,]/g, '');
  }

  itensTemporarios[indice][campo] =
    campo === 'total'
      ? numero(evento.target.value)
      : evento.target.value;

  $('rContagem').textContent = itensTemporarios.length;
});

$('rItens').addEventListener('change', evento => {
  if (evento.target.dataset.campo !== 'unidadeDosagem' || evento.target.value !== '__novo__') return;
  $('dlgNovaUnidadeReceita').dataset.indice = evento.target.dataset.indice;
  $('novaUnidadeReceita').value = '';
  $('dlgNovaUnidadeReceita').showModal();
  $('novaUnidadeReceita').focus();
});

$('btnSalvarUnidadeReceita').addEventListener('click', () => {
  const janela = $('dlgNovaUnidadeReceita');
  const nova = salvarTipoDosagem($('novaUnidadeReceita').value);
  if (!nova) { $('novaUnidadeReceita').focus(); return; }
  const indice = Number(janela.dataset.indice);
  if (Number.isInteger(indice) && itensTemporarios[indice]) {
    itensTemporarios[indice].unidadeDosagem = nova;
  }
  janela.close();
  mostrarItensDaReceita();
});

$('btnCancelarUnidadeReceita').addEventListener('click', () => {
  $('dlgNovaUnidadeReceita').close();
  mostrarItensDaReceita();
});

$('rItens').addEventListener('click', evento => {
  const indice = evento.target.dataset.removerItem;
  if (indice === undefined) return;

  itensTemporarios.splice(Number(indice), 1);
  mostrarItensDaReceita();
});

let medicamentosSelecionados = new Set();

function mostrarMedicamentosNaSelecao() {
  const termo = $('buscaEscolherMed').value
    .trim()
    .toLocaleLowerCase('pt-BR');

  const ordem = $('ordemEscolherMed').value;

  const medicamentos = db.medicamentos
    .filter(medicamento =>
      `${medicamento.nome} ${textoDosagem(medicamento)}`
        .toLocaleLowerCase('pt-BR')
        .includes(termo)
    )
    .sort((a, b) => {
      const comparacao = a.nome.localeCompare(b.nome, 'pt-BR');
      return ordem === 'desc' ? -comparacao : comparacao;
    });

  $('vazioEscolherMeds').hidden = medicamentos.length > 0;

  if (medicamentos.length === 0) {
    $('listaEscolherMeds').innerHTML = '';
    return;
  }

  $('listaEscolherMeds').innerHTML = medicamentos.map(medicamento => `
    <label>
      <input
        type="checkbox"
        value="${escapar(medicamento.id)}"
        ${medicamentosSelecionados.has(medicamento.id) ? 'checked' : ''}>
      <strong>${escapar(medicamento.nome)}</strong>
      — ${escapar(textoDosagem(medicamento))}
    </label>
  `).join('');

  $('listaEscolherMeds')
    .querySelectorAll('input[type="checkbox"]')
    .forEach(caixa => {
      caixa.addEventListener('change', () => {
        if (caixa.checked) {
          medicamentosSelecionados.add(caixa.value);
        } else {
          medicamentosSelecionados.delete(caixa.value);
        }
      });
    });
}

$('buscaEscolherMed').addEventListener(
  'input',
  mostrarMedicamentosNaSelecao
);

$('ordemEscolherMed').addEventListener(
  'change',
  mostrarMedicamentosNaSelecao
);

$('btnAddMed').addEventListener('click', () => {
  medicamentosSelecionados.clear();
  $('buscaEscolherMed').value = '';
  $('ordemEscolherMed').value = 'asc';
  mostrarMedicamentosNaSelecao();
  $('dlgEscolherMeds').showModal();
});

$('btnCadastrarMedNaSelecao').addEventListener('click', () => {
  const nome = $('novoMedReceitaNome').value.trim();
  const dosagem = $('novoMedReceitaDosagem').value.trim();
  const unidadeDosagem = $('novoMedReceitaUnidade').value;
  const totalTexto = $('novoMedReceitaTotal').value;
  const total = numero(totalTexto);

  if (!nome) {
    mostrarAviso(
      'Atenção',
      'Informe o nome do medicamento.',
      () => $('novoMedReceitaNome').focus()
    );
    return;
  }

  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(nome)) {
    mostrarAviso(
      'Atenção',
      'O nome do medicamento deve conter letras. Não pode ser apenas números.',
      () => $('novoMedReceitaNome').focus()
    );
    return;
  }

  if (dosagem && !DOSAGEM_VALIDA.test(dosagem)) {
    mostrarAviso(
      'Atenção',
      'A dosagem deve conter apenas números. Exemplo: 10 ou 0,5.',
      () => $('novoMedReceitaDosagem').focus()
    );
    return;
  }

  if (totalTexto === '' || total < 0) {
    mostrarAviso(
      'Atenção',
      'Informe um Total/Dia igual ou maior que zero.',
      () => $('novoMedReceitaTotal').focus()
    );
    return;
  }

  const medicamento = {
    id: novoId(),
    nome,
    dosagem,
    unidadeDosagem: dosagem ? unidadeDosagem : '',
    total
  };

  db.medicamentos.push(medicamento);
  medicamentosSelecionados.add(medicamento.id);

  $('novoMedReceitaNome').value = '';
  $('novoMedReceitaDosagem').value = '';
  $('novoMedReceitaUnidade').value = 'mg';
  $('novoMedReceitaTotal').value = '0';
  $('buscaEscolherMed').value = '';

  const cadastro = $('btnCadastrarMedNaSelecao').closest('details');
  if (cadastro) cadastro.open = false;

  mostrarMedicamentosNaSelecao();
  salvarDados();
});

$('btnConfirmarMeds').addEventListener('click', () => {
  const selecionados = db.medicamentos.filter(medicamento =>
    medicamentosSelecionados.has(medicamento.id)
  );

  if (selecionados.length === 0) {
    mostrarAviso(
      'Atenção',
      'Selecione pelo menos um medicamento para adicionar à receita.'
    );
    return;
  }

  selecionados.forEach(medicamento => {
    const dados = normalizarDosagem({ ...medicamento });

    itensTemporarios.push({
      nome: dados.nome,
      dosagem: dados.dosagem || '',
      unidadeDosagem: dados.dosagem
        ? (dados.unidadeDosagem || 'mg')
        : '',
      total: totalDoItem(dados)
    });
  });

  medicamentosSelecionados.clear();
  mostrarItensDaReceita();
  $('dlgEscolherMeds').close();
});

$('btnCancelarSelecaoMeds').addEventListener('click', () => {
  medicamentosSelecionados.clear();
  $('dlgEscolherMeds').close();
});

$('btnAddAvulso').addEventListener('click', () => {
  itensTemporarios.push({
    nome: '',
    dosagem: '',
    unidadeDosagem: 'mg',
    total: 0
  });

  mostrarItensDaReceita();
});

$('btnNovaReceita').addEventListener('click', () => abrirReceita());
$('btnImprimirReceitas').addEventListener('click', () => {
  const tabela = $('listaReceitas').closest('table');
  const totalReceitas = $('listaReceitas').children.length;

  if (totalReceitas === 0) {
    mostrarAviso('Atenção', 'Não há receitas pendentes para imprimir.');
    return;
  }

  const janela = window.open('', '_blank');

  if (!janela) {
    mostrarAviso(
      'Atenção',
      'O navegador bloqueou a janela de impressão. Permita a abertura de janelas para este site e tente novamente.'
    );
    return;
  }

  const tabelaParaImprimir = tabela.cloneNode(true);

  tabelaParaImprimir.querySelectorAll('button').forEach(botao => {
    botao.replaceWith(document.createTextNode(botao.textContent.trim()));
  });

  // Remove "Entregue em" e "Status" apenas da tabela impressa.
  tabelaParaImprimir.querySelectorAll('tr').forEach(linha => {
    linha.cells[6]?.remove();
    linha.cells[4]?.remove();
  });

  const dataImpressao = new Date().toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });

  const textoTotal = totalReceitas === 1
    ? '1 receita pendente'
    : `${totalReceitas} receitas pendentes`;

  janela.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Receitas pendentes</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #000;
            margin: 24px;
          }

          h1 {
            font-size: 20px;
            margin-bottom: 6px;
          }

          .informacoes {
            margin: 0 0 16px;
            font-size: 12px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th, td {
            border: 1px solid #777;
            padding: 8px;
            text-align: left;
            vertical-align: top;
          }

          th {
            background: #eee;
          }

          tr.atrasada td {
            background: #fff0d6;
          }

          .alerta-dias {
            display: inline-block;
            margin-top: 4px;
            padding: 3px 5px;
            border: 1px solid #a45b00;
            color: #7a4200;
            font-weight: bold;
          }

          @media print {
            body {
              margin: 10mm;
            }

            thead {
              display: table-header-group;
            }

            tr {
              break-inside: avoid;
            }

            tr.atrasada td {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <h1>Receitas aguardando entrega</h1>
        <p class="informacoes">
          ${textoTotal} — Impresso em ${dataImpressao}
        </p>
        ${tabelaParaImprimir.outerHTML}
      </body>
    </html>
  `);

  janela.document.close();
  janela.addEventListener('load', () => {
    janela.focus();
    janela.print();
  });
});

$('btnCancelarReceita').addEventListener('click', () => {
  $('dlgReceita').close();
});

// ===== VALIDAÇÃO DOS CAMPOS DA RECEITA =====
const SOMENTE_LETRAS = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ '.\-]*$/;
const SOMENTE_NUMEROS = /^\d+$/;
const DOSAGEM_VALIDA = /^\d+([.,]\d+)?$/;

$('rPaciente').addEventListener('input', () => {
  $('rPaciente').value =
    $('rPaciente').value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ '.\-]/g, '');
});

// ===== IDENTIFICAÇÃO: CADASTRO OU NASCIMENTO =====
function formatarNascimento(texto) {
  const numeros = String(texto).replace(/\D/g, '').slice(0, 8);
  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 4) return `${numeros.slice(0, 2)}/${numeros.slice(2)}`;
  return `${numeros.slice(0, 2)}/${numeros.slice(2, 4)}/${numeros.slice(4)}`;
}

function nascimentoValido(texto) {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!partes) return false;

  const dia = Number(partes[1]);
  const mes = Number(partes[2]);
  const ano = Number(partes[3]);

  const data = new Date(ano, mes - 1, dia);
  const existe =
    data.getFullYear() === ano &&
    data.getMonth() === mes - 1 &&
    data.getDate() === dia;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let idade = hoje.getFullYear() - ano;
  const aindaNaoFezAniversario =
    hoje.getMonth() < mes - 1 ||
    (hoje.getMonth() === mes - 1 && hoje.getDate() < dia);

  if (aindaNaoFezAniversario) {
    idade--;
  }

  return existe && ano >= 1900 && data <= hoje && idade <= 100;
}

function aplicarTipoCadastro(limparCampo = true) {
  const ehNascimento = $('rTipoCadastro').value === 'nascimento';
  const formulario = $('formReceita');

  // As cores do CSS dependem destas classes no formulário
  formulario.classList.toggle('tipo-nascimento', ehNascimento);
  formulario.classList.toggle('tipo-cadastro', !ehNascimento);

  $('btnCalendarioNasc').hidden = !ehNascimento;
  $('rotuloCadastro').textContent = ehNascimento
    ? 'Data de nascimento (DD/MM/AAAA) *'
    : 'Nº do cadastro (somente números) *';
  $('rCadastro').placeholder = ehNascimento
    ? 'DD/MM/AAAA'
    : 'Digite o número do cadastro';
  $('rCadastro').maxLength = ehNascimento ? 10 : 30;

  if (limparCampo) $('rCadastro').value = '';
}

$('rTipoCadastro').addEventListener('change', () => aplicarTipoCadastro(true));

// Ao digitar: cadastro = só números; nascimento = formata com barras
$('rCadastro').addEventListener('input', () => {
  if ($('rTipoCadastro').value === 'nascimento') {
    $('rCadastro').value = formatarNascimento($('rCadastro').value);
  } else {
    $('rCadastro').value = $('rCadastro').value.replace(/\D/g, '');
  }
});

$('btnCalendarioNasc').addEventListener('click', () => {
  const calendario = $('rCalendarioNasc');
  try {
    if (typeof calendario.showPicker === 'function') {
      calendario.showPicker();
    } else {
      calendario.click();
    }
  } catch (erro) {
    calendario.click();
  }
});

$('rCalendarioNasc').addEventListener('change', () => {
  const valor = $('rCalendarioNasc').value; // formato AAAA-MM-DD
  if (!valor) return;

  const [ano, mes, dia] = valor.split('-');
  $('rCadastro').value = `${dia}/${mes}/${ano}`;
  $('rCalendarioNasc').value = '';
});

// Estado inicial das cores e do campo
aplicarTipoCadastro(true);

function avisarCampo(mensagem, campo) {
  mostrarAviso('Atenção', mensagem, () => {
    if (campo) campo.focus();
  });
  return false;
}

function validarReceita() {
  const paciente = $('rPaciente').value.trim();
  const cadastro = $('rCadastro').value.trim();
  const dataRetida = $('rDataRetida').value;
  const dataEntrega = $('rDataEntrega').value;
  const ehNascimento = $('rTipoCadastro').value === 'nascimento';

  if (!paciente) {
    return avisarCampo('Informe o nome do paciente.', $('rPaciente'));
  }

  if (!SOMENTE_LETRAS.test(paciente)) {
    return avisarCampo(
      'O nome do paciente deve conter apenas letras.',
      $('rPaciente')
    );
  }

  if (!cadastro) {
    return avisarCampo(
      ehNascimento
        ? 'Informe a data de nascimento.'
        : 'Informe o número do cadastro (somente números).',
      $('rCadastro')
    );
  }

  if (ehNascimento) {
    if (!nascimentoValido(cadastro)) {
      return avisarCampo(
        'A data de nascimento é inválida. Use o formato DD/MM/AAAA ou escolha no calendário.',
        $('rCadastro')
      );
    }
  } else if (!SOMENTE_NUMEROS.test(cadastro)) {
    return avisarCampo(
      'O número do cadastro deve conter apenas números.',
      $('rCadastro')
    );
  }

  if (!dataRetida) {
    return avisarCampo(
      'Informe a data da receita retida.',
      $('rDataRetida')
    );
  }

  if (dataRetida > dataDeHoje()) {
    return avisarCampo(
      'A data da receita retida não pode ser futura.',
      $('rDataRetida')
    );
  }

  if (dataEntrega && dataEntrega > dataDeHoje()) {
    return avisarCampo(
      'A data da receita entregue não pode ser futura.',
      $('rDataEntrega')
    );
  }

  if (dataEntrega && dataEntrega < dataRetida) {
    return avisarCampo(
      'A data da receita entregue não pode ser anterior à data da receita retida.',
      $('rDataEntrega')
    );
  }

  const itensValidos = itensTemporarios.filter(
    item => String(item.nome || '').trim() !== ''
  );

  if (itensValidos.length === 0) {
    return avisarCampo(
      'Inclua pelo menos um medicamento na receita, com o nome preenchido.',
      $('btnAddMed')
    );
  }

  for (const item of itensValidos) {
    const nome = String(item.nome).trim();

    if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(nome)) {
      return avisarCampo(
        `O nome do medicamento "${nome}" deve conter letras. Não pode ser apenas números.`,
        null
      );
    }

    const dosagem = String(item.dosagem || '').trim();

    if (dosagem && !DOSAGEM_VALIDA.test(dosagem)) {
      return avisarCampo(
        `A dosagem de "${nome}" deve conter apenas números. Exemplo: 10 ou 0,5.`,
        null
      );
    }
  }

  return true;
}

$('formReceita').addEventListener('submit', evento => {
  evento.preventDefault();

  if (!usuarioAtual) return;
  if (!validarReceita()) return;

  const itens = itensTemporarios
    .filter(item => String(item.nome || '').trim() !== '')
    .map(item => {
      const dosagem = String(item.dosagem || '').trim();
      return {
        nome: String(item.nome).trim(),
        dosagem,
        unidadeDosagem: dosagem ? (item.unidadeDosagem || 'mg') : '',
        total: totalDoItem(item)
      };
    });

  const dadosReceita = {
    paciente: $('rPaciente').value.trim(),
    tipoCadastro: $('rTipoCadastro').value,
    cadastro: $('rCadastro').value.trim(),
    dataRetida: $('rDataRetida').value,
    dataRetirar: $('rDataRetirar').value,
    dataEntrega: $('rDataEntrega').value,
    itens,
    obs: $('rObs').value.trim()
  };

  const agora = new Date().toISOString();
  const id = $('formReceita').dataset.id;

  if (id) {
    const origem = $('formReceita').dataset.origem || 'receitas';
    const listaFonte = origem === 'excluidos' ? db.excluidos : db.receitas;
    const receita = listaFonte.find(item => item.id === id);

    if (receita) {
      const tinhaEntrega = Boolean(receita.dataEntrega);

      // "Retida por" nunca muda: quem cadastrou continua sendo o mesmo
      Object.assign(receita, dadosReceita);

      if (!dadosReceita.dataEntrega) {
        receita.entreguePor = '';
      } else if (!tinhaEntrega) {
        receita.entreguePor = usuarioAtual;
      }

      receita.alteradaPor = usuarioAtual;
      receita.alteradaEm = agora;
    }
  } else {
    db.receitas.push({
      id: novoId(),
      ...dadosReceita,
      retidaPor: usuarioAtual,
      entreguePor: dadosReceita.dataEntrega ? usuarioAtual : '',
      criadaEm: agora,
      alteradaPor: '',
      alteradaEm: ''
    });
  }

  $('dlgReceita').close();
  salvarDados();
});

// Excluir receita: vai para a aba Excluídos, com o nome de quem excluiu
$('btnExcluirReceita').addEventListener('click', async () => {
  const id = $('formReceita').dataset.id;
  const origem = $('formReceita').dataset.origem || 'receitas';
  if (!id || !usuarioAtual) return;

  if (origem === 'excluidos') {
    if (!ehAdministrador()) return;
    const receitaExcluida = db.excluidos.find(item => item.id === id);
    if (!receitaExcluida) return;
    const confirmou = await mostrarConfirmacao(
      'Excluir registro definitivamente?',
      `O registro de ${receitaExcluida.paciente || 'paciente'} será removido permanentemente deste navegador.`,
      'Excluir definitivamente'
    );
    if (!confirmou) return;
    db.excluidos = db.excluidos.filter(item => item.id !== id);
    $('dlgReceita').close();
    salvarDados();
    return;
  }

  const receita = db.receitas.find(item => item.id === id);
  if (!receita) return;
  const confirmou = await mostrarConfirmacao(
    'Excluir receita?',
    'A receita será movida para a aba “Excluídos”.',
    'Mover para Excluídos'
  );
  if (!confirmou) return;

  db.excluidos.push({
    ...receita,
    excluidaPor: usuarioAtual,
    excluidaEm: new Date().toISOString()
  });

  db.receitas = db.receitas.filter(item => item.id !== id);
  $('dlgReceita').close();
  salvarDados();
});

// ===== MEDICAMENTOS =====
function abrirMedicamento(id = '') {
  const medicamento = db.medicamentos.find(item => item.id === id);
  const dados = medicamento ? normalizarDosagem({ ...medicamento }) : null;

  $('formMed').dataset.id = medicamento ? medicamento.id : '';
  $('tituloMed').textContent =
    medicamento ? 'Editar medicamento' : 'Novo medicamento';

  $('mNome').value = dados ? dados.nome : '';
  $('mDosagem').value = dados ? dados.dosagem || '' : '';
  preencherUnidadesMed(dados ? dados.unidadeDosagem || 'mg' : 'mg');
  $('mTotal').value = dados ? totalDoItem(dados) : 0;

  $('dlgMed').showModal();
}

$('btnNovoMed').addEventListener('click', () => abrirMedicamento());

$('btnCancelarMed').addEventListener('click', () => {
  $('dlgMed').close();
});

// Botão “Adicionar tipo” usa a tela interna do diálogo, inclusive no celular.
$('btnNovaUnidade').addEventListener('click', () => {
  $('telaDadosMed').hidden = true;
  $('telaNovaUnidade').hidden = false;
  $('mNovaUnidade').value = '';
  $('mNovaUnidade').focus();
});

$('btnSalvarNovaUnidade').addEventListener('click', () => {
  const nova = salvarTipoDosagem($('mNovaUnidade').value);
  if (!nova) return;
  preencherUnidadesMed(nova);
  $('telaNovaUnidade').hidden = true;
  $('telaDadosMed').hidden = false;
});

$('btnVoltarNovaUnidade').addEventListener('click', () => {
  $('telaNovaUnidade').hidden = true;
  $('telaDadosMed').hidden = false;
  $('btnUnidadeDosagem').focus();
});

$('novoMedReceitaDosagem').addEventListener('input', () => {
  $('novoMedReceitaDosagem').value =
    $('novoMedReceitaDosagem').value.replace(/[^0-9.,]/g, '');
});

$('formMed').addEventListener('submit', evento => {
  evento.preventDefault();

  const dadosMedicamento = {
    nome: $('mNome').value.trim(),
    dosagem: $('mDosagem').value.trim(),
    unidadeDosagem: $('mUnidadeDosagem').value,
    total: numero($('mTotal').value)
  };

  if (!dadosMedicamento.nome) {
    mostrarAviso('Atenção', 'Informe o nome do medicamento.', () => $('mNome').focus());
    return;
  }

  // O nome precisa ter pelo menos uma letra (não pode ser só números)
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(dadosMedicamento.nome)) {
    mostrarAviso('Atenção', 'O nome do medicamento deve conter letras. Não pode ser apenas números.', () => $('mNome').focus());
    return;
  }

  // A dosagem, se preenchida, precisa ser um número válido
  if (dadosMedicamento.dosagem && !DOSAGEM_VALIDA.test(dadosMedicamento.dosagem)) {
    mostrarAviso('Atenção', 'A dosagem deve conter apenas números. Exemplo: 10 ou 0,5.', () => $('mDosagem').focus());
    return;
  }

  const id = $('formMed').dataset.id;

  if (id) {
    const medicamento = db.medicamentos.find(item => item.id === id);
    if (medicamento) Object.assign(medicamento, dadosMedicamento);
  } else {
    db.medicamentos.push({
      id: novoId(),
      ...dadosMedicamento
    });
  }

  $('dlgMed').close();
  salvarDados();
});

async function excluirMedicamento(id) {
  const medicamento = db.medicamentos.find(item => item.id === id);
  if (!medicamento) return;
  const confirmou = await mostrarConfirmacao(
    'Excluir medicamento?',
    `“${medicamento.nome}” será removido do catálogo.`,
    'Excluir'
  );
  if (!confirmou) return;
  db.medicamentos = db.medicamentos.filter(item => item.id !== id);
  salvarDados();
}

// ===== MEUS DADOS (SÓ O PRÓPRIO USUÁRIO EDITA) =====
function abrirPessoa(id) {
  // Proteção: ninguém edita os dados de outra pessoa
  if (!usuarioAtual || id !== usuarioAtual) {
    mostrarAviso('Atenção', 'Você só pode alterar os seus próprios dados.');
    return;
  }

  const pessoa = db.usuarios.find(item => item.id === id);
  if (!pessoa) return;

  $('tituloPessoa').textContent = 'Meus dados';
  $('pNome').value = pessoa.nome;
  $('pSenha').value = '';

  $('dlgPessoa').showModal();
}

$('btnCancelarPessoa').addEventListener('click', () => {
  $('dlgPessoa').close();
});

$('formPessoa').addEventListener('submit', async evento => {
  evento.preventDefault();

  const pessoa = db.usuarios.find(item => item.id === usuarioAtual);
  if (!pessoa) return;

  const nome = $('pNome').value.trim();
  const senha = $('pSenha').value;

  if (!nome) {
    mostrarAviso('Atenção', 'Informe o seu nome.', () => $('pNome').focus());
    return;
  }

  if (nomeJaExiste(nome, pessoa.id)) {
    mostrarAviso('Atenção', 'Já existe outro usuário com esse nome.', () => $('pNome').focus());
    return;
  }

  if (senha && !SENHA_4_NUMEROS.test(senha)) {
    mostrarAviso('Atenção', 'A nova senha deve ter exatamente 4 números.', () => $('pSenha').focus());
    return;
  }

  pessoa.nome = nome;

  if (senha) {
    pessoa.senhaHash = await criarHashSenha(pessoa.id, senha);
  }

  $('usuarioAtual').textContent = `Usuário: ${pessoa.nome}`;
  $('dlgPessoa').close();
  salvarDados();
});

// ===== SALVAR E IMPORTAR BACKUP =====
$('btnExportar').addEventListener('click', () => {
  const arquivo = new Blob([textoDosDados()], {
    type: 'application/json'
  });

  const link = document.createElement('a');
  const endereco = URL.createObjectURL(arquivo);

  link.href = endereco;
  link.download = `backup-receitas-${dataDeHoje()}.json`;
  link.click();

  localStorage.setItem(CHAVE_ULTIMO_BACKUP, dataDeHoje());

  setTimeout(() => URL.revokeObjectURL(endereco), 1000);
});

$('inputImportar').addEventListener('change', evento => {
  const arquivo = evento.target.files[0];
  if (!arquivo) return;

  arquivo.text().then(async conteudo => {
    try {
      const dados = ajustarBanco(JSON.parse(conteudo));

      if (!await mostrarConfirmacao('Importar backup?', 'Este backup substituirá os dados atuais. Continuar?', 'Importar')) {
        evento.target.value = '';
        return;
      }

      db = dados;
      salvarDados();
      mostrarAviso('Backup importado', 'Backup importado com sucesso.');
    } catch (erro) {
      mostrarAviso(
        'Erro ao importar',
        'Não foi possível importar. Escolha um backup JSON válido do aplicativo.'
      );
    }

    evento.target.value = '';
  });
});

// ===== INICIAR O APLICATIVO =====
function iniciarAplicativo() {
  // A tela de login aparece sempre, antes de qualquer outra coisa
  mostrarLogin();
  atualizarTelas();
  verificarLembreteBackup();
}

iniciarAplicativo();

$('rDataRetida').addEventListener('input', () => {
  const dataBase = $('rDataRetida').value;

  if (!dataBase) {
    $('rDataRetirar').value = '';
    return;
  }

  const [ano, mes, dia] = dataBase.split('-').map(Number);
  const dataRetirada = new Date(ano, mes - 1, dia);
  dataRetirada.setDate(dataRetirada.getDate() + 15);

  const anoRetirada = dataRetirada.getFullYear();
  const mesRetirada = String(dataRetirada.getMonth() + 1).padStart(2, '0');
  const diaRetirada = String(dataRetirada.getDate()).padStart(2, '0');

  $('rDataRetirar').value = `${anoRetirada}-${mesRetirada}-${diaRetirada}`;
});