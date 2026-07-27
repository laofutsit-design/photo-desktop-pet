(function attachCharacterProfile(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CharacterProfile = api;
}(typeof window === 'object' ? window : globalThis, () => {
  'use strict';

  const MAX_PROFILE_LENGTH = 20000;
  const MAX_PHRASE_LENGTH = 64;
  const DEFAULT_BEHAVIOR = {
    clickActions: ['squash', 'twirl', 'jump', 'shake', 'bounce', 'nod', 'bow', 'sway', 'stretch', 'tiptoe'],
    idleActions: ['idle-breathe', 'idle-look', 'idle-sway', 'idle-blink'],
  };

  const SECTION_DEFINITIONS = [
    { key: 'identity', labels: ['身份', '职业', '种族', '阵营', '称号', '基本信息', '角色定位'] },
    { key: 'story', labels: ['剧情', '身世', '背景', '过去', '经历', '出身', '世界观', '故事'] },
    { key: 'personality', labels: ['性格', '个性', '性情', '人格', '外在性格', '角色性格'] },
    { key: 'inner', labels: ['内心', '内心活动', '真实想法', '心理', '心境', '秘密', '矛盾'] },
    { key: 'goal', labels: ['目标', '愿望', '梦想', '执念', '使命', '动机', '追求'] },
    { key: 'relationship', labels: ['关系', '人际关系', '家人', '伙伴', '羁绊', '重要的人'] },
    {
      key: 'speech',
      labels: [
        '口癖', '常说', '总会说', '说话时会', '代表台词', '招牌台词', '台词', '对白', '座右铭',
        '语气', '说话方式', '语言风格', '自称', '称呼',
      ],
    },
    { key: 'likes', labels: ['喜欢', '爱好', '偏好', '习惯'] },
    { key: 'dislikes', labels: ['讨厌', '厌恶', '害怕', '恐惧', '弱点', '雷区'] },
  ];

  const SECTION_BY_LABEL = new Map();
  for (const section of SECTION_DEFINITIONS) {
    for (const label of section.labels) SECTION_BY_LABEL.set(label, section.key);
  }
  const LABEL_PATTERN = [...SECTION_BY_LABEL.keys()]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|');

  const CLASSIFIERS = [
    ['inner', /内心|其实|表面.+(?:内心|心里)|隐藏|不愿.+知道|秘密|矛盾|孤独|自责|愧疚/],
    ['goal', /目标|愿望|梦想|执念|使命|想要|希望|渴望|决心|发誓|寻找|守护/],
    ['relationship', /关系|家人|父亲|母亲|哥哥|姐姐|弟弟|妹妹|朋友|伙伴|同伴|恋人|爱人|主人|师父|羁绊/],
    ['speech', /口癖|常说|总会说|说话|语气|自称|称呼/],
    ['likes', /喜欢|爱好|偏爱|钟爱|习惯/],
    ['dislikes', /讨厌|厌恶|害怕|恐惧|弱点|不敢|担心/],
    ['personality', /性格|个性|性情|外冷内热|嘴硬心软|沉默寡言|活泼开朗/],
    ['identity', /身份|职业|种族|阵营|称号|身为|作为|担任|是一名|来自.+(?:族|国|城|组织)/],
    ['story', /身世|背景|过去|曾经|自幼|小时候|出生|故乡|家族|失去|遭遇|经历/],
  ];

  const TRAIT_RULES = [
    {
      id: 'energetic',
      keywords: ['活泼', '开朗', '元气', '好动', '热情', '乐观', '阳光'],
      phrases: ['今天也要元气满满！', '来吧，一起动起来！', '看到你，我就忍不住开心起来啦！'],
      clickActions: ['jump', 'bounce', 'twirl', 'squash'],
      idleActions: ['idle-sway', 'idle-look'],
      specialActions: ['hop'],
      actionPhrases: { hop: ['别眨眼，我还可以跳得更高！'] },
    },
    {
      id: 'gentle',
      keywords: ['温柔', '治愈', '体贴', '善良', '柔和', '善解人意', '包容'],
      phrases: ['慢慢来，我会温柔地陪着你。', '累了就休息一下吧。', '只要你需要，我就在这里。'],
      clickActions: ['nod', 'bow', 'sway', 'tiptoe'],
      idleActions: ['idle-breathe', 'idle-blink'],
      specialActions: ['sleep'],
      actionPhrases: { sleep: ['在你身边，我可以安心睡一会儿。'] },
    },
    {
      id: 'tsundere',
      keywords: ['傲娇', '嘴硬', '口是心非', '毒舌', '别扭', '嘴硬心软'],
      phrases: ['才、才不是特意陪你的。', '哼，这次就勉强回应你一下。', '别误会，我只是在观察你。'],
      clickActions: ['shake', 'tiptoe', 'nod'],
      idleActions: ['idle-look', 'idle-blink'],
      specialActions: [],
      actionPhrases: {},
    },
    {
      id: 'foodie',
      keywords: ['吃货', '美食', '甜点', '零食', '馋', '喜欢吃', '料理'],
      phrases: ['是不是到了吃点心的时间？', '这一口也分给你！', '闻到了，是好吃的味道！'],
      clickActions: ['squash', 'bounce', 'nod'],
      idleActions: ['idle-look', 'idle-breathe'],
      specialActions: ['eat'],
      actionPhrases: { eat: ['好吃的东西，会让心情也变好。'] },
    },
    {
      id: 'sleepy',
      keywords: ['嗜睡', '爱睡', '慵懒', '困倦', '懒散', '睡觉', '贪睡'],
      phrases: ['再陪你一会儿，我就去睡啦。', '呼……今天也适合打个小盹。', '慢一点也没关系。'],
      clickActions: ['stretch', 'sway', 'nod'],
      idleActions: ['idle-breathe', 'idle-blink'],
      specialActions: ['sleep'],
      actionPhrases: { sleep: ['呼……梦里也会记得你的。'] },
    },
    {
      id: 'sensitive',
      keywords: ['爱哭', '胆小', '敏感', '怕生', '脆弱', '多愁善感', '容易难过'],
      phrases: ['要轻轻对待我哦。', '有你在旁边，我就没那么害怕了。', '呜……只是有一点点难过。'],
      clickActions: ['shake', 'bow', 'sway'],
      idleActions: ['idle-blink', 'idle-look'],
      specialActions: ['cry'],
      actionPhrases: { cry: ['眼泪停下来以前……陪我一下，好吗？'] },
    },
    {
      id: 'elegant',
      keywords: ['优雅', '端庄', '礼貌', '贵族', '大小姐', '公主', '从容', '高贵'],
      phrases: ['请允许我优雅地陪伴你。', '今天也要保持从容。', '贵安，愿你拥有美好的一天。'],
      clickActions: ['bow', 'twirl', 'tiptoe'],
      idleActions: ['idle-sway', 'idle-breathe'],
      specialActions: [],
      actionPhrases: {},
    },
    {
      id: 'clumsy',
      keywords: ['冒失', '笨拙', '天然呆', '迷糊', '容易摔', '粗心'],
      phrases: ['刚才什么都没有发生，对吧？', '哎呀……我会小心一点的！', '偶尔冒失一下也没关系嘛。'],
      clickActions: ['bounce', 'shake', 'squash'],
      idleActions: ['idle-look', 'idle-sway'],
      specialActions: ['fall'],
      actionPhrases: { fall: ['没、没事！只是脚下突然不听话。'] },
    },
    {
      id: 'winged',
      keywords: ['翅膀', '天使', '飞翔', '精灵', '羽翼', '翼族'],
      phrases: ['要和我一起飞一会儿吗？', '翅膀已经准备好啦！', '风会把好心情送到你身边。'],
      clickActions: ['jump', 'twirl', 'tiptoe'],
      idleActions: ['idle-sway', 'idle-look'],
      specialActions: ['hop'],
      actionPhrases: { hop: ['风托住了我的翅膀！'] },
    },
    {
      id: 'brave',
      keywords: ['勇敢', '可靠', '守护', '骑士', '正义', '坚定', '忠诚'],
      phrases: ['放心，我会守在你身边。', '这点困难可拦不住我们。', '一起勇敢地向前走吧！'],
      clickActions: ['nod', 'bounce', 'jump'],
      idleActions: ['idle-look', 'idle-breathe'],
      specialActions: ['hop'],
      actionPhrases: { hop: ['为了守护重要的人，我不会停下。'] },
    },
    {
      id: 'reserved',
      keywords: ['高冷', '冷静', '克制', '寡言', '沉稳', '理性', '冷淡'],
      phrases: ['我不擅长热闹，但会留在这里。', '先冷静下来，再决定下一步。', '不必多言，我明白。'],
      clickActions: ['nod', 'bow', 'sway'],
      idleActions: ['idle-look', 'idle-blink'],
      specialActions: [],
      actionPhrases: {},
    },
    {
      id: 'scholarly',
      keywords: ['学者', '书生', '博学', '聪慧', '诗人', '谋士', '儒雅'],
      phrases: ['书里的答案，也许正等着我们。', '容我再仔细思量片刻。', '今日的风，适合读一页旧书。'],
      clickActions: ['nod', 'bow', 'sway'],
      idleActions: ['idle-look', 'idle-breathe'],
      specialActions: [],
      actionPhrases: {},
    },
    {
      id: 'mischievous',
      keywords: ['淘气', '调皮', '恶作剧', '古灵精怪', '顽皮'],
      phrases: ['猜猜我刚才藏了什么？', '嘿嘿，差一点就被你发现啦！', '偶尔恶作剧一下才有趣嘛。'],
      clickActions: ['squash', 'shake', 'jump', 'twirl'],
      idleActions: ['idle-look', 'idle-sway'],
      specialActions: ['hop'],
      actionPhrases: { hop: ['抓不到我吧！'] },
    },
  ];

  const FONT_RULES = [
    { font: 'xingkai', keywords: ['行书', '古风', '仙侠', '江湖', '剑客', '诗词', '侠客', '修仙'] },
    { font: 'shoujin', keywords: ['瘦金体', '皇族', '贵族', '帝王', '神明', '祭司', '优雅', '端庄', '大小姐'] },
    { font: 'rounded', keywords: ['幼圆', '可爱', '软萌', '天真', '孩子气', '活泼', '元气', '甜美'] },
    { font: 'heiti', keywords: ['黑体', '未来', '科技', '赛博', '机械', '机器人', '军人', '冷酷'] },
    { font: 'lishu', keywords: ['隶书', '古朴', '碑文', '厚重'] },
    { font: 'songti', keywords: ['宋体', '历史', '复古', '正式', '严肃', '庄重'] },
    { font: 'fangsong', keywords: ['仿宋', '公文', '档案', '记录员'] },
    { font: 'kaiti', keywords: ['楷体', '学者', '书生', '文静', '温柔', '沉稳', '治愈', '儒雅'] },
    { font: 'yahei', keywords: ['雅黑', '现代', '都市', '干练', '直接'] },
  ];

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  const OPEN_QUOTES = new Map([
    ['“', '”'],
    ['「', '」'],
    ['『', '』'],
    ['‘', '’'],
  ]);

  function isAsciiWordCharacter(value) {
    return Boolean(value) && /[A-Za-z0-9]/.test(value);
  }

  function quoteProtectedPositions(text) {
    const protectedPositions = new Uint8Array(text.length);
    const quoteStack = [];
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const expectedClose = quoteStack.at(-1);
      if (character === '\n') {
        quoteStack.length = 0;
        continue;
      }
      if ((character === '"' || character === "'") && expectedClose === character) {
        protectedPositions[index] = 1;
        quoteStack.pop();
        continue;
      }
      const straightQuote = character === '"' || (
        character === "'"
        && !(isAsciiWordCharacter(text[index - 1]) && isAsciiWordCharacter(text[index + 1]))
      );
      if (straightQuote) {
        protectedPositions[index] = 1;
        quoteStack.push(character);
        continue;
      }
      if (OPEN_QUOTES.has(character)) {
        protectedPositions[index] = 1;
        quoteStack.push(OPEN_QUOTES.get(character));
        continue;
      }
      if (character === expectedClose) {
        protectedPositions[index] = 1;
        quoteStack.pop();
        continue;
      }
      if (quoteStack.length > 0) protectedPositions[index] = 1;
    }
    return protectedPositions;
  }

  function splitFacts(value) {
    const text = String(value || '')
      .replace(/\r/g, '\n')
      .replace(/[•●▪◆◇■□★☆]\s*/g, '\n');
    const facts = [];
    const quoteStack = [];
    let buffer = '';

    const flush = () => {
      const fact = buffer.trim();
      if (fact) facts.push(fact);
      buffer = '';
    };

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const expectedClose = quoteStack.at(-1);

      if (character === '\n') {
        flush();
        quoteStack.length = 0;
        continue;
      }
      if ((character === '"' || character === "'") && expectedClose === character) {
        quoteStack.pop();
        buffer += character;
        continue;
      }
      const straightQuote = character === '"' || (
        character === "'"
        && !(isAsciiWordCharacter(text[index - 1]) && isAsciiWordCharacter(text[index + 1]))
      );
      if (straightQuote) {
        quoteStack.push(character);
        buffer += character;
        continue;
      }
      if (OPEN_QUOTES.has(character)) {
        quoteStack.push(OPEN_QUOTES.get(character));
        buffer += character;
        continue;
      }
      if (character === expectedClose) {
        quoteStack.pop();
        buffer += character;
        continue;
      }
      if (quoteStack.length === 0 && /[；;]/.test(character)) {
        flush();
        continue;
      }

      buffer += character;
      if (quoteStack.length > 0) continue;

      const urlTail = /https?:\/\/\S*$/i.test(buffer);
      if (/[。！？!?]/.test(character) && !urlTail) {
        flush();
        continue;
      }
      if (character === '.' && !urlTail) {
        const next = text[index + 1] || '';
        if (!next || /\s/.test(next)) flush();
      }
    }
    flush();

    return facts
      .map((part) => part.trim().replace(/^(?:[-—–·]\s*|\d{1,3}[.)、]\s*)/, ''))
      .filter((part) => part.length >= 1);
  }

  function classifyFact(value) {
    return CLASSIFIERS.find((entry) => entry[1].test(value))?.[0];
  }

  function validSectionMarkerBoundary(profile, index) {
    let cursor = index - 1;
    while (cursor >= 0 && /[ \t]/.test(profile[cursor])) cursor -= 1;
    if (cursor < 0 || /[\n。！？!?；;，,”」』]/.test(profile[cursor])) return true;
    const lineStart = profile.lastIndexOf('\n', index - 1) + 1;
    const prefix = profile.slice(lineStart, index).trim();
    return /^(?:[-—–·•●▪◆◇■□★☆]|\d{1,3}[.)、])$/.test(prefix);
  }

  function parseProfile(profile) {
    const sections = Object.fromEntries(SECTION_DEFINITIONS.map(({ key }) => [key, []]));
    const markerPattern = new RegExp(`(${LABEL_PATTERN})\\s*[：:]`, 'g');
    const protectedPositions = quoteProtectedPositions(profile);
    const markers = [...profile.matchAll(markerPattern)]
      .filter((match) => (
        !protectedPositions[match.index]
        && validSectionMarkerBoundary(profile, match.index)
      ));
    const unlabeled = [];

    if (markers.length === 0) {
      unlabeled.push(...splitFacts(profile));
    } else {
      unlabeled.push(...splitFacts(profile.slice(0, markers[0].index)));
      for (let index = 0; index < markers.length; index += 1) {
        const marker = markers[index];
        const start = marker.index + marker[0].length;
        const end = markers[index + 1]?.index ?? profile.length;
        const key = SECTION_BY_LABEL.get(marker[1]);
        for (const fact of splitFacts(profile.slice(start, end))) {
          sections[key].push(fact);
          const inferred = classifyFact(fact);
          if (inferred && inferred !== key && inferred !== 'speech' && key !== 'speech') {
            sections[inferred].push(fact);
          }
        }
      }
    }

    for (const fact of unlabeled) {
      const key = classifyFact(fact);
      if (key) sections[key].push(fact);
    }
    for (const key of Object.keys(sections)) sections[key] = unique(sections[key]);
    return { sections, unlabeled: unique(unlabeled) };
  }

  function keywordCount(text, keyword) {
    let count = 0;
    let offset = 0;
    while (offset < text.length) {
      const index = text.indexOf(keyword, offset);
      if (index < 0) break;
      const before = text.slice(Math.max(0, index - 4), index);
      if (!/(?:不|并不|并非|不是|不再|从不|毫不|不喜欢|并不喜欢|讨厌|拒绝)$/.test(before)) {
        count += 1;
      }
      offset = index + keyword.length;
    }
    return count;
  }

  function extractSelfReference(profile) {
    const explicit = profile.match(
      /(?:自称|第一人称|对自己的称呼)\s*[：:]?\s*[“"'‘]?([\u3400-\u9fffA-Za-z]{1,8})/,
    )?.[1];
    if (explicit && !['自己', '角色', '主人公'].includes(explicit)) return explicit;
    for (const reference of ['朕', '本王', '本宫', '本小姐', '在下', '吾']) {
      if (profile.includes(reference)) return reference;
    }
    return '我';
  }

  const WRAPPING_QUOTES = new Map([
    ['“', '”'],
    ['「', '」'],
    ['『', '』'],
    ['‘', '’'],
    ['"', '"'],
    ["'", "'"],
  ]);
  const METADATA_PREFIX = /^(?:姓名|年龄|生日|身高|体重|性别|种族|职业|阵营|外貌|发色|瞳色|武器|属性|标签|关键词|备注|主页|链接|网址|CV|声优|出处)\s*[：:]/i;
  const STATIC_ATTRIBUTE_PREFIX = /^(?:姓名|年龄|生日|身高|体重|性别|外貌|发色|瞳色|武器|血型|星座|三围|属性|标签|关键词|CV|声优|出处)/i;
  const SPEECH_DESCRIPTION = /(?:语气|语调|语速|声线|语言风格|说话方式|句子简短|用词|措辞|敬语|自称|称呼|口音|古风|现代口语|冷静|克制|温柔|活泼|简短|直接|平静|冷淡|礼貌)/;
  const NARRATIVE_OPENING = /^(?:第[一二三四五六七八九十百\d]+[章节幕]|场景|镜头|旁白|画面|月光|阳光|夜幕|清晨|黄昏|随后|此时|与此同时|故事开始|剧情)/;

  function extractQuotedText(value) {
    const phrases = [];
    const pattern = /“([^”\n]{1,100})”|「([^」\n]{1,100})」|『([^』\n]{1,100})』|‘([^’\n]{1,100})’|"([^"\n]{1,100})"|'([^'\n]{1,100})'/g;
    for (const match of String(value || '').matchAll(pattern)) {
      phrases.push(match.slice(1).find((candidate) => candidate !== undefined));
    }
    return phrases;
  }

  function stripWrappingQuotes(value) {
    let phrase = String(value || '').trim();
    while (phrase.length >= 2) {
      const expectedClose = WRAPPING_QUOTES.get(phrase[0]);
      if (!expectedClose || phrase.at(-1) !== expectedClose) break;
      phrase = phrase.slice(1, -1).trim();
    }
    return phrase;
  }

  function completeBubbleText(value, explicitSpeech = false) {
    let phrase = stripWrappingQuotes(value)
      .replace(/\s+/g, ' ')
      .trim();
    if (!phrase || /https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i.test(phrase)) return '';
    if (!explicitSpeech && METADATA_PREFIX.test(phrase)) return '';
    if (/^[“「『"]|[”」』"]$/.test(phrase)) return '';
    if (/[,，、:：—–-]$/.test(phrase)) return '';
    phrase = phrase.replace(/[；;]+$/g, '。');
    if (!/[。！？!?…～~.]$/.test(phrase)) phrase = `${phrase}。`;
    if (/(?:喜欢|讨厌|害怕|希望|想要|来自|出生|把|将|但是|因为|所以|以及|和|与)[。！？!?]$/.test(phrase)) return '';
    if (phrase.length > MAX_PHRASE_LENGTH) return '';
    return phrase;
  }

  function leadingSelfReference(value, name, selfReference) {
    let phrase = value;
    if (name) {
      phrase = phrase.replace(
        new RegExp(`^${escapeRegExp(name)}(?=的|是|为|在|曾|将|要|想|喜|讨|害|担|决|发|来|去|把|被)`),
        selfReference,
      );
    }
    phrase = phrase
      .replace(/^(?:她|他|它|该角色|这个角色|角色本人|主人公|主角)的/, `${selfReference}的`)
      .replace(/^(?:她|他|它|该角色|这个角色|角色本人|主人公|主角)(?=是|为|在|曾|将|要|想|喜|讨|害|担|决|发|来|去|把|被|其)/, selfReference)
      .replace(/用户/g, '你');
    return phrase;
  }

  function personalStoryFact(value, name) {
    const phrase = stripWrappingQuotes(value).trim();
    if (!phrase || NARRATIVE_OPENING.test(phrase) || /https?:\/\//i.test(phrase)) return false;
    const namePattern = name ? `${escapeRegExp(name)}|` : '';
    return new RegExp(
      `^(?:${namePattern}我|她|他|该角色|这个角色|出生|来自|曾经|自幼|小时候|幼年|从小|故乡|家族|失去|遭遇|独自|被迫|逃离)`,
    ).test(phrase);
  }

  function personalRelationshipFact(value, name) {
    const phrase = stripWrappingQuotes(value).trim();
    if (!phrase || /[“”「」『』"']/.test(phrase)) return false;
    const namePattern = name ? `${escapeRegExp(name)}|` : '';
    return new RegExp(
      `^(?:${namePattern}我|她|他|该角色|这个角色|把|将|和|与)`,
    ).test(phrase);
  }

  function firstPersonFact(value, name, selfReference, kind = 'fact') {
    let phrase = stripWrappingQuotes(value)
      .replace(/\s+/g, ' ')
      .trim();
    if (!phrase) return '';
    if (kind === 'speech') {
      if (name) {
        phrase = phrase.replace(new RegExp(`^${escapeRegExp(name)}\\s*[：:]\\s*`), '');
      }
      return completeBubbleText(phrase, true);
    }
    if (METADATA_PREFIX.test(phrase) || /https?:\/\/|www\./i.test(phrase)) return '';
    if (kind === 'identity' && STATIC_ATTRIBUTE_PREFIX.test(phrase)) return '';
    if (kind === 'story' && !personalStoryFact(phrase, name)) return '';
    if (kind === 'relationship' && (
      /—{2,}|[-=]>/i.test(phrase)
      || !personalRelationshipFact(phrase, name)
    )) return '';

    phrase = leadingSelfReference(phrase, name, selfReference);
    if (kind === 'inner') {
      const innerMarker = phrase.lastIndexOf('其实');
      if (innerMarker >= 0) {
        phrase = phrase.slice(innerMarker + 2).replace(/^[，,:：\s]+/, '');
      }
      if (!phrase.startsWith(selfReference)) phrase = `${selfReference}${phrase}`;
      phrase = `其实，${phrase}`;
    } else if (kind === 'identity' && !phrase.startsWith(selfReference)) {
      phrase = `${selfReference}${/^(?:是|为)/.test(phrase) ? '' : '是'}${phrase}`;
    } else if (kind === 'goal' && !phrase.startsWith(selfReference)) {
      phrase = `${selfReference}${/^(?:想要|希望|渴望|决定|发誓|要)/.test(phrase) ? '' : '想要'}${phrase}`;
    } else if (kind === 'likes' && !phrase.startsWith(selfReference)) {
      phrase = `${selfReference}${/^(?:喜欢|爱好|偏爱|钟爱)/.test(phrase) ? '' : '喜欢'}${phrase}`;
    } else if (kind === 'dislikes' && !phrase.startsWith(selfReference)) {
      phrase = `${selfReference}${/^(?:讨厌|厌恶|害怕|恐惧|担心)/.test(phrase) ? '' : '讨厌'}${phrase}`;
    } else if (kind === 'relationship' && !phrase.startsWith(selfReference)) {
      phrase = `${selfReference}${/^(?:把|将|和|与)/.test(phrase) ? '' : '的'}${phrase}`;
    } else if (kind === 'story' && !phrase.startsWith(selfReference)) {
      phrase = `${selfReference}${phrase}`;
    }
    return completeBubbleText(phrase);
  }

  function quotedSpeech(sections) {
    const phrases = [];
    for (const fact of sections.speech) {
      const quotes = extractQuotedText(fact);
      if (quotes.length > 0) {
        phrases.push(...quotes);
        continue;
      }
      const spokenClause = fact.match(/(?:会说|常说|总会说|说的是)\s*[：:]\s*(.+)$/)?.[1];
      if (spokenClause) {
        phrases.push(spokenClause);
        continue;
      }
      if (!SPEECH_DESCRIPTION.test(fact)) phrases.push(fact);
    }
    return phrases;
  }

  function chooseFont(profile) {
    const explicitFont = [
      ['xingkai', /行书|华文行楷/],
      ['shoujin', /瘦金体|瘦金书/],
      ['rounded', /幼圆/],
      ['heiti', /黑体/],
      ['lishu', /隶书/],
      ['songti', /宋体/],
      ['fangsong', /仿宋/],
      ['kaiti', /楷体/],
      ['yahei', /雅黑/],
    ].find((entry) => entry[1].test(profile));
    if (explicitFont) return explicitFont[0];
    if (/未来|科技|赛博|机械|机器人/.test(profile)) return 'heiti';
    if (/古风|仙侠|江湖|剑客|侠客|修仙/.test(profile)) return 'xingkai';

    let selected = { font: 'system', score: 0, priority: Number.MAX_SAFE_INTEGER };
    FONT_RULES.forEach((rule, priority) => {
      const score = rule.keywords.reduce(
        (total, keyword) => total + keywordCount(profile, keyword),
        0,
      );
      if (score > selected.score || (score === selected.score && score > 0 && priority < selected.priority)) {
        selected = { font: rule.font, score, priority };
      }
    });
    return selected.font;
  }

  function mergeActionPhrases(rules) {
    const result = {};
    for (const rule of rules) {
      for (const [action, phrases] of Object.entries(rule.actionPhrases)) {
        result[action] = unique([...(result[action] || []), ...phrases]);
      }
    }
    return result;
  }

  function analyzeCharacterProfile({ name = '我', profile = '' } = {}) {
    const normalized = String(profile || '').trim().slice(0, MAX_PROFILE_LENGTH);
    if (!normalized) {
      return {
        phrases: [],
        clickActions: [...DEFAULT_BEHAVIOR.clickActions],
        idleActions: [...DEFAULT_BEHAVIOR.idleActions],
        specialActions: [],
        actionPhrases: {},
        font: 'system',
        traits: [],
        sections: {},
      };
    }

    const { sections, unlabeled } = parseProfile(normalized);
    const traitCorpus = [
      ...sections.personality,
      ...sections.inner,
      ...sections.speech,
      ...unlabeled.filter((fact) => !['relationship', 'story'].includes(classifyFact(fact))),
    ].join(' ');
    const rankedTraits = TRAIT_RULES.map((rule, order) => ({
      rule,
      order,
      score: rule.keywords.reduce(
        (total, keyword) => total + keywordCount(traitCorpus, keyword),
        0,
      ),
    }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.order - right.order)
      .slice(0, 4);
    const matchedRules = rankedTraits.map(({ rule }) => rule);
    const selfReference = extractSelfReference(normalized);

    const phrases = unique([
      ...quotedSpeech(sections).slice(0, 8)
        .map((fact) => firstPersonFact(fact, name, selfReference, 'speech')),
      ...sections.inner.slice(0, 5)
        .map((fact) => firstPersonFact(fact, name, selfReference, 'inner')),
      ...sections.goal.slice(0, 4)
        .map((fact) => firstPersonFact(fact, name, selfReference, 'goal')),
      ...sections.story.slice(0, 5)
        .map((fact) => firstPersonFact(fact, name, selfReference, 'story')),
      ...sections.relationship.slice(0, 4)
        .map((fact) => firstPersonFact(fact, name, selfReference, 'relationship')),
      ...sections.likes.slice(0, 3)
        .map((fact) => firstPersonFact(fact, name, selfReference, 'likes')),
      ...sections.dislikes.slice(0, 3)
        .map((fact) => firstPersonFact(fact, name, selfReference, 'dislikes')),
      ...sections.identity.slice(0, 3)
        .map((fact) => firstPersonFact(fact, name, selfReference, 'identity')),
      ...matchedRules.flatMap((rule) => rule.phrases),
    ]).slice(0, 40);

    if (phrases.length === 0) {
      phrases.push(
        `${name}会按照自己的方式陪着你。`,
        '你写下的设定，我都有好好记住。',
        `今天也让${name}陪着你吧。`,
      );
    }

    return {
      phrases,
      clickActions: unique(matchedRules.flatMap((rule) => rule.clickActions)).length > 0
        ? unique(matchedRules.flatMap((rule) => rule.clickActions))
        : [...DEFAULT_BEHAVIOR.clickActions],
      idleActions: unique(matchedRules.flatMap((rule) => rule.idleActions)).length > 0
        ? unique(matchedRules.flatMap((rule) => rule.idleActions))
        : [...DEFAULT_BEHAVIOR.idleActions],
      specialActions: unique(matchedRules.flatMap((rule) => rule.specialActions)),
      actionPhrases: mergeActionPhrases(matchedRules),
      font: chooseFont(normalized),
      traits: rankedTraits.map(({ rule }) => rule.id),
      sections,
    };
  }

  return {
    MAX_PROFILE_LENGTH,
    analyzeCharacterProfile,
  };
}));
