const supabase = require('../config/supabaseClient');
const { upsertExactCache, upsertVectorCache, isGarbage } = require('../services/personalCacheService');
const rulesEngineService = require('../services/rulesEngineService');

/**
 * Helper to build ledger entries for an approved transaction.
 * Returns an array of objects to be inserted into 'ledger_entries'.
 */
function buildLedgerRows(txn, userId) {
  const { transaction_id, base_account_id, offset_account_id, amount, transaction_type, transaction_date, is_contra } = txn;

  // For a contra, skip the mirror CREDIT leg
  if (is_contra && transaction_type === 'CREDIT') {
    return [];
  }

  if (!transaction_id || !base_account_id || !offset_account_id || !amount) {
    console.warn(`⚠️ Missing required fields for txn ${transaction_id}`);
    return [];
  }

  const entries = transaction_type === 'DEBIT'
    ? [
        { account_id: offset_account_id, debit_amount: amount,  credit_amount: 0 },
        { account_id: base_account_id,   debit_amount: 0,        credit_amount: amount }
      ]
    : [
        { account_id: base_account_id,   debit_amount: amount,  credit_amount: 0 },
        { account_id: offset_account_id, debit_amount: 0,        credit_amount: amount }
      ];

  return entries.map(e => ({
    transaction_id,
    account_id: e.account_id,
    debit_amount: e.debit_amount,
    credit_amount: e.credit_amount,
    entry_date: transaction_date,
    user_id: userId
  }));
}

/**
 * Creates double-entry ledger entries for an approved transaction.
 * Every transaction produces exactly 2 ledger entries.
 * 
 * For a DEBIT (money out from base account):
 *   - DEBIT  the offset account (expense goes up)
 *   - CREDIT the base account   (asset goes down)
 *
 * For a CREDIT (money in to base account):
 *   - DEBIT  the base account   (asset goes up)
 *   - CREDIT the offset account (income goes up)
 */
async function createLedgerEntries(transactionId, baseAccountId, offsetAccountId, amount, transactionType, transactionDate, isContra, userId) {
  const rows = buildLedgerRows({
    transaction_id: transactionId,
    base_account_id: baseAccountId,
    offset_account_id: offsetAccountId,
    amount,
    transaction_type: transactionType,
    transaction_date: transactionDate,
    is_contra: isContra
  }, userId);

  if (rows.length === 0) return;

  const { error } = await supabase.from('ledger_entries').insert(rows);
  if (error) {
    if (error.code === '23505') {
      // Unique constraint violation — already processed, safe to ignore
      console.warn(`⚠️ Duplicate skipped for txn ${transactionId}: ledger entries already created`);
      return;
    }
    console.error(`❌ Failed to create ledger entries for txn ${transactionId}:`, error);
  } else {
    console.log(`✅ Ledger entries created for txn ${transactionId}`);
  }
}

/**
 * recategorizeTransaction(req, res)
 * Updates a transaction with a new offset_account_id and marks as MANUAL.
 * Resets review_status to PENDING since the category changed.
 * Enforces user ownership.
 */
