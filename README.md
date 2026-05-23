<div align="center">

# 🎙 Painel de Transcrição (WhisperX)

**Dashboard local para gerar legendas precisas em qualquer idioma, com timestamps por palavra.**

[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![WhisperX](https://img.shields.io/badge/WhisperX-3.8%2B-FF6F00)](https://github.com/m-bain/whisperX)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contribuindo)

```
   Áudio  +  (texto opcional)   →   Legenda perfeitamente sincronizada
```

[Funcionalidades](#-funcionalidades) • [Instalação](#-instalação-rápida) • [Uso](#-como-rodar) • [API](#-api-http) • [Contribuir](#-contribuindo)

</div>

---

## 🎯 Por que esse projeto existe

Ferramentas de auto-legenda como CapCut, YouTube e Submagic funcionam bem em **inglês**, mas falham com idiomas menores como **croata, sérvio, esloveno, polonês, etc.** — pronúncia errada de nomes próprios, palavras inventadas, sincronização ruim.

Esse painel resolve isso usando o **WhisperX** (modelo Whisper da OpenAI + alinhamento forçado wav2vec2), com uma interface bonita, editor visual e zero complicação de instalar.

### Comparação honesta

| | Este projeto | CapCut auto | YouTube auto |
|---|---|---|---|
| Precisão em croata | ~95% | ~60-70% | ~70% |
| Modo "alinhar texto exato" (TTS) | ✅ Sim | ❌ Não | ❌ Não |
| Timestamps por palavra | ✅ Sim | ⚠️ Aproximados | ❌ Por linha |
| Roda 100% local | ✅ Sim | ❌ Nuvem | ❌ Nuvem |
| Custo | 🆓 Grátis | 🆓 Grátis com limites | 🆓 Grátis |
| API HTTP | ✅ Sim | ❌ Não | ❌ Não |

---

## ✨ Funcionalidades

### 🎤 Transcrição de alta qualidade
- **78 idiomas suportados** (Whisper) com **40 idiomas** com alinhamento por palavra
- **Modo "Transcrever"** — converte áudio em texto + timestamps
- **Modo "Alinhar"** — você sobe áudio + roteiro exato e recebe sincronização perfeita (ideal para TTS)
- Suporta MP3, WAV, M4A, FLAC, OGG, OPUS

### 🎨 Dashboard moderno
- Tema dark profissional
- Modal de seleção de idioma com busca e favoritos
- Drag & drop de áudio e arquivos de texto
- Detecção automática de CPU/GPU (CUDA NVIDIA)
- Status do ambiente em tempo real (Python, WhisperX, FFmpeg)

### ✏️ Editor visual de legendas
- **Player de áudio customizado** com waveform, velocidade (0.5x-2x), loop e atalhos
- Edição inline de texto e timestamps
- Dividir, juntar e apagar segmentos
- **Reagrupamento inteligente** com presets prontos (Netflix 42×2, TikTok 25×1)
- **Pós-processamento de texto**: capitalização, pontuação, remoção de disfluências

### 📤 Exportação
- SRT (legendas padrão)
- VTT (web)
- TXT (texto puro)
- JSON (timestamps por palavra com scores)

### 🛠️ Pra desenvolvedores
- **API HTTP completa** — todas as funcionalidades automatizáveis
- SQLite local (zero configuração)
- PM2 pronto pra produção
- Pronto pra VPS Linux com Nginx

---

## 📋 Pré-requisitos

| Software | Versão | Verificar |
|---|---|---|
| Node.js | 18+ | `node -v` |
| Python | 3.10 ou 3.11 | `python --version` |
| FFmpeg | recente | `ffmpeg -version` |

<details>
<summary><b>Como instalar (Windows / Linux / macOS)</b></summary>

**Windows:**
```powershell
# Node.js: https://nodejs.org (LTS)
# Python: https://www.python.org/downloads/ (marcar "Add Python to PATH")
winget install ffmpeg
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install -y nodejs npm python3 python3-pip python3-venv ffmpeg
```

**macOS (Homebrew):**
```bash
brew install node python@3.11 ffmpeg
```

</details>

---

## 🚀 Instalação rápida

```bash
# Clone o repositório
git clone https://github.com/meupost/whisperx-painel.git
cd transcricao

# Instale dependências do Node
npm install

# Setup automático: detecta Python, instala WhisperX e PyTorch
npm run setup
```

> O setup baixa cerca de 1 GB (PyTorch + WhisperX + dependências). Demora alguns minutos na primeira vez.

---

## ⚙️ Como rodar

```bash
# Modo simples (foreground)
npm start

# Modo desenvolvimento (auto-restart ao salvar)
npm run dev

# Via PM2 (recomendado, mantém rodando em segundo plano)
npm run pm2:start
npm run pm2:logs       # ver logs em tempo real
npm run pm2:restart    # reiniciar
npm run pm2:stop       # parar
```

Abra: **http://localhost:9000**

---

## 🎬 Como usar

### Modo "Transcrever"
1. Arraste o áudio na área de upload
2. Selecione o idioma (ou deixe em "Detectar automaticamente")
3. Clique em **Iniciar transcrição**
4. Aguarde processar (~5-15 min em CPU para 10 min de áudio)
5. Clique em **Editor** para revisar e exportar

### Modo "Alinhar" (recomendado para TTS)
1. Mesmo processo, mas escolhe modo **Alinhar**
2. Cole ou faça upload do roteiro exato no campo de texto de referência
3. Resultado: timestamps com precisão fonema-por-fonema

---

## 🎹 Editor de legendas

| Atalho | Ação |
|---|---|
| `Espaço` | Play / Pause |
| `←` / `→` | Pular 5s para trás/frente |
| `M` | Mudo / Desmudo |
| `L` | Loop do segmento ativo |
| `Ctrl+S` | Salvar |
| `ESC` | Fechar |

Recursos do editor:
- Player customizado com velocidade variável (0.5x-2x), loop, skip ±5s
- Edição inline de texto e timestamps de cada segmento
- Dividir, juntar e apagar segmentos
- Reagrupamento inteligente com presets (Netflix 42×2, TikTok 25×1)
- Pós-processamento (capitalização, pontuação, disfluências)

---

## 🌐 API HTTP

Todas as rotas retornam JSON. Use para automatizar pipelines.

```http
GET    /api/health                          # status do ambiente
GET    /api/jobs                            # lista todos os jobs
GET    /api/jobs/:id                        # detalhes (com segmentos)
POST   /api/jobs                            # criar job (multipart com "audio")
DELETE /api/jobs/:id                        # apagar

GET    /api/jobs/:id/audio                  # streaming do áudio (Range)
PUT    /api/jobs/:id/segments               # salvar edições manuais
POST   /api/jobs/:id/regroup                # aplicar reagrupamento
POST   /api/jobs/:id/postprocess            # aplicar pós-processamento

GET    /api/jobs/:id/download/srt
GET    /api/jobs/:id/download/vtt
GET    /api/jobs/:id/download/txt
GET    /api/jobs/:id/download/json
```

<details>
<summary><b>Exemplo: criar job via curl</b></summary>

```bash
curl -X POST http://localhost:9000/api/jobs \
  -F "audio=@meu-audio.mp3" \
  -F "title=Episódio 01" \
  -F "mode=transcribe" \
  -F "language=pt" \
  -F "device=cpu" \
  -F "model_size=small"
```

</details>

---

## 🎮 CPU vs GPU

| | CPU | GPU (CUDA) |
|---|---|---|
| Hardware | Qualquer PC | NVIDIA com drivers CUDA |
| Velocidade (10min de áudio) | 5-15 min | 30s-1min |
| Modelo recomendado | `small` | `large-v3` |
| `compute_type` | `int8` | `float16` |

> **GPU AMD não funciona.** WhisperX/PyTorch CUDA é exclusivo da NVIDIA. ROCm da AMD só funciona em Linux com setup complicado e não é suportado oficialmente.

A interface detecta automaticamente se há GPU NVIDIA e desabilita o botão GPU caso contrário.

<details>
<summary><b>Como instalar suporte GPU (NVIDIA)</b></summary>

```bash
# 1. Instale drivers NVIDIA + CUDA Toolkit
#    https://developer.nvidia.com/cuda-downloads

# 2. Reinstale o PyTorch com suporte CUDA
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
```

</details>

---

## 🌍 Idiomas suportados

**78 idiomas no total**, com **40 deles tendo alinhamento por palavra**:

✅ **Com alinhamento** (timestamp por palavra):
ar, ca, cs, da, de, el, en, es, eu, fa, fi, fr, gl, he, hi, **hr (Croata)**, hu, it, ja, ka, ko, lv, ml, nl, nn, no, pl, **pt (Português)**, ro, ru, sk, sl, sv, te, tl, tr, uk, ur, vi, zh

⚠️ **Apenas timestamp por linha**: af, am, az, be, bg, bn, bs, cy, et, ga, ha, hy, id, is, kk, km, la, lt, mi, mk, mr, ms, mt, my, ne, pa, sq, sr, sw, ta, th, yo (Whisper transcreve, mas wav2vec2 não tem modelo público)

O modal de seleção tem busca tolerante a acentos e suporte a favoritos persistentes.

---

## 🐛 Solução de problemas

<details>
<summary><b>"WhisperX não está instalado"</b></summary>

O `PYTHON_BIN` no `.env` aponta para um Python sem WhisperX. Rode `npm run setup` para auto-detectar e instalar, ou ajuste manualmente:
```env
PYTHON_BIN=C:/laragon/bin/python/python-3.10/python.exe
```

</details>

<details>
<summary><b>Erro 9009 (Windows): "Python não foi encontrado"</b></summary>

O Windows está chamando o alias da Microsoft Store. Configure `PYTHON_BIN` no `.env` para o caminho absoluto do Python real.

</details>

<details>
<summary><b>"ffmpeg not found"</b></summary>

Instale o FFmpeg e adicione ao PATH. No Windows, reinicie o terminal/IDE depois.

</details>

<details>
<summary><b>Erro CUDA: "driver version is insufficient"</b></summary>

Driver NVIDIA desatualizado ou ausente. Atualize ou volte para CPU. A interface já detecta isso e desabilita GPU.

</details>

<details>
<summary><b>"Requested float16 compute type, but the target device does not support"</b></summary>

CPU não suporta `float16`. Use `int8`. A interface corrige isso automaticamente; só acontece se forçar via API.

</details>

<details>
<summary><b>Modelo de alinhamento não disponível para o idioma</b></summary>

Seu idioma está nos 38 que não têm alinhamento por palavra. Você ainda recebe a transcrição com timestamp por linha. Veja a [seção Idiomas](#-idiomas-suportados).

</details>

---

## 🌐 Subindo em VPS Linux

<details>
<summary><b>Setup completo passo a passo + Nginx + HTTPS</b></summary>

```bash
# 1. Instale dependências do sistema
sudo apt update
sudo apt install -y nodejs npm python3 python3-pip python3-venv ffmpeg

# 2. Clone o projeto
cd /var/www
git clone https://github.com/meupost/whisperx-painel.git
cd transcricao

# 3. Setup automático
npm install
npm run setup

# 4. Suba via PM2
sudo npm install -g pm2
npm run pm2:start
pm2 startup
pm2 save
```

**Nginx como proxy reverso (HTTPS):**

```nginx
server {
    listen 80;
    server_name seu-dominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seu-dominio.com;

    ssl_certificate     /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 600s;
    }
}
```

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com
```

</details>

---

## 🗺️ Roadmap

### Próximos passos
- [ ] Tradução automática do SRT para outros idiomas
- [ ] Export ASS (legenda avançada com cor, posição, animação)
- [ ] Export FCPXML (Final Cut) e EDL/XML (Premiere)
- [ ] Batch processing (subir múltiplos áudios e baixar zip)
- [ ] Comparação lado a lado entre duas execuções
- [ ] Indicação visual no modal de idiomas: quais têm alinhamento por palavra (40 idiomas) vs apenas por linha

### Fora do escopo (por escolha)
- Editor de vídeo (use CapCut/DaVinci Resolve)
- Diarização (separação de múltiplos falantes) — não faz sentido para narração single-speaker
- Geração de vídeo final (este sistema é especializado em legendas)

---

## 🤝 Contribuindo

Contribuições são muito bem-vindas! Veja o guia em **[CONTRIBUTING.md](CONTRIBUTING.md)**.

- 🐛 [Abrir uma issue](https://github.com/meupost/whisperx-painel/issues/new) para bugs ou ideias
- 🔧 Mandar um PR com correção ou feature nova
- 💬 Compartilhar feedback de uso real (especialmente com idiomas menores)
- ⭐ Dar uma star se o projeto te ajudou

---

## ☕ Apoie o projeto

Se essa ferramenta te ajudou de alguma forma, considere mandar um café via PIX. Cada contribuição me motiva a continuar mantendo e melhorando o projeto.

<div align="center">

**🇧🇷 PIX (chave de e-mail):**

```
meupost@hotmail.com
```

**Sugestões de valor:**

| ☕ Café | 🥪 Almoço | 🍕 Pizza | 🚀 Sponsor |
|:---:|:---:|:---:|:---:|
| R$ 5 | R$ 25 | R$ 50 | R$ 100+ |

*Doações são opcionais. O projeto é gratuito e seguirá assim. Quem ajuda recebe meu agradecimento e fica registrado nos contribuidores ⭐.*

</div>

---

## 📜 Licença

[MIT](LICENSE) — uso pessoal e comercial liberado.

WhisperX tem licença BSD-2.

---

## 🙏 Agradecimentos

Construído sobre o ombro de gigantes:
- [WhisperX](https://github.com/m-bain/whisperX) — Max Bain (transcrição com alinhamento)
- [Whisper](https://github.com/openai/whisper) — OpenAI (modelo base)
- [wav2vec2](https://huggingface.co/facebook/wav2vec2-base-960h) — Meta AI (alinhamento)
- [PyTorch](https://pytorch.org), [Express](https://expressjs.com), [Tailwind](https://tailwindcss.com), [Alpine.js](https://alpinejs.dev)

---

<div align="center">

**Feito com ☕ e dedicação para a comunidade de criadores em idiomas menores.**

⭐ Se gostou, deixe uma estrela!

</div>
