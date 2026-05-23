function dashboard() {
  const STORAGE_KEY = 'transcricao_form_v1';
  const FAVORITES_KEY = 'transcricao_lang_favorites_v1';
  const NOTIFICATIONS_KEY = 'transcricao_notifications_v1';
  const NOTIFICATIONS_MAX = 50;

  const defaultForm = {
    title: '',
    mode: 'transcribe',
    language: 'hr',
    device: 'cpu',
    compute_type: 'int8',
    model_size: 'small',
    reference_text: '',
  };

  function loadSavedForm() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultForm };
      const parsed = JSON.parse(raw);
      // Sempre limpa título e texto de referência ao recarregar
      // (não fazem sentido persistir entre uploads diferentes)
      parsed.title = '';
      parsed.reference_text = '';
      return { ...defaultForm, ...parsed };
    } catch (_err) {
      return { ...defaultForm };
    }
  }

  function loadFavorites() {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      if (!raw) return ['pt', 'hr']; // padrão útil pro projeto
      return JSON.parse(raw);
    } catch (_e) {
      return ['pt', 'hr'];
    }
  }

  function loadNotifications() {
    try {
      const raw = localStorage.getItem(NOTIFICATIONS_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (_e) {
      return [];
    }
  }

  function saveNotifications(list) {
    try {
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list.slice(0, NOTIFICATIONS_MAX)));
    } catch (_e) {}
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Helper: remove acentos para busca tolerante
  function normalize(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  return {
    audioFile: null,
    dragover: false,
    submitting: false,
    submitError: '',
    showAdvanced: false,

    // Modo de entrada do texto de referência
    referenceTab: 'paste', // 'paste' | 'file'
    referenceFileName: '',
    textDragover: false,

    // Idiomas
    languages: window.LANGUAGES || [],
    favorites: loadFavorites(),
    languageSearch: '',
    langOpen: false,

    // Notificações persistentes (sininho)
    notifications: loadNotifications(),
    notificationsOpen: false,

    // Toasts efêmeros (canto inferior direito)
    toasts: [],

    form: loadSavedForm(),

    jobs: [],
    pollingTimer: null,

    health: {
      checked: false,
      ok: false,
      message: '',
    },

    preview: {
      open: false,
      loading: false,
      title: '',
      segments: [],
    },

    editor: {
      open: false,
      saving: false,
      applying: false,
      dirty: false,
      jobId: null,
      title: '',
      segments: [],
      activeIndex: -1,
      audioDuration: 0,
      showRegroup: false,
      showPostProcess: false,
      regroupOpts: {
        max_chars_per_line: 42,
        max_lines_per_segment: 2,
        max_duration_seconds: 7,
        min_duration_seconds: 1.0,
        break_on_punctuation: true,
        merge_short_segments: true,
        min_words_per_segment: 2,
      },
      postOpts: {
        capitalize_first_word: true,
        capitalize_after_period: true,
        fix_punctuation_spacing: true,
        collapse_spaces: true,
        remove_filler_words: false,
        add_period_at_end: false,
      },
    },

    player: {
      playing: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      muted: false,
      playbackRate: 1,
      loop: false,
      hoverTime: null,
      hoverPercent: 0,
    },

    init() {
      this.loadJobs();
      this.startPolling();
      this.checkHealth();
      // Auto-corrige compute_type inválido baseado no device
      this.fixComputeType();
      // Salva configurações sempre que mudam
      this.$watch('form', (val) => this.saveForm(val), { deep: true });
      // Quando o device muda, ajusta o compute_type automaticamente
      this.$watch('form.device', () => this.fixComputeType());
      // Atalho Ctrl+S para salvar no editor
      window.addEventListener('keydown', (e) => {
        if (!this.editor.open) return;

        // Não interfere se estiver digitando em input/textarea
        const tag = (e.target?.tagName || '').toLowerCase();
        const isTyping = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;

        // Ctrl+S sempre funciona, mesmo digitando
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          if (this.editor.dirty) this.saveEdits();
          return;
        }

        if (isTyping) return;

        // Espaço = play/pause
        if (e.code === 'Space') {
          e.preventDefault();
          this.togglePlay();
          return;
        }
        // Setas = skip
        if (e.code === 'ArrowLeft') {
          e.preventDefault();
          this.skipPlayer(-5);
          return;
        }
        if (e.code === 'ArrowRight') {
          e.preventDefault();
          this.skipPlayer(5);
          return;
        }
        // M = mute
        if (e.key.toLowerCase() === 'm') {
          e.preventDefault();
          this.toggleMute();
          return;
        }
        // L = loop
        if (e.key.toLowerCase() === 'l') {
          e.preventDefault();
          this.player.loop = !this.player.loop;
          return;
        }
      });
    },

    fixComputeType() {
      const cpuValid = ['int8', 'int8_float32', 'float32'];
      const cudaValid = ['float16', 'int8_float16', 'int8', 'float32'];
      if (this.form.device === 'cpu' && !cpuValid.includes(this.form.compute_type)) {
        this.form.compute_type = 'int8';
      } else if (this.form.device === 'cuda' && !cudaValid.includes(this.form.compute_type)) {
        this.form.compute_type = 'float16';
      }
    },

    saveForm(val) {
      try {
        const toSave = { ...val };
        // Não persiste título nem texto de referência (são por job)
        delete toSave.title;
        delete toSave.reference_text;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      } catch (_err) {
        // ignore storage cheio ou bloqueado
      }
    },

    resetForm() {
      this.form = { ...defaultForm };
      try { localStorage.removeItem(STORAGE_KEY); } catch (_e) {}
    },

    async checkHealth() {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        const wasOk = this.health?.ok;
        this.health = {
          checked: true,
          ok: data.ok && data.python_ok && data.whisperx_ok,
          message: data.message || '',
          python_ok: !!data.python_ok,
          whisperx_ok: !!data.whisperx_ok,
          ffmpeg_ok: !!data.ffmpeg_ok,
          cuda_available: !!data.cuda_available,
          python_version: data.python_version || '',
          whisperx_version: data.whisperx_version || '',
        };
        // Se o usuário tinha GPU salvo mas a máquina não suporta, força CPU
        if (this.form.device === 'cuda' && !this.health.cuda_available) {
          this.form.device = 'cpu';
          this.form.compute_type = 'int8';
        }

        // Notifica problemas no ambiente
        if (!this.health.ok) {
          const missing = [];
          if (!this.health.python_ok) missing.push('Python');
          if (!this.health.whisperx_ok) missing.push('WhisperX');
          if (!this.health.ffmpeg_ok) missing.push('FFmpeg');
          this.notify({
            key: 'health-warning',
            type: 'warning',
            title: 'Ambiente não está totalmente pronto',
            message: missing.length > 0
              ? `Faltando: ${missing.join(', ')}. Rode "npm run setup" no terminal para corrigir.`
              : (this.health.message || 'Verifique o terminal.'),
            action: { label: 'Verificar novamente', type: 'recheck_health' },
            duration: 8000,
          });
        } else if (wasOk === false) {
          // Era ruim, agora ficou OK
          this.notify({
            key: 'health-ok',
            type: 'success',
            title: 'Ambiente pronto',
            message: 'Python, WhisperX e FFmpeg estão funcionando.',
            duration: 4000,
          });
        }
      } catch (err) {
        this.health = { checked: true, ok: false, message: err.message, cuda_available: false };
        this.notify({
          key: 'health-error',
          type: 'error',
          title: 'Erro ao verificar ambiente',
          message: err.message,
          duration: 6000,
        });
      }
    },

    get stats() {
      const total = this.jobs.length;
      const done = this.jobs.filter((j) => j.status === 'done').length;
      const processing = this.jobs.filter((j) => j.status === 'processing' || j.status === 'pending').length;
      return { total, done, processing };
    },

    // === Dropdown de idiomas ===

    get selectedLanguageName() {
      const lang = this.languages.find((l) => l.code === this.form.language);
      return lang ? lang.name + (lang.subtitle ? ' (' + lang.subtitle + ')' : '') : this.form.language;
    },

    get favoriteLanguages() {
      return this.favorites
        .map((code) => this.languages.find((l) => l.code === code))
        .filter(Boolean);
    },

    languageMatchesSearch(lang) {
      const q = normalize(this.languageSearch);
      if (!q) return true;
      return (
        normalize(lang.code).includes(q) ||
        normalize(lang.name).includes(q) ||
        normalize(lang.subtitle || '').includes(q)
      );
    },

    get visibleLanguageGroups() {
      const groupOrder = ['Mais usados', 'Europeus', 'Asiáticos', 'Africanos', 'Outros'];
      const map = new Map();
      groupOrder.forEach((g) => map.set(g, []));

      const favSet = new Set(this.favorites);
      const isSearching = !!this.languageSearch.trim();

      this.languages.forEach((lang) => {
        // Se sem busca, mostra tudo (mas favoritos aparecem em outra seção acima)
        if (!isSearching && favSet.has(lang.code)) return;
        if (!this.languageMatchesSearch(lang)) return;
        const arr = map.get(lang.group) || [];
        arr.push(lang);
        map.set(lang.group, arr);
      });

      return groupOrder
        .map((label) => ({ label, items: map.get(label) || [] }))
        .filter((g) => g.items.length > 0);
    },

    selectLanguage(code) {
      this.form.language = code;
      this.langOpen = false;
      this.languageSearch = '';
    },

    openLanguageModal() {
      this.langOpen = true;
      this.languageSearch = '';
      this.$nextTick(() => {
        if (this.$refs.langSearch) this.$refs.langSearch.focus();
      });
    },

    closeLanguageModal() {
      this.langOpen = false;
      this.languageSearch = '';
    },

    toggleFavorite(code) {
      const idx = this.favorites.indexOf(code);
      if (idx >= 0) {
        this.favorites.splice(idx, 1);
      } else {
        this.favorites.push(code);
      }
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(this.favorites));
      } catch (_e) {}
    },

    // ====================================================
    //  NOTIFICAÇÕES (sininho) + TOASTS (flutuantes)
    // ====================================================

    get notificationsCount() {
      return this.notifications.filter((n) => !n.read).length;
    },

    get hasUnread() {
      return this.notificationsCount > 0;
    },

    /**
     * Adiciona uma notificação. Mostra um toast efêmero E guarda no histórico do sininho.
     *
     * notif = {
     *   id?: string,
     *   key?: string,         // se passar, evita duplicar a mesma notificação
     *   type: 'success' | 'warning' | 'error' | 'info',
     *   title: string,
     *   message?: string,
     *   action?: { label, type, payload },
     *   persistent?: boolean, // se true, vai pro sininho
     *   toast?: boolean,      // se true, mostra toast efêmero (default true)
     *   duration?: number,    // tempo do toast em ms (default 5000, 0 = não some)
     * }
     */
    notify(notif) {
      const opts = {
        type: 'info',
        toast: true,
        persistent: true,
        duration: 5000,
        ...notif,
      };

      const item = {
        id: opts.id || makeId(),
        key: opts.key || null,
        type: opts.type,
        title: opts.title,
        message: opts.message || '',
        action: opts.action || null,
        timestamp: Date.now(),
        read: false,
      };

      // Guarda no histórico (sininho)
      if (opts.persistent) {
        if (item.key) {
          // Remove duplicata anterior com mesma key
          this.notifications = this.notifications.filter((n) => n.key !== item.key);
        }
        this.notifications.unshift(item);
        if (this.notifications.length > NOTIFICATIONS_MAX) {
          this.notifications = this.notifications.slice(0, NOTIFICATIONS_MAX);
        }
        saveNotifications(this.notifications);
      }

      // Toast efêmero
      if (opts.toast) {
        this.toasts.push({ ...item });
        if (opts.duration > 0) {
          setTimeout(() => this.dismissToast(item.id), opts.duration);
        }
      }

      return item.id;
    },

    dismissToast(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },

    dismissNotification(id) {
      this.notifications = this.notifications.filter((n) => n.id !== id);
      saveNotifications(this.notifications);
    },

    markRead(id) {
      const n = this.notifications.find((x) => x.id === id);
      if (n) {
        n.read = true;
        saveNotifications(this.notifications);
      }
    },

    markAllRead() {
      this.notifications.forEach((n) => { n.read = true; });
      saveNotifications(this.notifications);
    },

    clearNotifications() {
      this.notifications = [];
      saveNotifications(this.notifications);
    },

    toggleNotifications() {
      this.notificationsOpen = !this.notificationsOpen;
      if (this.notificationsOpen) {
        // Marca tudo como lido ao abrir o painel (depois de 1s pra não sumir o badge na hora)
        setTimeout(() => {
          if (this.notificationsOpen) this.markAllRead();
        }, 1000);
      }
    },

    runNotificationAction(item) {
      if (!item.action) return;
      const { type, payload } = item.action;
      if (type === 'recheck_health') {
        this.checkHealth();
      } else if (type === 'open_url' && payload) {
        window.open(payload, '_blank');
      } else if (type === 'scroll_to' && payload) {
        const el = document.querySelector(payload);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    },

    formatRelativeTime(ts) {
      const diff = Date.now() - ts;
      const sec = Math.floor(diff / 1000);
      if (sec < 30) return 'agora mesmo';
      if (sec < 60) return `há ${sec}s`;
      const min = Math.floor(sec / 60);
      if (min < 60) return `há ${min}min`;
      const h = Math.floor(min / 60);
      if (h < 24) return `há ${h}h`;
      const d = Math.floor(h / 24);
      if (d < 7) return `há ${d}d`;
      const date = new Date(ts);
      return date.toLocaleDateString('pt-BR');
    },

    handleFile(file) {
      if (!file) return;
      this.audioFile = file;
      if (!this.form.title) {
        this.form.title = file.name.replace(/\.[^.]+$/, '');
      }
    },

    handleDrop(event) {
      this.dragover = false;
      const file = event.dataTransfer.files[0];
      if (file) this.handleFile(file);
    },

    // === Texto de referência via arquivo ===

    get referenceWordCount() {
      const t = (this.form.reference_text || '').trim();
      if (!t) return 0;
      return t.split(/\s+/).filter(Boolean).length;
    },

    handleTextDrop(event) {
      this.textDragover = false;
      const file = event.dataTransfer.files[0];
      if (file) this.handleTextFile(file);
    },

    async handleTextFile(file) {
      if (!file) return;

      const allowedExt = ['.txt', '.srt', '.md'];
      const lowerName = file.name.toLowerCase();
      const isAllowed = allowedExt.some((ext) => lowerName.endsWith(ext)) || file.type.startsWith('text/');
      if (!isAllowed) {
        alert('Formato não suportado. Use .txt, .srt ou .md');
        return;
      }

      // Limita tamanho (textos grandes não fazem sentido para alinhamento)
      const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
      if (file.size > MAX_SIZE) {
        alert('Arquivo muito grande (máximo 5 MB).');
        return;
      }

      try {
        const text = await this.readTextFile(file);
        this.form.reference_text = this.cleanReferenceText(text, lowerName.endsWith('.srt'));
        this.referenceFileName = file.name;
      } catch (err) {
        alert(`Erro ao ler arquivo: ${err.message}`);
      }
    },

    readTextFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
        // UTF-8 com fallback
        reader.readAsText(file, 'utf-8');
      });
    },

    /**
     * Limpa texto bruto vindo de .txt ou .srt
     * - Em .srt: remove números de sequência e timestamps, mantém só as falas
     * - Em .txt: normaliza linhas em branco e espaços
     */
    cleanReferenceText(raw, isSrt) {
      let txt = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      if (isSrt) {
        // Remove blocos de numeração e timestamps (00:00:00,000 --> 00:00:00,000)
        txt = txt
          .split(/\n\n+/)
          .map((block) => {
            const lines = block.split('\n');
            // Pula linhas que são número de sequência ou timestamp
            const content = lines.filter((line) => {
              const t = line.trim();
              if (!t) return false;
              if (/^\d+$/.test(t)) return false;
              if (/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(t)) return false;
              return true;
            });
            return content.join(' ').trim();
          })
          .filter(Boolean)
          .join('\n');
      }

      // Normaliza espaços em branco
      txt = txt
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n')
        .trim();

      return txt;
    },

    clearReferenceFile() {
      this.form.reference_text = '';
      this.referenceFileName = '';
      if (this.$refs.textFileInput) this.$refs.textFileInput.value = '';
    },

    async submitJob() {
      if (!this.audioFile) return;
      this.submitting = true;
      this.submitError = '';

      try {
        const fd = new FormData();
        fd.append('audio', this.audioFile);
        fd.append('title', this.form.title || this.audioFile.name);
        fd.append('mode', this.form.mode);
        fd.append('language', this.form.language);
        fd.append('device', this.form.device);
        fd.append('compute_type', this.form.compute_type);
        fd.append('model_size', this.form.model_size);
        if (this.form.mode === 'align') {
          fd.append('reference_text', this.form.reference_text || '');
        }

        const res = await fetch('/api/jobs', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao enviar');

        // limpa o formulário (mantém configs)
        this.audioFile = null;
        this.form.title = '';
        this.form.reference_text = '';
        this.referenceFileName = '';
        if (this.$refs.fileInput) this.$refs.fileInput.value = '';
        if (this.$refs.textFileInput) this.$refs.textFileInput.value = '';

        await this.loadJobs();
      } catch (err) {
        this.submitError = err.message;
      } finally {
        this.submitting = false;
      }
    },

    async loadJobs() {
      try {
        const res = await fetch('/api/jobs?limit=100');
        const data = await res.json();
        const previousJobs = this.jobs || [];
        const newJobs = data.rows || [];

        // Detecta jobs que mudaram para done/error desde o último load
        if (previousJobs.length > 0) {
          newJobs.forEach((nj) => {
            const prev = previousJobs.find((p) => p.id === nj.id);
            if (!prev) return;
            if (prev.status !== 'done' && nj.status === 'done') {
              this.notify({
                type: 'success',
                title: 'Transcrição concluída',
                message: nj.title,
                duration: 6000,
              });
            } else if (prev.status !== 'error' && nj.status === 'error') {
              this.notify({
                type: 'error',
                title: 'Erro na transcrição',
                message: `${nj.title}: ${nj.error_message || 'erro desconhecido'}`,
                duration: 0, // não some sozinha
              });
            }
          });
        }

        this.jobs = newJobs;
      } catch (err) {
        console.error('Falha ao carregar jobs:', err);
      }
    },

    startPolling() {
      if (this.pollingTimer) clearInterval(this.pollingTimer);
      this.pollingTimer = setInterval(() => {
        const hasActive = this.jobs.some(
          (j) => j.status === 'processing' || j.status === 'pending',
        );
        if (hasActive) this.loadJobs();
      }, 3000);
    },

    async deleteJob(id) {
      if (!confirm('Apagar esta transcrição? Esta ação não pode ser desfeita.')) return;
      try {
        const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Erro ao apagar');
        }
        await this.loadJobs();
      } catch (err) {
        alert(err.message);
      }
    },

    async openPreview(id) {
      this.preview.open = true;
      this.preview.loading = true;
      this.preview.segments = [];
      this.preview.title = '';
      try {
        const res = await fetch(`/api/jobs/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro');
        this.preview.title = data.title;
        this.preview.segments = data.result?.segments || [];
      } catch (err) {
        alert(err.message);
        this.preview.open = false;
      } finally {
        this.preview.loading = false;
      }
    },

    // ====================================================
    //  EDITOR DE LEGENDAS
    // ====================================================

    async openEditor(id) {
      this.editor = {
        ...this.editor,
        open: true,
        saving: false,
        applying: false,
        dirty: false,
        jobId: id,
        title: '',
        segments: [],
        activeIndex: -1,
        showRegroup: false,
        showPostProcess: false,
      };
      try {
        const res = await fetch(`/api/jobs/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro');
        this.editor.title = data.title;
        this.editor.segments = (data.result?.segments || []).map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          words: s.words || [],
        }));
      } catch (err) {
        alert(err.message);
        this.editor.open = false;
      }
    },

    closeEditor() {
      if (this.editor.dirty && !confirm('Há alterações não salvas. Fechar mesmo assim?')) return;
      if (this.$refs.audio) {
        this.$refs.audio.pause();
      }
      this.editor.open = false;
    },

    onAudioLoaded() {
      const audio = this.$refs.audio;
      if (!audio) return;
      this.player.duration = audio.duration || 0;
      this.player.volume = audio.volume;
      this.editor.audioDuration = audio.duration;
    },

    onAudioTimeUpdate() {
      const audio = this.$refs.audio;
      if (!audio) return;
      const t = audio.currentTime;
      this.player.currentTime = t;
      const idx = this.editor.segments.findIndex((s) => t >= s.start && t < s.end);
      if (idx !== -1 && this.editor.activeIndex !== idx) {
        this.editor.activeIndex = idx;
      }
      // Loop do segmento ativo
      if (this.player.loop && this.editor.activeIndex !== -1) {
        const seg = this.editor.segments[this.editor.activeIndex];
        if (seg && t >= seg.end - 0.05) {
          audio.currentTime = seg.start;
        }
      }
    },

    togglePlay() {
      const audio = this.$refs.audio;
      if (!audio) return;
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    },

    seekToPosition(event) {
      const audio = this.$refs.audio;
      if (!audio || !this.player.duration) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      audio.currentTime = pct * this.player.duration;
    },

    onSeekHover(event) {
      if (!this.player.duration) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      this.player.hoverPercent = pct * 100;
      this.player.hoverTime = pct * this.player.duration;
    },

    skipPlayer(seconds) {
      const audio = this.$refs.audio;
      if (!audio) return;
      audio.currentTime = Math.max(0, Math.min(this.player.duration, audio.currentTime + seconds));
    },

    setPlaybackRate(rate) {
      const audio = this.$refs.audio;
      if (!audio) return;
      audio.playbackRate = rate;
      this.player.playbackRate = rate;
    },

    toggleMute() {
      const audio = this.$refs.audio;
      if (!audio) return;
      audio.muted = !audio.muted;
      this.player.muted = audio.muted;
    },

    setVolume(value) {
      const audio = this.$refs.audio;
      if (!audio) return;
      audio.volume = value;
      this.player.volume = value;
      if (value > 0 && audio.muted) {
        audio.muted = false;
        this.player.muted = false;
      }
    },

    formatPlayerTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
      const total = Math.floor(seconds);
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${m}:${String(s).padStart(2, '0')}`;
    },

    playSegment(idx) {
      const seg = this.editor.segments[idx];
      if (!seg) return;
      const audio = this.$refs.audio;
      if (!audio) return;
      audio.currentTime = seg.start;
      audio.play();
      this.editor.activeIndex = idx;
    },

    onTextEdit(idx, value) {
      this.editor.segments[idx] = { ...this.editor.segments[idx], text: value };
      this.editor.dirty = true;
    },

    onTimestampEdit(idx, field, value) {
      const parsed = this.parseTimestamp(value);
      if (parsed === null) return;
      this.editor.segments[idx] = { ...this.editor.segments[idx], [field]: parsed };
      this.editor.dirty = true;
    },

    parseTimestamp(str) {
      // Aceita formatos: 1:23.456, 1:23, 0:01:23.456, 83.5
      const s = String(str || '').trim().replace(',', '.');
      if (!s) return null;
      if (/^\d+(\.\d+)?$/.test(s)) {
        return parseFloat(s);
      }
      const parts = s.split(':');
      if (parts.length === 2) {
        const m = parseInt(parts[0], 10);
        const sec = parseFloat(parts[1]);
        if (Number.isNaN(m) || Number.isNaN(sec)) return null;
        return m * 60 + sec;
      }
      if (parts.length === 3) {
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const sec = parseFloat(parts[2]);
        if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(sec)) return null;
        return h * 3600 + m * 60 + sec;
      }
      return null;
    },

    splitSegment(idx) {
      const seg = this.editor.segments[idx];
      if (!seg) return;
      const words = (seg.text || '').trim().split(/\s+/).filter(Boolean);
      if (words.length < 2) {
        alert('Segmento muito curto para dividir');
        return;
      }
      const half = Math.ceil(words.length / 2);
      const text1 = words.slice(0, half).join(' ');
      const text2 = words.slice(half).join(' ');
      const mid = (seg.start + seg.end) / 2;
      const newSegs = [
        { start: seg.start, end: mid, text: text1, words: [] },
        { start: mid, end: seg.end, text: text2, words: [] },
      ];
      this.editor.segments.splice(idx, 1, ...newSegs);
      this.editor.dirty = true;
    },

    mergeSegment(idx) {
      const a = this.editor.segments[idx];
      const b = this.editor.segments[idx + 1];
      if (!a || !b) return;
      const merged = {
        start: a.start,
        end: b.end,
        text: (a.text + ' ' + b.text).replace(/\s+/g, ' ').trim(),
        words: [...(a.words || []), ...(b.words || [])],
      };
      this.editor.segments.splice(idx, 2, merged);
      this.editor.dirty = true;
    },

    removeSegment(idx) {
      if (!confirm('Apagar este segmento?')) return;
      this.editor.segments.splice(idx, 1);
      this.editor.dirty = true;
    },

    async saveEdits() {
      if (!this.editor.dirty || this.editor.saving) return;
      this.editor.saving = true;
      try {
        const res = await fetch(`/api/jobs/${this.editor.jobId}/segments`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segments: this.editor.segments }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
        this.editor.dirty = false;
        await this.loadJobs();
      } catch (err) {
        alert(err.message);
      } finally {
        this.editor.saving = false;
      }
    },

    async applyRegroup() {
      if (this.editor.applying) return;
      if (this.editor.dirty && !confirm('Há alterações não salvas. Reagrupar mesmo assim? (As edições serão perdidas)')) {
        return;
      }
      this.editor.applying = true;
      try {
        const res = await fetch(`/api/jobs/${this.editor.jobId}/regroup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.editor.regroupOpts),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro');
        this.editor.segments = data.segments.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          words: s.words || [],
        }));
        this.editor.dirty = false;
        await this.loadJobs();
      } catch (err) {
        alert(err.message);
      } finally {
        this.editor.applying = false;
      }
    },

    async applyPostProcess() {
      if (this.editor.applying) return;
      if (this.editor.dirty && !confirm('Há alterações não salvas. Aplicar mesmo assim?')) {
        return;
      }
      this.editor.applying = true;
      try {
        const res = await fetch(`/api/jobs/${this.editor.jobId}/postprocess`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.editor.postOpts),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro');
        this.editor.segments = data.segments.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          words: s.words || [],
        }));
        this.editor.dirty = false;
        await this.loadJobs();
      } catch (err) {
        alert(err.message);
      } finally {
        this.editor.applying = false;
      }
    },

    presetNetflix() {
      this.editor.regroupOpts = {
        ...this.editor.regroupOpts,
        max_chars_per_line: 42,
        max_lines_per_segment: 2,
        max_duration_seconds: 7,
        break_on_punctuation: true,
        merge_short_segments: true,
      };
    },

    presetTikTok() {
      this.editor.regroupOpts = {
        ...this.editor.regroupOpts,
        max_chars_per_line: 25,
        max_lines_per_segment: 1,
        max_duration_seconds: 3,
        break_on_punctuation: false,
        merge_short_segments: false,
      };
    },

    formatBytes(bytes) {
      if (!bytes && bytes !== 0) return '';
      const units = ['B', 'KB', 'MB', 'GB'];
      let v = bytes;
      let u = 0;
      while (v >= 1024 && u < units.length - 1) {
        v /= 1024;
        u += 1;
      }
      return `${v.toFixed(v < 10 && u > 0 ? 1 : 0)} ${units[u]}`;
    },

    formatDuration(seconds) {
      if (!seconds && seconds !== 0) return '';
      const total = Math.round(seconds);
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${m}m${String(s).padStart(2, '0')}s`;
    },

    formatTime(seconds) {
      if (seconds == null) return '0:00.000';
      const total = Math.max(0, Number(seconds));
      const ms = Math.round((total - Math.floor(total)) * 1000);
      const totalSec = Math.floor(total);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    },
  };
}
