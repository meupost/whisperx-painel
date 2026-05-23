# Como contribuir

Obrigado pelo interesse em contribuir! Esse projeto é feito por e para a comunidade. Toda contribuição é bem-vinda.

## 🐛 Reportando bugs

Antes de abrir uma issue, verifique se ela já não existe na [lista de issues](https://github.com/meupost/whisperx-painel/issues).

Ao reportar um bug, inclua:

- **Descrição clara** do que aconteceu vs o que era esperado
- **Passos para reproduzir** (idealmente passo a passo)
- **Idioma do áudio** e tipo de modelo usado
- **Sistema operacional** (Windows/Linux/macOS) + versões de Node, Python, FFmpeg
- **Logs do PM2** (`npm run pm2:logs`) ou da console
- **Screenshot** se for um problema visual

## 💡 Sugerindo features

Abra uma issue com a tag `enhancement` descrevendo:

- Qual problema a feature resolve
- Como você imagina que funcionaria (interface ou API)
- Por que isso seria útil para a comunidade (não só para seu caso)

Antes de abrir um PR grande, vale conversar primeiro na issue.

## 🔧 Enviando PRs

### Setup do ambiente

```bash
git clone https://github.com/meupost/whisperx-painel.git
cd transcricao
npm install
npm run setup
```

### Antes de mandar o PR

- [ ] O código segue o estilo do resto do projeto (sem ESLint formal, mas seja consistente)
- [ ] Funcionalidade nova tem documentação no README quando faz sentido
- [ ] Testou manualmente (não temos suite de testes ainda)
- [ ] Commits com mensagens claras (idealmente seguindo [Conventional Commits](https://www.conventionalcommits.org))
- [ ] PR com título descritivo + descrição do que muda e por quê

### Estilo de código

- **JavaScript:** vanilla ES2020+, sem TypeScript, sem build (Tailwind via CDN)
- **Python:** segue PEP 8
- **HTML:** Tailwind utilities, sem CSS-in-JS, evita Alpine logic muito complexa no template

### Áreas que precisam de ajuda

- 🌍 Testes em idiomas menores (sérvio, esloveno, etc.) — relate qualidade real
- 🎨 Melhorias de UX no editor (atalhos, undo/redo, etc.)
- 📤 Novos formatos de exportação (ASS, FCPXML, etc.)
- 📚 Tradução do README para outros idiomas
- 🐛 Correção de bugs reportados nas issues

## 🤝 Código de conduta

Seja respeitoso, prestativo e construtivo. Não tolere assédio, discriminação ou comportamento agressivo. Discordâncias técnicas são bem-vindas, ataques pessoais não.

## 📜 Licença

Ao contribuir você concorda que seu código será licenciado sob [MIT](LICENSE), igual ao restante do projeto.

## ☕ Apoio financeiro

Se quiser apoiar o projeto financeiramente, há informações no [README](README.md#-apoie-o-projeto). Não é exigido para contribuir.

---

Obrigado por fazer parte! 🚀
