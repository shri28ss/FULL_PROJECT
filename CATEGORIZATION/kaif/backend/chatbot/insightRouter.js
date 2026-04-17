/**
 * Insight Router — Smart Routing
 *
 * Philosophy:
 *   - If the query is about the user's OWN financial data → STATISTICAL (DB query)
 *   - If the query needs external/real-time info (gold rates, tax law, investment advice) → LLM
 *   - Default for anything financial = STATISTICAL (fast, free, always accurate)
 *
 * The router should be LIBERAL about routing to STATISTICAL — the agent handles
 * the nuance. Never fail a user's data question just because the pattern wasn't listed.
 */

const logger = require('../utils/logger');

// ─── Queries that MUST go to LLM (external / real-time / advice) ─────
// These patterns are checked FIRST. If none match → STATISTICAL by default.
const LLM_ONLY_PATTERNS = [
  // External market data
  /(?:gold|silver|crude|oil|petroleum|forex|currency)\s*(?:rate|price|value|today|current|live|now)/i,
  /(?:current|today|live|latest|real.?time)\s*(?:gold|silver|crude|oil|forex|currency)\s*(?:rate|price)/i,
  /(?:stock|share|nifty|sensex|bse|nse|market)\s*(?:price|rate|index|today|current|live)/i,
  /(?:bitcoin|crypto|ethereum|btc|eth)\s*(?:price|rate|value)/i,

  // Tax law & regulations — ONLY external knowledge, NOT user's own tax data
  /(?:income\s*tax|gst|tds|itr)\s*(?:slab|rate|rule|regulation|filing|deadline|return|calculation)/i,
  /(?:slab|rate|rule|regulation|filing|deadline|deduction)\s+(?:for|of|under)\s+(?:tax|gst|itr|income\s*tax)/i,
  /(?:section)\s*(?:80c|80d|80g|24b?|10|87a)/i,
  /(?:how\s+to|when\s+to|steps?\s+to)\s+(?:file|calculate|submit|claim)\s+(?:tax|itr|gst|return)/i,
  /(?:save|reduce|cut|minimize)\s+(?:my\s+)?(?:income\s+)?tax(?:es)?\b/i,
  /tax\s+(?:saving|saver|savings|planning|exemption|rebate|relief)/i,
  /(?:what\s*is|what\s*are|define|meaning\s*of)\s*(?:inflation|repo|gdp|npa|fiscal|mutual\s*fund|etf|bond|cagr|xirr|nav)/i,

  // Investment advice (external knowledge only — not user data)
  /(?:tips?|advice|tricks?|ways?|guide)\s+(?:to|for|on)\s+(?:invest|save\s+tax|manage\s+money|build\s+wealth)/i,
  /(?:should\s*i\s*(?:invest|buy|sell|put\s+money|start\s+sip))/i,
  /(?:is\s*it\s*(?:good|bad|safe|risky|worth))\s*(?:to\s*)?(?:invest|buy|put)/i,
  /(?:advise|advice|suggest|recommend|guide)\s*(?:me|on|about|for)\s+(?:invest|fund|stock|plan)/i,
  /(?:best\s*(?:mutual\s*fund|stock|investment\s*plan|sip|fd|ppf|nps|elss))/i,
  /(?:mutual\s*fund|sip|fd|fixed\s*deposit|ppf|nps|elss|ulip)\s*(?:return|interest|rate|comparison|benefit)/i,
  /(?:retirement\s*plan|emergency\s*fund\s*tips|insurance\s*plan\s*advice)/i,
  /(?:rbi|reserve\s*bank|sebi)\s*(?:policy|rule|regulation|update|news|announcement|guideline)/i,
  /(?:new|latest|recent)\s*(?:banking|finance)\s*(?:rule|regulation|policy|news)/i,
  /(?:repo\s*rate|inflation\s*rate|cpi|gdp\s*growth)/i,
  /(?:upi|rtgs|neft|imps)\s*(?:limit|charge|fee|rule|regulation)/i,
  /(?:explain|analyse|analyze|predict|forecast)\s+(?:my\s+)?(?:spending\s+trend|pattern|behaviour|behavior)/i,
  /(?:what\s+caused|reason\s+for|how\s+come)\s+(?:my|the)\s+/i,
  /(?:tips?|advice|tricks?|ways?)\s+(?:to|for)\s+(?:reduce\s+expense|save\s+money|manage\s+budget)/i,
];