async function recategorizeTransaction(req, res) {
  try {
    const transactionId = req.params.id;
    const { offset_account_id } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User authentication failed.' });
    }

    if (!transactionId || offset_account_id === undefined || offset_account_id === null) {
      return res.status(400).json({ error: 'Missing transactionId or offset_account_id.' });
    }

    // Check if the new account is uncategorised
    const { data: newAccount } = await supabase
      .from('accounts')
      .select('account_name')
      .eq('account_id', offset_account_id)
      .single();

    const isUncategorised = newAccount?.account_name === 'Uncategorised Expense' ||
                           newAccount?.account_name === 'Uncategorised Income';

    // Update with user_id constraint to ensure ownership
    const { error } = await supabase
      .from('transactions')
      .update({
        offset_account_id: offset_account_id,
        categorised_by: 'MANUAL',
        review_status: 'PENDING',
        is_uncategorised: isUncategorised
      })
      .eq('transaction_id', transactionId)
      .eq('user_id', userId);

    if (error) {
      console.error('Recategorize transaction error:', error);
      return res.status(500).json({ error: 'Failed to recategorize transaction.' });
    }

    // Fetch the just-updated transaction to get match fields (include details for rules engine fallback)
    const { data: updatedTxn } = await supabase
      .from('transactions')
      .select('extracted_id, transaction_type, offset_account_id, details')
      .eq('transaction_id', transactionId)
      .eq('user_id', userId)
      .single();

    let similarTransactions = [];
    let suggestedAccount = null;

    if (updatedTxn) {
      const { transaction_type, offset_account_id, details } = updatedTxn;

      // If extracted_id wasn't stored (e.g. was dumped before bulkController fix),
      // re-run the rules engine on `details` to recover the merchant key.
      let extracted_id = updatedTxn.extracted_id;
      if (!extracted_id && details) {
        const rulesResult = rulesEngineService.evaluateTransaction(details);
        if (rulesResult.hasRuleMatch && rulesResult.extractedId) {
          extracted_id = rulesResult.extractedId;
        }
      }

      // Fetch account name for suggestedAccount
      const { data: suggestedAccountData } = await supabase
        .from('accounts')
        .select('account_id, account_name')
        .eq('account_id', offset_account_id)
        .single();

      suggestedAccount = suggestedAccountData || null;

      // Build match condition
      let similarQuery = supabase
        .from('transactions')
        .select(`
          transaction_id,
          amount,
          transaction_type,
          transaction_date,
          details,
          extracted_id,
          offset_account_id,
          attention_level,
          current_account:offset_account_id (
            account_id,
            account_name
          )
        `)
        .eq('user_id', userId)
        .eq('review_status', 'PENDING')
        .eq('transaction_type', transaction_type)
        .neq('transaction_id', transactionId);

      // Priority 1: match on extracted_id (from DB or recovered via rules engine) — covers all
      //             pending txns with the same merchant key regardless of categorisation state.
      // Priority 2: fallback to same offset_account_id, HIGH/MEDIUM attention only,
      //             and already-categorised rows (more conservative since less precise).
      if (extracted_id) {
        similarQuery = similarQuery.eq('extracted_id', extracted_id);
      } else {
        similarQuery = similarQuery
          .eq('offset_account_id', offset_account_id)
          .eq('is_uncategorised', false)
          .in('attention_level', ['HIGH', 'MEDIUM']);
      }

      const { data: similar } = await similarQuery.limit(20);
      similarTransactions = similar || [];
    }

    return res.status(200).json({
      success: true,
      similarTransactions,
      suggestedAccount
    });
  } catch (err) {
    console.error('Unexpected error in recategorizeTransaction:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * approveTransaction(req, res)
 * Updates a transaction to mark as approved and posted.
 * Sets review_status to APPROVED and posting_status to POSTED.
 * Enforces user ownership.
 */
async function approveTransaction(req, res) {
  try {
    const transactionId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User authentication failed.' });
    }

    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transactionId.' });
    }

    // Check if transaction uses uncategorised fallback account
    const { data: txnCheck } = await supabase
      .from('transactions')
      .select('offset_account_id, accounts!transactions_offset_account_id_fkey(account_name)')
      .eq('transaction_id', transactionId)
      .eq('user_id', userId)
      .single();

    if (txnCheck?.accounts?.account_name === 'Uncategorised Expense' ||
        txnCheck?.accounts?.account_name === 'Uncategorised Income') {
      return res.status(400).json({
        error: 'Cannot approve: transaction uses uncategorised account. Please assign a category first.'
      });
    }

    // Update with user_id constraint to ensure ownership
    const { error } = await supabase
      .from('transactions')
      .update({
        review_status: 'APPROVED',
        posting_status: 'POSTED'
      })
      .eq('transaction_id', transactionId)
      .eq('user_id', userId);

    if (error) {
      if (error.code === '23505') {
        // Unique constraint violation — already processed, safe to ignore
        console.warn(`⚠️ Duplicate skipped for txn ${transactionId}: already approved`);
        return res.status(200).json({ success: true, note: 'already_approved' });
      }
      console.error('Approve transaction error:', error);
      return res.status(500).json({ error: 'Failed to approve transaction.' });
    }

    // Phase 1 Response — return early
    res.status(200).json({ success: true });

    // Phase 2: Background processing (Ledger entries + Caching)
    setImmediate(async () => {
      try {
        const { data: txnData } = await supabase
          .from('transactions')
          .select('transaction_id, base_account_id, offset_account_id, amount, transaction_type, transaction_date, is_contra, details, clean_merchant_name, extracted_id')
          .eq('transaction_id', transactionId)
          .eq('user_id', userId)
          .single();

        if (txnData) {
          await createLedgerEntries(
            txnData.transaction_id,
            txnData.base_account_id,
            txnData.offset_account_id,
            txnData.amount,
            txnData.transaction_type,
            txnData.transaction_date,
            txnData.is_contra || false,
            userId
          );

          if (!txnData.is_contra) {
            if (txnData.extracted_id) {
              await upsertExactCache(userId, txnData.extracted_id, txnData.offset_account_id);
            } else {
              const nameToCache = txnData.clean_merchant_name || txnData.details;
              await upsertVectorCache(userId, nameToCache, txnData.offset_account_id);
            }
          }
        }
      } catch (bgError) {
        console.error(`❌ Background processing failed for txn ${transactionId}:`, bgError);
      }
    });

  } catch (err) {
    console.error('Unexpected error in approveTransaction:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * bulkApproveTransactions(req, res)
 * Updates multiple transactions to mark as approved and posted.
 * Expects req.body.transaction_ids = array of transaction_ids
 * Enforces user ownership.
 */
async function bulkApproveTransactions(req, res) {
  try {
    const { transaction_ids } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User authentication failed.' });
    }

    if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return res.status(400).json({ error: 'transaction_ids must be a non-empty array.' });
    }

    // Check if any transaction uses uncategorised fallback account
    const { data: uncategorisedCheck } = await supabase
      .from('transactions')
      .select('transaction_id, accounts!transactions_offset_account_id_fkey(account_name)')
      .in('transaction_id', transaction_ids)
      .eq('user_id', userId);

    const blockedIds = uncategorisedCheck?.filter(txn =>
      txn.accounts?.account_name === 'Uncategorised Expense' ||
      txn.accounts?.account_name === 'Uncategorised Income'
    ).map(txn => txn.transaction_id) || [];

    // Filter out blocked IDs from the approval list
    const approvableIds = transaction_ids.filter(id => !blockedIds.includes(id));

    if (approvableIds.length === 0) {
      return res.status(400).json({
        error: 'Cannot approve: all transactions use uncategorised accounts.',
        blocked_transaction_ids: blockedIds,
        approved_count: 0
      });
    }

    // Update only approvable transactions
    const { error, data } = await supabase
      .from('transactions')
      .update({
        review_status: 'APPROVED',
        posting_status: 'POSTED'
      })
      .in('transaction_id', approvableIds)
      .eq('user_id', userId)
      .select('transaction_id');

    if (error) {
      if (error.code === '23505') {
        // Unique constraint violation — already processed, safe to ignore
        console.warn(`⚠️ Duplicate skipped for bulk txns: already approved`);
        return res.status(200).json({ success: true, note: 'already_approved' });
      }
      console.error('Bulk approve transactions error:', error);
      return res.status(500).json({ error: 'Failed to approve transactions.' });
    }

    const approvedCount = data ? data.length : 0;
    const blockedCount = blockedIds.length;

    // Phase 1 Response — respond immediately after update succeeds
    if (blockedCount > 0) {
      res.status(200).json({
        success: true,
        approved_count: approvedCount,
        blocked_count: blockedCount,
        blocked_transaction_ids: blockedIds,
        message: `${approvedCount} transactions approved. ${blockedCount} transactions require categorisation.`
      });
    } else {
      res.status(200).json({ success: true, approved_count: approvedCount });
    }

    // Phase 2: Background processing
    const approvedIds = data ? data.map(t => t.transaction_id) : [];
    if (approvedIds.length > 0) {
      setImmediate(async () => {
        try {
          const { data: txnRows } = await supabase
            .from('transactions')
            .select('transaction_id, base_account_id, offset_account_id, amount, transaction_type, transaction_date, details, clean_merchant_name, is_contra, extracted_id')
            .in('transaction_id', approvedIds)
            .eq('user_id', userId);

          if (!txnRows || txnRows.length === 0) return;

          // Build ALL ledger entries rows in one pass
          const allLedgerRows = [];
          for (const txn of txnRows) {
            const entries = buildLedgerRows(txn, userId);
            allLedgerRows.push(...entries);
          }

          // Insert ALL ledger rows in a single supabase call
          if (allLedgerRows.length > 0) {
            const { error: ledgerError } = await supabase.from('ledger_entries').insert(allLedgerRows);
            if (ledgerError) console.error('Background bulk ledger insert failed:', ledgerError);
          }

          // Run all cache upserts in parallel
          await Promise.all(txnRows.map(txn => {
            if (txn.is_contra) return Promise.resolve();
            if (txn.extracted_id) {
              return upsertExactCache(userId, txn.extracted_id, txn.offset_account_id);
            }
            const name = txn.clean_merchant_name || txn.details;
            return upsertVectorCache(userId, name, txn.offset_account_id);
          }));

          console.log(`✅ Background bulk approval complete for ${txnRows.length} transactions`);
        } catch (bgError) {
          console.error('❌ Background bulk approve processing failed:', bgError);
        }
      });
    }
  } catch (err) {
    console.error('Unexpected error in bulkApproveTransactions:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * manualCategorizeTransaction(req, res)
 * Creates a new transaction row from an uncategorized transaction.
 * User manually selects the offset_account_id.
 * Transaction is created as APPROVED and POSTED.
 * Enforces user ownership.
 */
async function manualCategorizeTransaction(req, res) {
  try {
    const { uncategorized_transaction_id, offset_account_id } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User authentication failed.' });
    }

    if (!uncategorized_transaction_id || !offset_account_id) {
      return res.status(400).json({ error: 'Missing uncategorized_transaction_id or offset_account_id.' });
    }

    // Fetch the uncategorized transaction row
    const { data: uncatData, error: uncatError } = await supabase
      .from('uncategorized_transactions')
      .select('account_id, document_id, txn_date, details, debit, credit')
      .eq('uncategorized_transaction_id', uncategorized_transaction_id)
      .eq('user_id', userId)
      .single();

    if (uncatError || !uncatData) {
      console.error('Failed to fetch uncategorized transaction:', uncatError);
      return res.status(404).json({ error: 'Uncategorized transaction not found.' });
    }

    // Create transaction row
    const { error: insertError } = await supabase
      .from('transactions')
      .insert([{
        user_id: userId,
        base_account_id: uncatData.account_id,
        offset_account_id: offset_account_id,
        document_id: uncatData.document_id,
        transaction_date: uncatData.txn_date,
        details: uncatData.details,
        amount: uncatData.debit || uncatData.credit,
        transaction_type: uncatData.debit > 0 ? 'DEBIT' : 'CREDIT',
        categorised_by: 'MANUAL',
        confidence_score: 1.00,
        posting_status: 'POSTED',
        review_status: 'APPROVED',
        attention_level: 'LOW',
        uncategorized_transaction_id: uncategorized_transaction_id
      }]);

    if (insertError) {
      if (insertError.code === '23505') {
        // Unique constraint violation — already processed, safe to ignore
        console.warn(`⚠️ Duplicate skipped for uncategorized txn ${uncategorized_transaction_id}: already categorized`);
        return res.status(200).json({ success: true, note: 'already_approved' });
      }
      console.error('Failed to create transaction:', insertError);
      return res.status(500).json({ error: 'Failed to save categorization.' });
    }

    // Fetch the newly created transaction to get its generated ID
    const { data: newTxn } = await supabase
      .from('transactions')
      .select('transaction_id, base_account_id, offset_account_id, amount, transaction_type, transaction_date, extracted_id')
      .eq('uncategorized_transaction_id', uncategorized_transaction_id)
      .eq('user_id', userId)
      .single();

    let similarTransactions = [];
    let suggestedAccount = null;

    if (newTxn) {
      await createLedgerEntries(
        newTxn.transaction_id,
        newTxn.base_account_id,
        newTxn.offset_account_id,
        newTxn.amount,
        newTxn.transaction_type,
        newTxn.transaction_date,
        false,
        userId
      );

      // Fetch account name for suggestedAccount
      const { data: suggestedAccountData } = await supabase
        .from('accounts')
        .select('account_id, account_name')
        .eq('account_id', newTxn.offset_account_id)
        .single();

      suggestedAccount = suggestedAccountData || null;

      // Re-run rules engine on raw details — used for both similar-txn matching
      // and cache seeding below. Runs once here and shared between both sections.
      const rawDetails = uncatData.details || '';
      const rulesResult = rulesEngineService.evaluateTransaction(rawDetails);

      // If extracted_id wasn't stored (e.g. was dumped before bulkController fix),
      // recover it now from the rules engine so the similar-txn query can use it.
      let effectiveExtractedId = newTxn.extracted_id;
      if (!effectiveExtractedId && rulesResult.hasRuleMatch && rulesResult.extractedId) {
        effectiveExtractedId = rulesResult.extractedId;
      }

      // Build match condition for similar transactions
      let similarQuery = supabase
        .from('transactions')
        .select(`
          transaction_id,
          amount,
          transaction_type,
          transaction_date,
          details,
          extracted_id,
          offset_account_id,
          attention_level,
          current_account:offset_account_id (
            account_id,
            account_name
          )
        `)
        .eq('user_id', userId)
        .eq('review_status', 'PENDING')
        .eq('transaction_type', newTxn.transaction_type)
        .neq('transaction_id', newTxn.transaction_id);

      // Priority 1: match on extracted_id (from DB or recovered via rules engine) — covers all
      //             pending txns with the same merchant key regardless of categorisation state.
      // Priority 2: fallback to same offset_account_id, HIGH/MEDIUM attention only,
      //             and already-categorised rows (more conservative since less precise).
      if (effectiveExtractedId) {
        similarQuery = similarQuery.eq('extracted_id', effectiveExtractedId);
      } else {
        similarQuery = similarQuery
          .eq('offset_account_id', newTxn.offset_account_id)
          .eq('is_uncategorised', false)
          .in('attention_level', ['HIGH', 'MEDIUM']);
      }

      const { data: similar } = await similarQuery.limit(20);
      similarTransactions = similar || [];

      // Seed personal cache — rulesResult already computed above
      // Cover both EXACT_THEN_DUMP (paytmqr, bharatpe etc.) and VECTOR_SEARCH rules
      if (rulesResult.hasRuleMatch && rulesResult.extractedId &&
          (rulesResult.strategy === 'EXACT_THEN_DUMP' || rulesResult.strategy === 'VECTOR_SEARCH')) {
        // Store the extracted ID in exact cache
        console.log(`💾 Storing in exact cache: "${rulesResult.extractedId}" for transaction: "${rawDetails}"`);
        await upsertExactCache(userId, rulesResult.extractedId, newTxn.offset_account_id);
      } else if (isGarbage(rawDetails)) {
        // Store raw garbage string in exact cache
        console.log(`💾 Storing garbage in exact cache: "${rawDetails.trim()}"`);
        await upsertExactCache(userId, rawDetails.trim(), newTxn.offset_account_id);
      } else {
        // Store the raw details (or clean_merchant_name) directly in vector cache
        // NER has been removed — Regex Cleaner in the bulk pipeline handles cleaning
        const cleanName = rawDetails;
        console.log(`💾 Storing in vector cache: "${cleanName}" for transaction: "${rawDetails}"`);
        await upsertVectorCache(userId, cleanName, newTxn.offset_account_id);
      }
    }

    return res.status(200).json({
      success: true,
      similarTransactions,
      suggestedAccount
    });
  } catch (err) {
    console.error('Unexpected error in manualCategorizeTransaction:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * correctTransaction(req, res)
 * Corrects the amount and/or transaction_type (DEBIT/CREDIT) of a parsed transaction.
 *
 * Strategy: Clean Slate
 *   1. Guard against POSTED and contra transactions.
 *   2. Delete ledger_entries (FK must go first).
 *   3. Delete the transactions row.
 *   4. Update uncategorized_transactions with corrected values and reset to PENDING.
 *
 * The transaction will reappear in the uncategorized queue for re-categorization.
 */
async function correctTransaction(req, res) {
  try {
    const { uncategorized_transaction_id } = req.params;
    const { amount, transaction_type } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User authentication failed.' });
    }

    // Input validation
    if (!uncategorized_transaction_id) {
      return res.status(400).json({ error: 'Missing uncategorized_transaction_id.' });
    }
    if (amount === undefined && transaction_type === undefined) {
      return res.status(400).json({ error: 'At least one of amount or transaction_type must be provided.' });
    }
    if (amount !== undefined && (isNaN(amount) || Number(amount) <= 0)) {
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }
    if (transaction_type !== undefined && !['DEBIT', 'CREDIT'].includes(transaction_type)) {
      return res.status(400).json({ error: 'transaction_type must be DEBIT or CREDIT.' });
    }

    // ── 1. Fetch the existing transactions row ─────────────────────────────────
    const { data: existingTxn, error: fetchError } = await supabase
      .from('transactions')
      .select('transaction_id, posting_status, is_contra, amount, transaction_type')
      .eq('uncategorized_transaction_id', uncategorized_transaction_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      console.error('correctTransaction fetch error:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch transaction.' });
    }

    if (existingTxn) {
      // Guard: Block edits on POSTED transactions
      if (existingTxn.posting_status === 'POSTED') {
        return res.status(403).json({
          error: 'Cannot correct a POSTED transaction. Posted entries are locked. Please raise a manual reversal.'
        });
      }

      // Guard: Block edits on contra-paired transactions
      if (existingTxn.is_contra) {
        return res.status(403).json({
          error: 'Cannot correct a contra-paired transaction. Edit both legs manually.'
        });
      }

      // ── 2. Delete ledger_entries first (FK constraint) ──────────────────────
      const { error: ledgerDeleteError } = await supabase
        .from('ledger_entries')
        .delete()
        .eq('transaction_id', existingTxn.transaction_id);

      if (ledgerDeleteError) {
        console.error('correctTransaction ledger delete error:', ledgerDeleteError);
        return res.status(500).json({ error: 'Failed to remove ledger entries.' });
      }

      // ── 3. Delete the transactions row ─────────────────────────────────────
      const { error: txnDeleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('transaction_id', existingTxn.transaction_id)
        .eq('user_id', userId);

      if (txnDeleteError) {
        console.error('correctTransaction txn delete error:', txnDeleteError);
        return res.status(500).json({ error: 'Failed to remove transaction.' });
      }
    }
    // If no transactions row exists yet (still PENDING), we still correct the source.

    // ── 4. Build the corrected uncategorized_transaction update ───────────────
    const finalType = transaction_type || existingTxn?.transaction_type;
    const finalAmount = amount !== undefined ? parseFloat(Number(amount).toFixed(2)) : (existingTxn?.amount);

    const uncatUpdate = {
      status: 'PENDING'
    };

    if (finalType === 'DEBIT') {
      uncatUpdate.debit = finalAmount;
      uncatUpdate.credit = null;
    } else {
      uncatUpdate.credit = finalAmount;
      uncatUpdate.debit = null;
    }

    const { error: uncatUpdateError } = await supabase
      .from('uncategorized_transactions')
      .update(uncatUpdate)
      .eq('uncategorized_transaction_id', uncategorized_transaction_id)
      .eq('user_id', userId);

    if (uncatUpdateError) {
      console.error('correctTransaction uncategorized update error:', uncatUpdateError);
      return res.status(500).json({ error: 'Failed to update source transaction.' });
    }

    console.log(`✅ Transaction corrected: uncategorized_transaction_id=${uncategorized_transaction_id}, type=${finalType}, amount=${finalAmount}`);

    return res.status(200).json({
      success: true,
      message: 'Transaction corrected and reset to PENDING. Please re-categorize.',
      corrected: {
        uncategorized_transaction_id,
        transaction_type: finalType,
        amount: finalAmount
      }
    });

  } catch (err) {
    console.error('Unexpected error in correctTransaction:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = {
  recategorizeTransaction,
  approveTransaction,
  bulkApproveTransactions,
  manualCategorizeTransaction,
  correctTransaction
};
