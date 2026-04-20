/**
 * Statistical Agent — DB-powered financial insight engine
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  ACCURACY CONTRACT  (must mirror Overview.jsx exactly)             ║
 * ║  Income  = CREDIT transactions on INCOME-type accounts             ║
 * ║  Expense = DEBIT  transactions on EXPENSE-type accounts            ║
 * ║  Assets / Liabilities = ledger_entries cumulative balances         ║
 * ║  Reversals (debit on INCOME / credit on EXPENSE) → excluded        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

const supabase = require('../config/supabaseClient');
const logger   = require('../utils/logger');

// ─── Catch-all account name filter ──────────────────────────────────
const CATCH_ALL_EXACT = new Set([
  'uncategorized','uncategorised','unclassified expenses','unclassified assets',
  'unclassified','suspense','suspense account','opening balance','opening bal',
  'temporary','temp','temp account','other','others','miscellaneous','misc',
  'undefined','unknown','general','assets','liabilities','income','expenses',
  'equity','current assets','fixed assets','non-current assets',
  'current liabilities','long-term liabilities','non-current liabilities',
]);

function isCatchAll(name) {
  if (!name) return true;
  const l = name.toLowerCase().trim();
  if (CATCH_ALL_EXACT.has(l)) return true;
  return l.includes('uncategor') || l.includes('unclassif') ||
         l.includes('suspense')  || l.includes('opening bal') ||
         l.includes('temp');
}

// Skip contra + uncategorised rows (same as dashboard)
function baseFilter(q) {
  return q.neq('is_contra', true).neq('is_uncategorised', true);
}

// ─── Month map ────────────────────────────────────────────────────────
const MON = {
  january:0,jan:0,february:1,feb:1,march:2,mar:2,april:3,apr:3,
  may:4,june:5,jun:5,july:6,jul:6,august:7,aug:7,
  september:8,sep:8,sept:8,october:9,oct:9,november:10,nov:10,december:11,dec:11,
};

function pad2(n) { return String(n).padStart(2,'0'); }
function dateStr(y,m1,d) { return `${y}-${pad2(m1)}-${pad2(d)}`; }

// ─── Currency formatters ─────────────────────────────────────────────
const INR  = v => `₹${Math.abs(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const INRr = v => `₹${Math.abs(v).toLocaleString('en-IN',{maximumFractionDigits:0})}`;

// ════════════════════════════════════════════════════════════════════════
// DATE FILTER — supports every natural language date form
// ════════════════════════════════════════════════════════════════════════
function extractDateFilter(q) {
  if (!q) return { from:null, to:null, label:'Overall' };
  const s = q.toLowerCase().trim();
  const now = new Date();
  const cy = now.getFullYear(), cm = now.getMonth();

  // "jan 2025", "january 2025", "jan month 2025"
  const mnRe = /(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s*(?:month)?\s*(\d{4})/i;
  const mn = s.match(mnRe);
  if (mn) {
    const mi = MON[mn[1].toLowerCase()], yr = +mn[2], m1 = mi+1;
    const ld = new Date(yr,mi+1,0).getDate();
    const isCur = cy===yr && cm===mi;
    const fullN = Object.keys(MON).find(k=>MON[k]===mi&&k.length>3)||mn[1];
    return { from:dateStr(yr,m1,1), to:dateStr(yr,m1,isCur?now.getDate():ld),
             label: isCur?'This Month':`${fullN[0].toUpperCase()+fullN.slice(1)} ${yr}` };
  }

  // "04/2025"
  const mmyy = s.match(/\b(\d{1,2})\/(\d{4})\b/);
  if (mmyy) {
    const mi=+mmyy[1]-1, yr=+mmyy[2];
    if (mi>=0&&mi<=11) {
      const m1=mi+1, ld=new Date(yr,mi+1,0).getDate(), isCur=cy===yr&&cm===mi;
      return { from:dateStr(yr,m1,1), to:dateStr(yr,m1,isCur?now.getDate():ld),
               label:isCur?'This Month':`${pad2(m1)}/${yr}` };
    }
  }

  // "2025-04"
  const yymm = s.match(/\b(\d{4})-(\d{1,2})\b/);
  if (yymm) {
    const yr=+yymm[1], mi=+yymm[2]-1;
    if (yr>2000&&mi>=0&&mi<=11) {
      const m1=mi+1, ld=new Date(yr,mi+1,0).getDate(), isCur=cy===yr&&cm===mi;
      return { from:dateStr(yr,m1,1), to:dateStr(yr,m1,isCur?now.getDate():ld),
               label:isCur?'This Month':`${yr}-${pad2(m1)}` };
    }
  }

  // "15/04/2025"
  const dmy = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (dmy) {
    const d=+dmy[1],m=+dmy[2],y=+dmy[3];
    if (m>=1&&m<=12&&d>=1&&d<=31) { const ds=dateStr(y,m,d); return {from:ds,to:ds,label:ds}; }
  }

  // Relative keywords (ordered longest→shortest)
  if (/this\s*month/i.test(s)) {
    const m1=cm+1;
    return {from:dateStr(cy,m1,1),to:dateStr(cy,m1,now.getDate()),label:'This Month'};
  }
  if (/last\s*month/i.test(s)) {
    const lm=cm===0?11:cm-1, ly=cm===0?cy-1:cy, m1=lm+1, ld=new Date(ly,lm+1,0).getDate();
    const fn=Object.keys(MON).find(k=>MON[k]===lm&&k.length>3)||String(m1);
    return {from:dateStr(ly,m1,1),to:dateStr(ly,m1,ld),label:`Last Month (${fn[0].toUpperCase()+fn.slice(1)} ${ly})`};
  }
  if (/this\s*week/i.test(s)||/last\s*7\s*days/i.test(s)||/past\s*7\s*days/i.test(s)) {
    return {from:new Date(Date.now()-7*864e5).toISOString().slice(0,10),to:null,label:'Last 7 Days'};
  }
  if (/last\s*30\s*days/i.test(s)||/past\s*30\s*days/i.test(s)) {
    return {from:new Date(Date.now()-30*864e5).toISOString().slice(0,10),to:null,label:'Last 30 Days'};
  }
  if (/last\s*3\s*months/i.test(s)||/past\s*3\s*months/i.test(s)||/last\s*90\s*days/i.test(s)) {
    return {from:new Date(Date.now()-90*864e5).toISOString().slice(0,10),to:null,label:'Last 3 Months'};
  }
  if (/last\s*6\s*months/i.test(s)||/past\s*6\s*months/i.test(s)||/last\s*180\s*days/i.test(s)) {
    return {from:new Date(Date.now()-180*864e5).toISOString().slice(0,10),to:null,label:'Last 6 Months'};
  }
  if (/last\s*year/i.test(s)) {
    const ly=cy-1;
    return {from:dateStr(ly,1,1),to:dateStr(ly,12,31),label:`Last Year (${ly})`};
  }
  if (/this\s*year/i.test(s)||/last\s*12\s*months/i.test(s)) {
    return {from:dateStr(cy,1,1),to:null,label:'This Year'};
  }
  if (/last\s*quarter/i.test(s)||/this\s*quarter/i.test(s)) {
    return {from:new Date(Date.now()-90*864e5).toISOString().slice(0,10),to:null,label:'Last Quarter'};
  }

  // Standalone year "2024", "in 2024"
  const yrOnly = s.match(/\b(20\d{2})\b/);
  if (yrOnly) {
    const yr=+yrOnly[1];
    return {from:dateStr(yr,1,1),to:yr===cy?null:dateStr(yr,12,31),label:yr===cy?'This Year':`Year ${yr}`};
  }

  return {from:null,to:null,label:'Overall'};
}

// ════════════════════════════════════════════════════════════════════════
// CORE: computePnL — mirrors Overview.jsx logic exactly
// ════════════════════════════════════════════════════════════════════════
async function computePnL(userId, from, to) {
  let q = supabase
    .from('transactions')
    .select('transaction_id,amount,details,transaction_date,transaction_type,accounts!transactions_offset_account_id_fkey(account_name,account_type)')
    .eq('user_id', userId);
  if (from) q = q.gte('transaction_date', from);
  if (to)   q = q.lte('transaction_date', to);
  q = baseFilter(q);

  const { data, error } = await q;
  if (error) throw error;

  let totalIncome = 0, totalExpense = 0;
  const incomeMap = {}, expenseMap = {};
  const incomeTxns = [], expenseTxns = [];

  (data || []).forEach(txn => {
    const name = txn.accounts?.account_name;
    const aType = txn.accounts?.account_type;
    if (isCatchAll(name)) return;
    const amt = Number(txn.amount || 0);

    if (aType === 'INCOME' && txn.transaction_type === 'CREDIT') {
      totalIncome += amt;
      incomeMap[name] = (incomeMap[name]||0) + amt;
      incomeTxns.push(txn);
    } else if (aType === 'EXPENSE' && txn.transaction_type === 'DEBIT') {
      totalExpense += amt;
      expenseMap[name] = (expenseMap[name]||0) + amt;
      expenseTxns.push(txn);
    }
  });

  return { totalIncome, totalExpense, incomeMap, expenseMap, incomeTxns, expenseTxns, raw: data||[] };
}

// ════════════════════════════════════════════════════════════════════════
// CORE: computeBalanceSheet — Assets & Liabilities from ledger_entries
// ════════════════════════════════════════════════════════════════════════
async function computeBalanceSheet(userId) {
  const { data: entries, error } = await supabase
    .from('ledger_entries')
    .select('debit_amount,credit_amount,account:account_id(account_id,account_name,account_type,balance_nature)')
    .eq('user_id', userId);
  if (error) throw error;

  const map = {};
  (entries||[]).forEach(e => {
    if (!e.account) return;
    const { account_id:id, account_name:name, account_type:type, balance_nature:bn } = e.account;
    if (!['ASSET','LIABILITY'].includes(type)) return;
    if (!map[id]) map[id] = { name, type, bn, dr:0, cr:0 };
    map[id].dr += e.debit_amount  || 0;
    map[id].cr += e.credit_amount || 0;
  });

  let totalAssets=0, totalLiabilities=0;
  const assets=[], liabilities=[];

  Object.values(map).forEach(a => {
    const bal = a.bn==='DEBIT' ? a.dr-a.cr : a.cr-a.dr;
    if (a.type==='ASSET') { totalAssets+=bal; if(Math.abs(bal)>0) assets.push({name:a.name,amount:bal}); }
    else { totalLiabilities+=bal; if(Math.abs(bal)>0) liabilities.push({name:a.name,amount:bal}); }
  });

  assets.sort((a,b)=>b.amount-a.amount);
  liabilities.sort((a,b)=>b.amount-a.amount);
  return { totalAssets, totalLiabilities, assets, liabilities };
}

// ════════════════════════════════════════════════════════════════════════
// HANDLER DISPATCH
// ════════════════════════════════════════════════════════════════════════
async function handleStatisticalQuery(subIntent, userId, originalQuery) {
  logger.info('StatAgent', { subIntent, userId: userId?.slice(0,8) });
  switch (subIntent) {
    case 'ACCOUNT_COUNT':           return hAccountCount(userId);
    case 'ACCOUNT_LIST':            return hAccountList(userId);
    case 'BANK_ACCOUNT_SUMMARY':    return hBankSummary(userId);
    case 'INCOME_VS_EXPENSE':       return hIncomeVsExpense(userId, originalQuery);
    case 'TOTAL_INCOME':            return hTotalIncome(userId, originalQuery);
    case 'TOTAL_EXPENSE':           return hTotalExpense(userId, originalQuery);
    case 'TOTAL_SAVINGS':           return hTotalSavings(userId, originalQuery);
    case 'NET_WORTH':               return hNetWorth(userId);
    case 'ASSETS_ONLY':             return hAssetsOnly(userId);
    case 'LIABILITIES_ONLY':        return hLiabilitiesOnly(userId);
    case 'BALANCE_OVERVIEW':        return hBalanceOverview(userId);
    case 'TOP_SPENDING_CATEGORY':   return hTopCategories(userId, originalQuery);
    case 'SPECIFIC_CATEGORY_SPEND': return hSpecificCategory(userId, originalQuery);
    case 'MAX_TRANSACTION':         return hMaxTransaction(userId, originalQuery);
    case 'MIN_TRANSACTION':         return hMinTransaction(userId, originalQuery);
    case 'MAX_CREDIT':              return hMaxCredit(userId, originalQuery);
    case 'AVG_TRANSACTION':         return hAvgTransaction(userId, originalQuery);
    case 'TRANSACTION_COUNT':       return hTransactionCount(userId, originalQuery);
    case 'MONTHLY_SUMMARY':         return hMonthlySummary(userId, originalQuery);
    case 'YEARLY_SUMMARY':          return hYearlySummary(userId);
    case 'RECENT_TRANSACTIONS':     return hRecentTransactions(userId, originalQuery);
    case 'UNIVERSAL_QUERY':
    default:                        return hUniversalQuery(userId, originalQuery);
  }
}

// ════════════════════════════════════════════════════════════════════════
// HANDLERS
// ════════════════════════════════════════════════════════════════════════

async function hAccountCount(userId) {
  const { data:accs, error:e1 } = await supabase
    .from('accounts').select('account_id').eq('user_id',userId).eq('account_type','ASSET').eq('is_active',true);
  if (e1) throw e1;
  const ids = (accs||[]).map(a=>a.account_id);
  if (!ids.length) return {text:"You haven't linked any bank accounts yet. Head to the **Accounts** page! 🏦", data:{count:0}};

  const { data:idents, error:e2 } = await supabase
    .from('account_identifiers').select('institution_name,account_number_last4,card_last4,wallet_id')
    .eq('user_id',userId).eq('is_active',true).in('account_id',ids);
  if (e2) throw e2;

  const count = (idents||[]).length;
  const insts = [...new Set((idents||[]).map(i=>i.institution_name).filter(Boolean))];
  const banks = (idents||[]).filter(i=>i.account_number_last4).length;
  const cards = (idents||[]).filter(i=>i.card_last4).length;
  const wallets=(idents||[]).filter(i=>i.wallet_id).length;

  let text = `🏦 You have **${count} linked account${count!==1?'s':''}**.`;
  if (insts.length) text += `\n\n📋 Institutions: ${insts.join(', ')}`;
  const bd=[]; if(banks) bd.push(`${banks} Bank${banks>1?'s':''}`); if(cards) bd.push(`${cards} Card${cards>1?'s':''}`); if(wallets) bd.push(`${wallets} Wallet${wallets>1?'s':''}`);
  if(bd.length) text += `\n📊 Breakdown: ${bd.join(' • ')}`;
  return {text, data:{count,institutions:insts,banks,cards,wallets}};
}

async function hAccountList(userId) {
  const { data:accs, error:e1 } = await supabase
    .from('accounts').select('account_id,account_name').eq('user_id',userId).eq('account_type','ASSET').eq('is_active',true);
  if (e1) throw e1;
  if (!accs?.length) return {text:"No accounts found. Add some from the **Accounts** page! 🏦", data:[]};

  const ids = accs.map(a=>a.account_id);
  const { data:idents } = await supabase
    .from('account_identifiers').select('account_id,institution_name,account_number_last4,card_last4,wallet_id')
    .eq('user_id',userId).in('account_id',ids);

  const imap = {}; (idents||[]).forEach(i=>{ imap[i.account_id]=i; });
  const lines = accs.map((a,i) => {
    const id=imap[a.account_id];
    const inst=id?.institution_name||a.account_name;
    const last4=id?.account_number_last4?`····${id.account_number_last4}`:id?.card_last4?`····${id.card_last4} (Card)`:id?.wallet_id?`Wallet`:'-';
    return `  ${i+1}. 🏦 **${inst}** — ${last4}`;
  });
  return {text:`📋 **Your Linked Accounts (${accs.length}):**\n\n${lines.join('\n')}`, data:accs};
}

async function hBankSummary(userId) {
  const { data:accs } = await supabase
    .from('accounts').select('account_id,account_name,balance_nature').eq('user_id',userId).eq('account_type','ASSET').eq('is_active',true);
  if (!accs?.length) return {text:"No asset accounts found.", data:[]};

  const ids=accs.map(a=>a.account_id);
  const [{ data:idents },{ data:ledger }] = await Promise.all([
    supabase.from('account_identifiers').select('account_id,institution_name,account_number_last4,card_last4').eq('user_id',userId).in('account_id',ids),
    supabase.from('ledger_entries').select('account_id,debit_amount,credit_amount').eq('user_id',userId).in('account_id',ids),
  ]);

  const imap={},lmap={};
  (idents||[]).forEach(i=>{ imap[i.account_id]=i; });
  (ledger||[]).forEach(e=>{ if(!lmap[e.account_id])lmap[e.account_id]={dr:0,cr:0}; lmap[e.account_id].dr+=e.debit_amount||0; lmap[e.account_id].cr+=e.credit_amount||0; });

  let total=0;
  const lines=accs.map((a,i)=>{
    const l=lmap[a.account_id]||{dr:0,cr:0};
    const bal=a.balance_nature==='DEBIT'?l.dr-l.cr:l.cr-l.dr;
    total+=bal;
    const id=imap[a.account_id];
    const inst=id?.institution_name||a.account_name;
    const last4=id?.account_number_last4?` ····${id.account_number_last4}`:id?.card_last4?` ····${id.card_last4}`:'';
    return `  ${i+1}. ${bal>=0?'🟢':'🔴'} **${inst}**${last4}: **${INR(bal)}**`;
  });

  return {text:`🏦 **Bank Account Summary:**\n\n${lines.join('\n')}\n\n💰 **Total Assets: ${INR(total)}**`, data:{accounts:accs.length,totalBalance:total}};
}

async function hIncomeVsExpense(userId, q) {
  const {from,to,label}=extractDateFilter(q);
  const {totalIncome:inc,totalExpense:exp}=await computePnL(userId,from,to);
  if(!inc&&!exp) return {text:`No categorized transactions found for **${label}**.`, data:null};
  const net=inc-exp, rate=inc>0?((net/inc)*100).toFixed(1):'0.0';
  return {
    text:`💰 **Income vs Expense (${label}):**\n\n  🟢 Income: **${INR(inc)}**\n  🔴 Expenses: **${INR(exp)}**\n  ${net>=0?'✅':'⚠️'} Net: **${INR(net)}**\n  📈 Savings Rate: **${rate}%**`,
    data:{income:inc,expense:exp,net,savingsRate:rate}
  };
}

async function hTotalIncome(userId, q) {
  const {from,to,label}=extractDateFilter(q);
  const {totalIncome,incomeMap}=await computePnL(userId,from,to);
  if(!totalIncome) return {text:`No categorized income found for **${label}**.`, data:null};
  const sorted=Object.entries(incomeMap).sort((a,b)=>b[1]-a[1]);
  const lines=sorted.slice(0,5).map(([c,a],i)=>`  ${i+1}. **${c}** — ${INRr(a)} (${((a/totalIncome)*100).toFixed(1)}%)`);
  return {
    text:`🟢 **Total Income (${label}): ${INR(totalIncome)}**\n\n**Sources:**\n${lines.join('\n')}\n\n_${sorted.length} income categor${sorted.length===1?'y':'ies'}_`,
    data:{totalIncome,breakdown:sorted}
  };
}

async function hTotalExpense(userId, q) {
  const {from,to,label}=extractDateFilter(q);
  const {totalExpense,expenseMap}=await computePnL(userId,from,to);
  if(!totalExpense) return {text:`No categorized expenses found for **${label}**.`, data:null};
  const sorted=Object.entries(expenseMap).sort((a,b)=>b[1]-a[1]);
  const lines=sorted.slice(0,5).map(([c,a],i)=>`  ${i+1}. **${c}** — ${INRr(a)} (${((a/totalExpense)*100).toFixed(1)}%)`);
  return {
    text:`🔴 **Total Expense (${label}): ${INR(totalExpense)}**\n\n**Top Categories:**\n${lines.join('\n')}\n\n_${sorted.length} expense categor${sorted.length===1?'y':'ies'}_`,
    data:{totalExpense,breakdown:sorted}
  };
}

async function hTotalSavings(userId, q) {
  const {from,to,label}=extractDateFilter(q);
  const {totalIncome:inc,totalExpense:exp}=await computePnL(userId,from,to);
  const sav=inc-exp, rate=inc>0?((sav/inc)*100).toFixed(1):'0.0';
  let text=`💰 **Your Savings (${label}):**\n\n  🟢 Income: **${INR(inc)}**\n  🔴 Expense: **${INR(exp)}**\n  ${sav>=0?'✅':'⚠️'} **Net Savings: ${INR(sav)}**\n  📈 Savings Rate: **${rate}%**\n\n`;
  if(sav>0) text+=`_Great! You're saving ${rate}% of your income._`;
  else if(sav===0) text+=`_Breaking even — income = expense._`;
  else text+=`_⚠️ Overspending by ${INR(Math.abs(sav))}. Review your expenses._`;
  return {text, data:{income:inc,expense:exp,savings:sav,savingsRate:rate}};
}

async function hNetWorth(userId) {
  const bs=await computeBalanceSheet(userId);
  const nw=bs.totalAssets-bs.totalLiabilities;
  let text=`🏛️ **Net Worth:**\n\n  🏦 Total Assets: **${INR(bs.totalAssets)}**\n  📋 Total Liabilities: **${INR(bs.totalLiabilities)}**\n  ${nw>=0?'✅':'⚠️'} **Net Worth: ${INR(nw)}**\n\n`;
  text+=nw>0?`_Assets exceed liabilities — you're in a strong position!_`:nw===0?`_Assets equal liabilities._`:`_⚠️ Liabilities exceed assets by ${INR(Math.abs(nw))}._`;
  return {text, data:{totalAssets:bs.totalAssets,totalLiabilities:bs.totalLiabilities,netWorth:nw}};
}

async function hAssetsOnly(userId) {
  const bs=await computeBalanceSheet(userId);
  let text=`🏦 **Total Assets: ${INR(bs.totalAssets)}**\n\n`;
  if(bs.assets.length){
    text+=`**Breakdown:**\n`;
    bs.assets.forEach((a,i)=>{ const p=bs.totalAssets>0?((a.amount/bs.totalAssets)*100).toFixed(1):0; text+=`  ${i+1}. ${a.name}: **${INR(a.amount)}** (${p}%)\n`; });
  } else text+=`_No asset accounts found._`;
  return {text, data:{totalAssets:bs.totalAssets,breakdown:bs.assets}};
}

async function hLiabilitiesOnly(userId) {
  const bs=await computeBalanceSheet(userId);
  let text=`📋 **Total Liabilities: ${INR(bs.totalLiabilities)}**\n\n`;
  if(bs.liabilities.length){ text+=`**Breakdown:**\n`; bs.liabilities.forEach((l,i)=>{ text+=`  ${i+1}. ${l.name}: **${INR(l.amount)}**\n`; }); }
  else text+=`_No liabilities found. You're debt-free! 🎉_`;
  return {text, data:{totalLiabilities:bs.totalLiabilities,breakdown:bs.liabilities}};
}

async function hBalanceOverview(userId) {
  const [{totalIncome:inc,totalExpense:exp}, bs] = await Promise.all([
    computePnL(userId,null,null),
    computeBalanceSheet(userId),
  ]);
  const net=inc-exp;
  let text=`📊 **Financial Overview:**\n\n`;
  text+=`  🟢 Total Income: **${INR(inc)}**\n`;
  text+=`  🔴 Total Expense: **${INR(exp)}**\n`;
  text+=`  💰 Net Savings: **${INR(net)}** ${net>=0?'✅':'⚠️'}\n\n`;
  text+=`  🏦 Total Assets: **${INR(bs.totalAssets)}**\n`;
  text+=`  📋 Total Liabilities: **${INR(bs.totalLiabilities)}**\n`;
  text+=`  🏛️ Net Worth: **${INR(bs.totalAssets-bs.totalLiabilities)}**\n`;
  if(bs.assets.length){ text+=`\n**Top Assets:**\n`; bs.assets.slice(0,3).forEach(a=>{ text+=`  • ${a.name}: ${INR(a.amount)}\n`; }); }
  if(bs.liabilities.length){ text+=`\n**Top Liabilities:**\n`; bs.liabilities.slice(0,3).forEach(l=>{ text+=`  • ${l.name}: ${INR(l.amount)}\n`; }); }
  return {text, data:{totalIncome:inc,totalExpense:exp,netSavings:net,totalAssets:bs.totalAssets,totalLiabilities:bs.totalLiabilities}};
}

async function hTopCategories(userId, q) {
  const {from,to,label}=extractDateFilter(q);
  const {totalExpense,expenseMap}=await computePnL(userId,from,to);
  if(!Object.keys(expenseMap).length) return {text:`No categorized expense data found for **${label}**.`, data:[]};
  const sorted=Object.entries(expenseMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const lines=sorted.map(([c,a],i)=>`  ${i+1}. **${c}** — ${INRr(a)} (${((a/totalExpense)*100).toFixed(1)}%)`);
  return {
    text:`🔥 **Top Spending Categories (${label}):**\n\n${lines.join('\n')}\n\n💰 Total: ${INRr(totalExpense)}`,
    data:sorted
  };
}

async function hSpecificCategory(userId, q) {
  const {from,to,label}=extractDateFilter(q);

  // ── Extract the category keyword from the query ──────────────────────
  let catRaw =
    (q.match(/(?:spend(?:ing)?|spent|expense|paid|pay|spendings?)\s+(?:on|in|for|at|towards?)\s+([a-z][a-z\s&/,'-]{1,40})/i)||[])[1] ||
    (q.match(/(?:on|in|for|at|towards?)\s+([a-z][a-z\s&/,'-]{1,30})\s+(?:spend(?:ing)?|expense|payment)/i)||[])[1] ||
    (q.match(/(?:expense|spend(?:ing)?|spendings?)\s+(?:of|in|on)\s+([a-z][a-z\s&/,'-]{1,30})/i)||[])[1] ||
    (q.match(/(?:spend(?:ing)?|spendings?)\s+(?:in|on)?\s*([a-z][a-z\s&/,'-]{1,40})$/i)||[])[1];

  // Fallback: strip known verbs and extract noun phrase
  if (!catRaw) {
    const stripped = q.toLowerCase()
      .replace(/^(what|what's|how much|show|tell|give|get|list|display)\s+(are|is|my|the|I|was|do I|did I|has|have|me|were)?\s*/i, '')
      .replace(/\b(spending|spendings|spend|spent|expense|expenses|expenditure|paid|payment)\b/ig, '')
      .replace(/\b(in|on|for|at|towards|overall|total|all|my|this|last|month|year|week|today)\b/ig, '')
      .trim();
    if (stripped && stripped.length > 1) catRaw = stripped;
  }

  if (!catRaw) return hTopCategories(userId, q);

  const catClean = catRaw.trim().toLowerCase()
    .replace(/\b(this|last|in|for|of|overall|total|all|my|past|20\d{2}|month|year|week|today)\b.*$/i, '')
    .trim();

  if (!catClean || catClean.length < 2) return hTopCategories(userId, q);

  const {expenseMap} = await computePnL(userId, from, to);

  // ── Token-based similarity scoring ──────────────────────────────────
  // Split into word tokens, score by overlap — prevents "food" → "Healthcare"
  const queryTokens = new Set(catClean.split(/\s+/).filter(w => w.length > 1));

  let bestMatch = null, bestScore = 0;

  Object.entries(expenseMap).forEach(([name, amt]) => {
    const dbTokens = new Set(name.toLowerCase().split(/[\s&/,'-]+/).filter(w => w.length > 1));

    let overlap = 0;
    queryTokens.forEach(t => { if (dbTokens.has(t)) overlap++; });

    // Partial substring match bonus: "food" → "food & dining"
    let substringBonus = 0;
    queryTokens.forEach(t => {
      if (t.length >= 3) {
        dbTokens.forEach(d => { if (d.includes(t) || t.includes(d)) substringBonus += 0.5; });
      }
    });

    const score = overlap + substringBonus;
    if (score > bestScore) { bestScore = score; bestMatch = { name, amt }; }
  });

  // Require at least 0.5 score to prevent wild mismatches
  if (!bestMatch || bestScore < 0.5) {
    return {
      text: `No expenses found matching **"${catClean}"** for **${label}**.\n\nTry: _"What are my top spending categories?"_ to see all available categories.`,
      data: []
    };
  }

  return {
    text: `🍲 **Expense in "${bestMatch.name}" (${label}):**\n\n  🔴 **${INRr(bestMatch.amt)}**`,
    data: { category: bestMatch.name, total: bestMatch.amt }
  };
}


async function hMaxTransaction(userId, q) {
  const {from,to,label}=extractDateFilter(q);
  let query=supabase.from('transactions')
    .select('amount,details,transaction_date,transaction_type,accounts!transactions_offset_account_id_fkey(account_name,account_type)')
    .eq('user_id',userId).eq('transaction_type','DEBIT');
  if(from) query=query.gte('transaction_date',from);
  if(to)   query=query.lte('transaction_date',to);
  query=baseFilter(query).order('amount',{ascending:false}).limit(30);
  const {data,error}=await query; if(error) throw error;
  const txn=(data||[]).find(t=>t.accounts?.account_type==='EXPENSE'&&!isCatchAll(t.accounts?.account_name));
  if(!txn) return {text:`No categorized expense found for **${label}**.`, data:null};
  const d=new Date(txn.transaction_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  return {text:`💸 **Largest Single Expense (${label}):**\n\n  • Amount: **${INR(+txn.amount)}**\n  • Category: ${txn.accounts?.account_name||'N/A'}\n  • Details: ${txn.details||'N/A'}\n  • Date: ${d}`, data:txn};
}

async function hMaxCredit(userId, q) {
  const {from,to,label}=extractDateFilter(q);
  let query=supabase.from('transactions')
    .select('amount,details,transaction_date,transaction_type,accounts!transactions_offset_account_id_fkey(account_name,account_type)')
    .eq('user_id',userId).eq('transaction_type','CREDIT');
  if(from) query=query.gte('transaction_date',from);
  if(to)   query=query.lte('transaction_date',to);
  query=baseFilter(query).order('amount',{ascending:false}).limit(30);
  const {data,error}=await query; if(error) throw error;
  const txn=(data||[]).find(t=>t.accounts?.account_type==='INCOME'&&!isCatchAll(t.accounts?.account_name));
  if(!txn) return {text:`No categorized income found for **${label}**.`, data:null};
  const d=new Date(txn.transaction_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  return {text:`💚 **Largest Income Transaction (${label}):**\n\n  • Amount: **${INR(+txn.amount)}**\n  • Category: ${txn.accounts?.account_name||'N/A'}\n  • Details: ${txn.details||'N/A'}\n  • Date: ${d}`, data:txn};
}

async function hMinTransaction(userId, q) {
  const {from,to,label}=extractDateFilter(q);
  let query=supabase.from('transactions')
    .select('amount,details,transaction_date,transaction_type,accounts!transactions_offset_account_id_fkey(account_name,account_type)')
    .eq('user_id',userId).eq('transaction_type','DEBIT').gt('amount',0);
  if(from) query=query.gte('transaction_date',from);
  if(to)   query=query.lte('transaction_date',to);
  query=baseFilter(query).order('amount',{ascending:true}).limit(30);
  const {data,error}=await query; if(error) throw error;
  const txn=(data||[]).find(t=>t.accounts?.account_type==='EXPENSE'&&!isCatchAll(t.accounts?.account_name));
  if(!txn) return {text:`No categorized expense found for **${label}**.`, data:null};
  const d=new Date(txn.transaction_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  return {text:`🔍 **Smallest Expense (${label}):**\n\n  • Amount: **${INR(+txn.amount)}**\n  • Category: ${txn.accounts?.account_name||'N/A'}\n  • Details: ${txn.details||'N/A'}\n  • Date: ${d}`, data:txn};
}

async function hAvgTransaction(userId, q) {
  const {from,to,label}=extractDateFilter(q);
  const {totalExpense,expenseTxns}=await computePnL(userId,from,to);
  if(!expenseTxns.length) return {text:`No categorized expenses found for **${label}**.`, data:null};
  const avg=totalExpense/expenseTxns.length;
  return {text:`📈 **Average Expense (${label}): ${INR(avg)}**\n\nBased on **${expenseTxns.length.toLocaleString()}** expense transactions.`, data:{average:avg,count:expenseTxns.length}};
}

async function hTransactionCount(userId, q) {
  const {from,to,label}=extractDateFilter(q);
  const {incomeTxns,expenseTxns}=await computePnL(userId,from,to);
  const total=incomeTxns.length+expenseTxns.length;
  if(!total) return {text:`No categorized transactions found for **${label}**.`, data:{total:0,label}};
  return {
    text:`📊 **Transaction Count (${label}):**\n\n  • Total: **${total.toLocaleString()}**\n  • 🔴 Expenses: ${expenseTxns.length.toLocaleString()}\n  • 🟢 Income: ${incomeTxns.length.toLocaleString()}`,
    data:{total,debits:expenseTxns.length,credits:incomeTxns.length,label}
  };
}

async function hMonthlySummary(userId, q) {
  const {from,to,label}=extractDateFilter(q);
  const filterFrom=from||new Date(Date.now()-90*864e5).toISOString().slice(0,10);
  const dispLabel=from?label:'Last 3 Months';

  let query=supabase.from('transactions')
    .select('amount,transaction_date,transaction_type,accounts!transactions_offset_account_id_fkey(account_name,account_type)')
    .eq('user_id',userId).gte('transaction_date',filterFrom);
  if(to) query=query.lte('transaction_date',to);
  query=baseFilter(query);
  const {data,error}=await query; if(error) throw error;

  const monthMap={};
  (data||[]).forEach(txn=>{
    const name=txn.accounts?.account_name, aType=txn.accounts?.account_type;
    if(isCatchAll(name)) return;
    const month=new Date(txn.transaction_date).toLocaleDateString('en-IN',{month:'short',year:'numeric'});
    if(!monthMap[month]) monthMap[month]={income:0,expense:0};
    if(aType==='INCOME'&&txn.transaction_type==='CREDIT') monthMap[month].income+=+(txn.amount||0);
    else if(aType==='EXPENSE'&&txn.transaction_type==='DEBIT') monthMap[month].expense+=+(txn.amount||0);
  });

  if(!Object.keys(monthMap).length) return {text:`No categorized transactions in **${dispLabel}**.`, data:null};

  const lines=Object.entries(monthMap).map(([m,{income,expense}])=>{
    const net=income-expense;
    return `  📅 **${m}:** Income: ${INRr(income)} | Expense: ${INRr(expense)} | Net: ${net>=0?'✅':'⚠️'} ${INRr(net)}`;
  });
  return {text:`📊 **Monthly Summary (${dispLabel}):**\n\n${lines.join('\n')}`, data:monthMap};
}

async function hYearlySummary(userId) {
  const {incomeTxns,expenseTxns}=await computePnL(userId,null,null);
  const all=[...incomeTxns,...expenseTxns];
  if(!all.length) return {text:`No categorized transactions found.`, data:null};

  const yearMap={};
  all.forEach(txn=>{
    const yr=new Date(txn.transaction_date).getFullYear();
    if(!yearMap[yr]) yearMap[yr]={income:0,expense:0};
    if(txn.accounts?.account_type==='INCOME'&&txn.transaction_type==='CREDIT') yearMap[yr].income+=+(txn.amount||0);
    else if(txn.accounts?.account_type==='EXPENSE'&&txn.transaction_type==='DEBIT') yearMap[yr].expense+=+(txn.amount||0);
  });

  const lines=Object.keys(yearMap).sort().map(yr=>{
    const {income,expense}=yearMap[yr], net=income-expense;
    return `  📅 **${yr}:** Income: ${INRr(income)} | Expense: ${INRr(expense)} | Net: ${net>=0?'✅':'⚠️'} ${INRr(net)}`;
  });
  return {text:`📊 **Yearly Summary:**\n\n${lines.join('\n')}`, data:yearMap};
}

async function hRecentTransactions(userId, q) {
  const numMatch=q.match(/\b(\d+)\b/);
  const limit=Math.min(numMatch?+numMatch[1]:5,10);

  let query=supabase.from('transactions')
    .select('amount,details,transaction_date,transaction_type,accounts!transactions_offset_account_id_fkey(account_name,account_type)')
    .eq('user_id',userId);
  query=baseFilter(query).order('transaction_date',{ascending:false}).limit(limit*4);
  const {data,error}=await query; if(error) throw error;

  const valid=(data||[]).filter(t=>!isCatchAll(t.accounts?.account_name)).slice(0,limit);
  if(!valid.length) return {text:`No recent categorized transactions found.`, data:[]};

  const lines=valid.map((t,i)=>{
    const d=new Date(t.transaction_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
    const icon=t.transaction_type==='CREDIT'?'🟢':'🔴';
    return `  ${i+1}. ${icon} **${INR(+t.amount)}** — ${t.details||t.accounts?.account_name||'N/A'} (${d})`;
  });
  return {text:`📋 **Last ${valid.length} Transactions:**\n\n${lines.join('\n')}`, data:valid};
}

// ════════════════════════════════════════════════════════════════════════
// UNIVERSAL QUERY — the intelligent catch-all
//
// When none of the specific intents match, this handler:
//   1. Extracts any date context from the query
//   2. Detects what the user wants (income, expense, savings, category, etc.)
//   3. Fetches all P&L data for that period
//   4. Returns the most relevant answer
//
// This means the user can ask in ANY phrasing and still get accurate data.
// ════════════════════════════════════════════════════════════════════════
async function hUniversalQuery(userId, q) {
  const {from, to, label} = extractDateFilter(q);
  const ql = q.toLowerCase();

  // ── Detect what the user wants ──────────────────────────────────────
  const wantsIncome   = /\b(income|earn(?:ed|ing|s)?|receiv(?:ed|ing)|salary|salaries|inflow|revenue|got paid|credit(?:s|ed)?)\b/i.test(ql);
  const wantsExpense  = /\b(expense|spend(?:ing|t)?|paid|pay(?:ment|ments)?|outflow|debit(?:s|ed)?|expenditure|cost(?:s)?|bill(?:s)?|purchase(?:s)?)\b/i.test(ql);
  const wantsSavings  = /\b(sav(?:ing|ings|ed)?|net|left(?:\s+over)?|remaining|profit|surplus|after\s+expenses?)\b/i.test(ql);
  const wantsCategory = /\b(categor(?:y|ies)|breakdown|split|distribution|where|which)\b/i.test(ql);
  const wantsCount    = /\b(how\s*many|count|number\s*of|total\s*number|volume)\b/i.test(ql);
  const wantsMax      = /\b(biggest|largest|highest|maximum|max(?:imum)?|most\s+expensive|costliest)\b/i.test(ql);
  const wantsMin      = /\b(smallest|lowest|minimum|min(?:imum)?|least|cheapest)\b/i.test(ql);
  const wantsAvg      = /\b(average|avg|mean|per\s+month|monthly\s+average)\b/i.test(ql);
  const wantsRecent   = /\b(recent|latest|last\s+\d+|just|today)\b/i.test(ql);
  const wantsBalance  = /\b(balance|how\s*much\s*(?:do\s*i\s*)?have|worth|net\s*worth|asset|liabilit)\b/i.test(ql);

  // Try to fetch PnL data for the detected period
  const {totalIncome, totalExpense, incomeMap, expenseMap, incomeTxns, expenseTxns} = await computePnL(userId, from, to);
  const total = totalIncome + totalExpense;

  // ── Route to specific answer based on signals ───────────────────────

  // Balance / net worth requested
  if (wantsBalance && !wantsIncome && !wantsExpense) {
    const bs = await computeBalanceSheet(userId);
    const nw = bs.totalAssets - bs.totalLiabilities;
    return {
      text: `🏦 **Financial Position (${label}):**\n\n  🏦 Assets: **${INR(bs.totalAssets)}**\n  📋 Liabilities: **${INR(bs.totalLiabilities)}**\n  ${nw>=0?'✅':'⚠️'} Net Worth: **${INR(nw)}**\n\n  🟢 P&L Income: **${INR(totalIncome)}**\n  🔴 P&L Expense: **${INR(totalExpense)}**\n  💰 Savings: **${INR(totalIncome-totalExpense)}**`,
      data: {totalAssets:bs.totalAssets,totalLiabilities:bs.totalLiabilities,netWorth:nw,totalIncome,totalExpense}
    };
  }

  // Just income requested
  if (wantsIncome && !wantsExpense && !wantsSavings) {
    if (!totalIncome) return {text:`No categorized income found for **${label}**.`, data:null};
    const sorted=Object.entries(incomeMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const lines=sorted.map(([c,a],i)=>`  ${i+1}. **${c}** — ${INRr(a)}`);
    return {text:`🟢 **Income (${label}): ${INR(totalIncome)}**\n\n${lines.join('\n')}`, data:{totalIncome,breakdown:sorted}};
  }

  // Just expense requested
  if (wantsExpense && !wantsIncome && !wantsSavings) {
    if (!totalExpense) return {text:`No categorized expenses found for **${label}**.`, data:null};
    const sorted=Object.entries(expenseMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const lines=sorted.map(([c,a],i)=>`  ${i+1}. **${c}** — ${INRr(a)}`);
    return {text:`🔴 **Expense (${label}): ${INR(totalExpense)}**\n\n${lines.join('\n')}`, data:{totalExpense,breakdown:sorted}};
  }

  // Category breakdown
  if (wantsCategory) {
    return hTopCategories(userId, q);
  }

  // Transaction count
  if (wantsCount) {
    return hTransactionCount(userId, q);
  }

  // Max expense
  if (wantsMax) {
    return hMaxTransaction(userId, q);
  }

  // Min expense
  if (wantsMin) {
    return hMinTransaction(userId, q);
  }

  // Average
  if (wantsAvg) {
    return hAvgTransaction(userId, q);
  }

  // Recent
  if (wantsRecent) {
    return hRecentTransactions(userId, q);
  }

  // Savings specifically
  if (wantsSavings) {
    return hTotalSavings(userId, q);
  }

  // No data at all
  if (!total) {
    return {
      text: `No categorized financial data found for **${label}**.\n\nHere are some things you can ask:\n  • _"What's my total income this year?"_\n  • _"How much did I spend last month?"_\n  • _"What's my biggest expense?"_\n  • _"Show my savings"_\n  • _"Top spending categories"_`,
      data: null
    };
  }

  // Default: complete summary for the period
  const net = totalIncome - totalExpense;
  const rate = totalIncome > 0 ? ((net/totalIncome)*100).toFixed(1) : '0.0';
  const topExp = Object.entries(expenseMap).sort((a,b)=>b[1]-a[1]).slice(0,3);

  let text = `📊 **Financial Summary (${label}):**\n\n`;
  text += `  🟢 Income: **${INR(totalIncome)}**\n`;
  text += `  🔴 Expense: **${INR(totalExpense)}**\n`;
  text += `  💰 Net Savings: **${INR(net)}** ${net>=0?'✅':'⚠️'}\n`;
  text += `  📈 Savings Rate: **${rate}%**\n`;
  if (topExp.length) {
    text += `\n**Top Expenses:**\n`;
    topExp.forEach(([c,a],i)=>{ text+=`  ${i+1}. ${c}: ${INRr(a)}\n`; });
  }
  return {text, data:{income:totalIncome,expense:totalExpense,savings:net,savingsRate:rate}};
}

/**
 * Gather a comprehensive financial persona for the user.
 * Used by the AI to provide personalized tax tips and smart insights.
 */
async function getFinancialPersona(userId) {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const [pnl, bs] = await Promise.all([
      computePnL(userId, ninetyDaysAgo, null),
      computeBalanceSheet(userId)
    ]);

    const income = pnl.totalIncome;
    const expense = pnl.totalExpense;
    const topCategories = Object.entries(pnl.expenseMap)
      .sort((a,b) => b[1]-a[1])
      .slice(0, 5)
      .map(([name, val]) => `${name}: ${INRr(val)}`);

    // Detect specific tax-saving indicators
    const rentScan = pnl.expenseTxns.filter(t => /rent|house|accommodation|flat|apartment/i.test(t.details || '') || t.accounts?.account_name?.toLowerCase().includes('rent'));
    const rentAmount = rentScan.reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const investmentScan = pnl.expenseTxns.filter(t => /elss|ppf|nps|mutual fund|insurance|premium|investment|lic/i.test(t.details || '') || /investment|insurance/i.test(t.accounts?.account_name?.toLowerCase()));
    const investmentAmount = investmentScan.reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const recurringScan = pnl.expenseTxns.reduce((acc, t) => {
      const key = (t.details || '').slice(0, 15);
      if (key.length > 3) {
        acc[key] = (acc[key] || 0) + 1;
      }
      return acc;
    }, {});
    const commonRecurring = Object.entries(recurringScan)
      .filter(([_, count]) => count >= 2)
      .slice(0, 5)
      .map(([name]) => name.trim());

    return {
      period: "Last 90 Days",
      income: INRr(income),
      expense: INRr(expense),
      savingsRate: income > 0 ? (( (income-expense)/income ) * 100).toFixed(1) + "%" : "0%",
      netWorth: INRr(bs.totalAssets - bs.totalLiabilities),
      topSpending: topCategories,
      potentialTaxLeaks: {
        rentPaid: INRr(rentAmount),
        investmentsLogged: INRr(investmentAmount),
        suggestHRA: rentAmount > 0,
        suggest80C: investmentAmount < 37500, // 37.5k in 3 months is ~1.5L annual
      },
      recurringPatterns: commonRecurring,
      insightsCount: pnl.expenseTxns.length
    };
  } catch (err) {
    logger.error('getFinancialPersona error:', err);
    return null;
  }
}

module.exports = { handleStatisticalQuery, getFinancialPersona };