// ─── Queries that are definitely about the user's OWN data → STATISTICAL ─
// Checked only if LLM patterns didn't match. These ensure correct routing.
// But even without these, financial queries default to STATISTICAL.
const STATISTICAL_SIGNALS = [
  /(?:my|i|i've|my\s+account|my\s+bank|my\s+spending|my\s+expense|my\s+income|my\s+saving|my\s+balance|my\s+transaction)/i,
  /(?:how\s+much|how\s+many|what\s+(?:is|was|were|are|did))\s+(?:i|my)/i,
  /(?:show|tell|give|fetch|get|display)\s+(?:me\s+)?(?:my|the|all|a|an)/i,
  /(?:last|this|past|previous)\s+(?:month|year|week|quarter|30\s*days|7\s*days|90\s*days|6\s*months)/i,
  /(?:january|february|march|april|may|june|july|august|september|october|november|december)\s*\d{4}/i,
  /\b20\d{2}\b/,
  /(?:biggest|largest|smallest|lowest|highest|maximum|minimum|average|avg|mean|top|most)\s+(?:transaction|expense|income|spend|category|payment|transfer|debit|credit)/i,
  /(?:total|sum|count|number)\s+(?:transaction|expense|income|debit|credit|spend|earning)/i,
  /(?:income|expense|saving|asset|liability|balance|net\s*worth|portfolio|transaction|category|bank\s*account|linked\s*account)\b/i,
  // Category spend queries — ANY phrasing
  /(?:spend(?:ing)?|spendings?|spent|expenditure|paid)\s+(?:on|in|for|at|towards?)\s+\w/i,
  /(?:spendings?|spend(?:ing)?)\s+in\s+\w/i,
  /what\s+(?:are|is)\s+(?:my\s+)?(?:spendings?|spend(?:ing)?|expenses?)\s+(?:in|on|for|at)\s+\w/i,
];

/**
 * Classify user query into routing lane.
 *
 * Rule: Default to STATISTICAL for any financial query.
 * Only send to LLM if the query explicitly needs external/real-world knowledge.
 */
function classifyQuery(query) {
  const trimmed = query.trim();

  // 0. OUT_OF_SCOPE guard — catch clearly non-finance queries FIRST
  //    Returns immediately with no LLM or DB call needed.
  const OUT_OF_SCOPE_PATTERNS = [
    // Food & cooking
    /\b(?:recipe|cook(?:ing)?|bake|baking|how\s+to\s+make|how\s+to\s+cook|ingredients?|dish|pasta|pizza|burger|biryani|curry|meal|kitchen)\b/i,
    // Entertainment & media
    /\b(?:movie|film|series|netflix|youtube|cricket|football|ipl|match|score|game|sport|song|music|playlist|actor|actress|celebrity|bollywood|hollywood)\b/i,
    // Health & fitness (non-financial)
    /\b(?:workout|exercise|gym|diet|calories|protein|yoga|meditation|sleep\s+tip|health\s+tip|weight\s+loss|lose\s+weight)\b/i,
    // Travel & lifestyle
    /\b(?:travel|vacation|holiday|tour|hotel|flight|visa|passport|weather|forecast)\b/i,
    // Technology (non-fintech)
    /\b(?:code|programming|javascript|python|java|html|css|debug|software|hardware|phone\s+review|laptop|gaming|minecraft)\b/i,
    // General knowledge / trivia
    /\b(?:history\s+of|who\s+is|who\s+was|capital\s+of|population\s+of|largest\s+country|how\s+tall|how\s+old|born\s+in|planet|space|science|chemistry|biology|physics)\b/i,
    // Jokes / casual
    /\b(?:joke|funny|meme|riddle|story|poem|quote|love|relationship|dating)\b/i,
  ];

  for (const pattern of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.info('InsightRouter → OUT_OF_SCOPE', { query: trimmed.slice(0, 60) });
      return { lane: 'OUT_OF_SCOPE', confidence: 1.0 };
    }
  }

  // 1. Check LLM-only patterns first — these MUST go to LLM
  for (const pattern of LLM_ONLY_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.info('InsightRouter → LLM_REALTIME', { query: trimmed.slice(0, 60) });
      return { lane: 'LLM_REALTIME', confidence: 0.9, matchedPattern: pattern.toString() };
    }
  }

  // 2. Check explicit statistical signals
  for (const pattern of STATISTICAL_SIGNALS) {
    if (pattern.test(trimmed)) {
      logger.info('InsightRouter → STATISTICAL (signal match)', { query: trimmed.slice(0, 60) });
      return { lane: 'STATISTICAL', confidence: 0.9, matchedPattern: pattern.toString() };
    }
  }

  // 3. Conversational greetings — let LLM handle
  if (/^(?:hi|hello|hey|how\s+are\s+you|who\s+are\s+you|what\s+can\s+you\s+do|good\s+morning|good\s+evening|good\s+afternoon|thanks?|thank\s+you|bye|goodbye)\b/i.test(trimmed)) {
    logger.info('InsightRouter → LLM_REALTIME (greeting)', { query: trimmed.slice(0, 60) });
    return { lane: 'LLM_REALTIME', confidence: 0.8, matchedPattern: 'greeting' };
  }

  // 4. Default: if it contains ANY finance-related word → STATISTICAL
  const hasFinanceWord = /(?:account|bank|finance|money|budget|spend|expense|income|save|salary|market|transaction|credit|debit|loan|emi|payment|transfer|amount|rupee|₹|balance|category|earning|saving|asset|liability|profit|loss|inflow|outflow|worth|net|total|bill|invoice|ledger)/i.test(trimmed);

  if (hasFinanceWord) {
    logger.info('InsightRouter → STATISTICAL (finance word default)', { query: trimmed.slice(0, 60) });
    return { lane: 'STATISTICAL', confidence: 0.7, matchedPattern: 'finance-word-default' };
  }

  // 5. Anything else with no finance signal — also OUT_OF_SCOPE
  logger.info('InsightRouter → OUT_OF_SCOPE (no finance signal)', { query: trimmed.slice(0, 60) });
  return { lane: 'OUT_OF_SCOPE', confidence: 0.9 };
}

