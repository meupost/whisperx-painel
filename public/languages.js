/**
 * Lista de idiomas suportados pelo Whisper / WhisperX.
 *
 * group: usado para agrupar visualmente
 * priority: idiomas com priority=true aparecem destacados em "Mais usados"
 */
window.LANGUAGES = [
  // Mais usados (priority)
  { code: 'pt', name: 'Português', subtitle: 'BR e PT', group: 'Mais usados', priority: true },
  { code: 'hr', name: 'Croata',    group: 'Mais usados', priority: true },
  { code: 'en', name: 'Inglês',    group: 'Mais usados', priority: true },
  { code: 'es', name: 'Espanhol',  group: 'Mais usados', priority: true },

  // Europeus
  { code: 'bg', name: 'Búlgaro',     group: 'Europeus' },
  { code: 'ca', name: 'Catalão',     group: 'Europeus' },
  { code: 'cs', name: 'Tcheco',      group: 'Europeus' },
  { code: 'da', name: 'Dinamarquês', group: 'Europeus' },
  { code: 'de', name: 'Alemão',      group: 'Europeus' },
  { code: 'el', name: 'Grego',       group: 'Europeus' },
  { code: 'et', name: 'Estoniano',   group: 'Europeus' },
  { code: 'fi', name: 'Finlandês',   group: 'Europeus' },
  { code: 'fr', name: 'Francês',     group: 'Europeus' },
  { code: 'hu', name: 'Húngaro',     group: 'Europeus' },
  { code: 'is', name: 'Islandês',    group: 'Europeus' },
  { code: 'it', name: 'Italiano',    group: 'Europeus' },
  { code: 'lt', name: 'Lituano',     group: 'Europeus' },
  { code: 'lv', name: 'Letão',       group: 'Europeus' },
  { code: 'mk', name: 'Macedônio',   group: 'Europeus' },
  { code: 'nl', name: 'Holandês',    group: 'Europeus' },
  { code: 'no', name: 'Norueguês',   group: 'Europeus' },
  { code: 'pl', name: 'Polonês',     group: 'Europeus' },
  { code: 'ro', name: 'Romeno',      group: 'Europeus' },
  { code: 'ru', name: 'Russo',       group: 'Europeus' },
  { code: 'sk', name: 'Eslovaco',    group: 'Europeus' },
  { code: 'sl', name: 'Esloveno',    group: 'Europeus' },
  { code: 'sq', name: 'Albanês',     group: 'Europeus' },
  { code: 'sr', name: 'Sérvio',      group: 'Europeus' },
  { code: 'sv', name: 'Sueco',       group: 'Europeus' },
  { code: 'tr', name: 'Turco',       group: 'Europeus' },
  { code: 'uk', name: 'Ucraniano',   group: 'Europeus' },

  // Asiáticos
  { code: 'ar', name: 'Árabe',       group: 'Asiáticos' },
  { code: 'bn', name: 'Bengali',     group: 'Asiáticos' },
  { code: 'fa', name: 'Persa',       group: 'Asiáticos' },
  { code: 'he', name: 'Hebraico',    group: 'Asiáticos' },
  { code: 'hi', name: 'Hindi',       group: 'Asiáticos' },
  { code: 'id', name: 'Indonésio',   group: 'Asiáticos' },
  { code: 'ja', name: 'Japonês',     group: 'Asiáticos' },
  { code: 'kk', name: 'Cazaque',     group: 'Asiáticos' },
  { code: 'km', name: 'Khmer',       group: 'Asiáticos' },
  { code: 'ko', name: 'Coreano',     group: 'Asiáticos' },
  { code: 'ms', name: 'Malaio',      group: 'Asiáticos' },
  { code: 'my', name: 'Birmanês',    group: 'Asiáticos' },
  { code: 'ne', name: 'Nepalês',     group: 'Asiáticos' },
  { code: 'ta', name: 'Tâmil',       group: 'Asiáticos' },
  { code: 'te', name: 'Telugu',      group: 'Asiáticos' },
  { code: 'th', name: 'Tailandês',   group: 'Asiáticos' },
  { code: 'tl', name: 'Tagalo',      group: 'Asiáticos' },
  { code: 'ur', name: 'Urdu',        group: 'Asiáticos' },
  { code: 'vi', name: 'Vietnamita',  group: 'Asiáticos' },
  { code: 'zh', name: 'Chinês',      group: 'Asiáticos' },

  // Africanos
  { code: 'af', name: 'Africâner', group: 'Africanos' },
  { code: 'am', name: 'Amárico',   group: 'Africanos' },
  { code: 'ha', name: 'Hauçá',     group: 'Africanos' },
  { code: 'sw', name: 'Suaíli',    group: 'Africanos' },
  { code: 'yo', name: 'Iorubá',    group: 'Africanos' },

  // Outros
  { code: 'az', name: 'Azerbaijano',  group: 'Outros' },
  { code: 'be', name: 'Bielorrusso',  group: 'Outros' },
  { code: 'bs', name: 'Bósnio',       group: 'Outros' },
  { code: 'cy', name: 'Galês',        group: 'Outros' },
  { code: 'eu', name: 'Basco',        group: 'Outros' },
  { code: 'ga', name: 'Irlandês',     group: 'Outros' },
  { code: 'gl', name: 'Galego',       group: 'Outros' },
  { code: 'hy', name: 'Armênio',      group: 'Outros' },
  { code: 'ka', name: 'Georgiano',    group: 'Outros' },
  { code: 'la', name: 'Latim',        group: 'Outros' },
  { code: 'mi', name: 'Maori',        group: 'Outros' },
  { code: 'mr', name: 'Marata',       group: 'Outros' },
  { code: 'mt', name: 'Maltês',       group: 'Outros' },
  { code: 'pa', name: 'Panjabi',      group: 'Outros' },
];