// ─── Financial keyword blocklist — these are NOT category names ──────
const FINANCIAL_META_WORDS = new Set([
  'income', 'expense', 'expenses', 'saving', 'savings', 'balance',
  'asset', 'assets', 'liability', 'liabilities', 'total', 'net',
  'debit', 'credit', 'transaction', 'transactions', 'account', 'accounts',
  'financial', 'overview', 'summary', 'breakdown', 'worth', 'profit',
  'loss', 'earnings', 'inflow', 'outflow', 'budget', 'money', 'my',
  'overall', 'vs', 'versus', 'and', 'compared', 'the', 'a', 'an',
  'this', 'last', 'month', 'year', 'week', 'today', 'current', 'all',
  'every', 'each', 'spend', 'spending', 'spent',
]);

/**
 * Detect the specific sub-intent for routing to the right DB handler.
 *
 * Tier ordering is CRITICAL — specific intents must come before generic catch-alls.
 * The final fallback is UNIVERSAL_QUERY which parses anything dynamically.
 */
function detectStatisticalIntent(query) {
  const q = query.toLowerCase().trim();

  // ═══ TIER 1: Account queries ════════════════════════════════════════
  if (/(?:how\s*many|number\s*of|count|total)\s*(?:bank\s*)?(?:accounts?|linked|connected)/i.test(q)) {
    return 'ACCOUNT_COUNT';
  }
  if (/(?:list|show)\s*(?:my\s*)?(?:bank\s*)?accounts?\s*(?:added|linked|connected)?$/i.test(q) ||
      /(?:which|what)\s*(?:banks?|accounts?)\s*(?:are\s*)?(?:linked|connected|added)/i.test(q)) {
    return 'ACCOUNT_LIST';
  }
  if (/(?:bank\s*)?account\s*(?:summary|balance|balances|overview|details)/i.test(q) ||
      /(?:balance\s*in\s*(?:my\s*)?(?:bank|account))/i.test(q) ||
      /(?:how\s*much)\s*(?:do\s*i\s*have\s*in\s*(?:my|my\s*bank|account))/i.test(q) ||
      /(?:all\s*account|each\s*account|every\s*account)\s*balance/i.test(q)) {
    return 'BANK_ACCOUNT_SUMMARY';
  }

  // ═══ TIER 2: Income vs Expense comparison ════════════════════════════
  // MUST come before individual income/expense checks
  if (/income\s*(?:vs|versus|and|compared|or|&|against)\s*expense/i.test(q) ||
      /expense\s*(?:vs|versus|and|compared|or|&|against)\s*income/i.test(q) ||
      /(?:profit|loss)\s*(?:and\s*loss|account|statement)?$/i.test(q) ||
      /p\s*&\s*l|p\s*and\s*l/i.test(q)) {
    return 'INCOME_VS_EXPENSE';
  }

  // ═══ TIER 3: Savings — before individual income/expense ══════════════
  if (/(?:(?:my|total|net|overall)\s+)?savings?\b/i.test(q) ||
      /(?:how\s*much)\s*(?:did\s*i|have\s*i|i)\s*(?:save|saved)/i.test(q) ||
      /(?:am\s*i)\s*(?:saving|in\s*profit|in\s*loss|profitable)/i.test(q) ||
      /(?:net|total)\s*saving/i.test(q) ||
      /(?:money\s+(?:left|remaining|saved))/i.test(q)) {
    return 'TOTAL_SAVINGS';
  }

  // ═══ TIER 4: Net Worth ═══════════════════════════════════════════════
  if (/net\s*worth/i.test(q) ||
      /(?:what\s*(?:is|do)\s*i\s*(?:own|owe))/i.test(q) ||
      /(?:total\s*)?(?:wealth|net\s*value|financial\s*position)/i.test(q)) {
    return 'NET_WORTH';
  }

  // ═══ TIER 5: Assets / Liabilities — specific ════════════════════════
  if (/(?:my\s*)?(?:debt|debts|liabilit(?:y|ies)|loans?|emi|borrowed|owe|outstanding)/i.test(q) &&
      !/(?:what\s*is|define|meaning)/i.test(q)) {
    return 'LIABILITIES_ONLY';
  }
  if (/(?:my\s*)?(?:assets?)\b/i.test(q) &&
      !/(?:what\s*is|define|meaning)/i.test(q)) {
    return 'ASSETS_ONLY';
  }

  // ═══ TIER 6: Total Income ════════════════════════════════════════════
  if (/(?:total|overall|cumulative|my\s+total?|all\s+my)\s*(?:income|earning|inflow|revenue|salary)/i.test(q) ||
      /(?:how\s*much)\s*(?:(?:did\s+i|have\s+i|i)\s+)?(?:earn(?:ed)?|received?|got|made)/i.test(q) ||
      /(?:what|whats|what's)\s*(?:is\s*)?(?:my\s*)(?:income|earning|salary|revenue)/i.test(q) ||
      /(?:income|earning|salary|revenue)\s*(?:this|last|in|for|of|till)/i.test(q)) {
    return 'TOTAL_INCOME';
  }

  // ═══ TIER 7: Total Expense ═══════════════════════════════════════════
  if (/(?:total|overall|cumulative|my\s+total?|all\s+my)\s*(?:expense|spend(?:ing)?|outflow|payment|expenditure)/i.test(q) ||
      /(?:what|whats|what's)\s*(?:is\s*)?(?:my\s*)(?:total\s*)?(?:expense|spend(?:ing)?|expenditure)/i.test(q) ||
      /(?:how\s*much)\s*(?:(?:did\s+i|have\s+i|i)\s+)?(?:spend|spent|paid|pay(?:ed)?)/i.test(q)) {
    return 'TOTAL_EXPENSE';
  }

  // ═══ TIER 8: Top spending categories ════════════════════════════════
  if (/(?:highest|maximum|max|top|biggest|largest|most)\s*(?:spend(?:ing)?|expense|expenditure|category)/i.test(q) ||
      /(?:spend|spent)\s*(?:the\s+)?(?:most|maximum|highest)/i.test(q) ||
      /(?:where|which\s*(?:category|categories))\s*(?:did|do|am|is)\s*(?:i|my)\s*(?:spend|spending|spent)/i.test(q) ||
      /top\s*\d*\s*(?:categor|expense|spending)/i.test(q) ||
      /(?:category|categor(?:y|ies))\s*(?:wise|breakdown|split|distribution)/i.test(q) ||
      /(?:all|every|each)\s*(?:categor|expense|spend)/i.test(q) ||
      /(?:summary|breakdown)\s*(?:of\s*)?(?:my\s*)?(?:spending|expenses)/i.test(q)) {
    return 'TOP_SPENDING_CATEGORY';
  }

  // ═══ TIER 9: Specific single transaction extremes ════════════════════
  if (/(?:largest|biggest|highest|max(?:imum)?)\s*(?:single\s*)?(?:credit|income|inflow|earning|receipt|money\s+received)/i.test(q)) {
    return 'MAX_CREDIT';
  }
  if (/(?:minimum|min|smallest|lowest|least)\s*(?:transaction|spend(?:ing)?|expense|amount|debit|payment)/i.test(q)) {
    return 'MIN_TRANSACTION';
  }
  if (/(?:largest|biggest|highest|max(?:imum)?)\s*(?:single\s*)?(?:transaction|txn|debit|payment|expense|transfer|bill|purchase)/i.test(q) ||
      /(?:most\s+expensive|costliest|priciest)\s*(?:transaction|purchase|item|bill|payment)/i.test(q)) {
    return 'MAX_TRANSACTION';
  }

  // ═══ TIER 10: Average / Count ═══════════════════════════════════════
  if (/(?:average|avg|mean|per\s+transaction)\s*(?:transaction|spend(?:ing)?|expense|amount|debit|payment)/i.test(q) ||
      /(?:transaction|spend(?:ing)?|expense)\s*(?:average|avg|mean)/i.test(q)) {
    return 'AVG_TRANSACTION';
  }
  if (/(?:total|how\s*many|count|number\s*of)\s*(?:transactions?|txn|debits?|credits?)/i.test(q) ||
      /(?:transaction|txn)\s*(?:count|total|number|volume)/i.test(q)) {
    return 'TRANSACTION_COUNT';
  }

  // ═══ TIER 11: Date-period summaries ══════════════════════════════════
  if (/(?:yearly|annual)\s*(?:summary|breakdown|report|overview|total)/i.test(q) ||
      /(?:summary|breakdown|report|overview|total)\s*(?:for\s*)?(?:the\s*)?(?:year|annual)/i.test(q) ||
      /(?:year\s*on\s*year|yoy)/i.test(q)) {
    return 'YEARLY_SUMMARY';
  }
  if (/(?:monthly|month\s*on\s*month|mom)\s*(?:spend(?:ing)?|summary|breakdown|trend|report)/i.test(q) ||
      /(?:spent|spend|income|expense)\s*(?:this|last)\s*month/i.test(q) ||
      /last\s*month\b/i.test(q)) {
    return 'MONTHLY_SUMMARY';
  }

  // ═══ TIER 12: Recent transactions ════════════════════════════════════
  if (/(?:recent|latest|last\s*\d+|latest\s*\d+)\s*(?:transactions?|txn|payments?|purchases?|expenses?|debits?|credits?)/i.test(q) ||
      /(?:show|list|get)\s*(?:my\s*)?(?:last\s*\d+|recent|latest)\s*(?:transactions?|txn)/i.test(q)) {
    return 'RECENT_TRANSACTIONS';
  }

  // ═══ TIER 13: Specific category spend ════════════════════════════════
  // Catches any phrasing like:
  //   "spendings in food", "what are my expenses in healthcare",
  //   "how much on dining", "food expense", "spend on travel"
  let catMatch =
    q.match(/(?:spend(?:ing)?|spendings?|spent|expense|expenditure|paid|pay)\s+(?:on|in|for|at|towards?)\s+([a-z][a-z\s&/,'-]{1,40})/i) ||
    q.match(/(?:what\s+(?:are|is)\s+)?(?:my\s+)?(?:spendings?|spend(?:ing)?|expenses?)\s+(?:in|on|for|at|towards?)\s+([a-z][a-z\s&/,'-]{1,40})/i) ||
    q.match(/(?:on|in|for|at|towards?)\s+([a-z][a-z\s&/,'-]{1,30})\s+(?:spend(?:ing)?|spendings?|expense|expenditure|payment)/i) ||
    q.match(/([a-z][a-z\s&/,'-]{1,30})\s+(?:expense|spend(?:ing)?|spendings?|expenditure|bill|cost|payment)/i) ||
    q.match(/(?:expense|spend(?:ing)?|spendings?)\s+(?:of|in|on)\s+([a-z][a-z\s&/,'-]{1,30})/i) ||
    q.match(/(?:how\s+much)\s+(?:do\s+i\s+)?(?:spend|spent|pay|paid)\s+(?:on|for|in)\s+([a-z][a-z\s&/,'-]{1,40})/i);

  if (catMatch) {
    let extracted = (catMatch[1] || catMatch[2] || '').trim().toLowerCase();
    // Strip trailing date/time noise
    extracted = extracted.replace(/\b(this|last|in|for|of|overall|total|all|my|past|20\d{2}|month|year|week|today)\b.*$/i, '').trim();
    const words = extracted.split(/\s+/).filter(Boolean);
    const allMeta = words.length > 0 && words.every(w => FINANCIAL_META_WORDS.has(w));
    if (extracted.length > 1 && !allMeta) {
      return 'SPECIFIC_CATEGORY_SPEND';
    }
  }

  // ═══ TIER 14: Balance / Overview ══════════════════════════════════════
  if (/(?:balance|balances)\b/i.test(q) ||
      /(?:financial|money|finance)\s*(?:overview|summary|snapshot|status|position|health|report)/i.test(q) ||
      /(?:how\s*much)\s*(?:do\s*i\s*have|money\s+do\s+i|savings?\s+do\s+i)/i.test(q) ||
      /(?:show|give|tell)\s*(?:me\s*)?(?:my\s*)?(?:overview|financial\s+summary)/i.test(q) ||
      /\boverview\b/i.test(q)) {
    return 'BALANCE_OVERVIEW';
  }

  // ═══ TIER 15: UNIVERSAL_QUERY — the intelligent catch-all ════════════
  // Handles anything not explicitly matched above. The agent will parse
  // the query semantically and return the best-fit answer from the DB.
  return 'UNIVERSAL_QUERY';
}

module.exports = { classifyQuery, detectStatisticalIntent };
