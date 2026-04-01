const supabase = require('../config/supabaseClient'); 
require('dotenv').config();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || `http://127.0.0.1:${process.env.PYTHON_PORT || 5000}`;

/**
 * deleteModule
 * Deletes global coa_module and its cascading templates safely bypassing RLS
 */
const deleteModule = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing module id in request' });

    // 1. Delete associated templates first
    const { error: tmpError } = await supabase
      .from('coa_templates')
      .delete()
      .eq('module_id', id);

    if (tmpError) throw tmpError;

    // 2. Delete the module
    const { error: modError } = await supabase
      .from('coa_modules')
      .delete()
      .eq('module_id', id);

    if (modError) throw modError;

    return res.status(200).json({ success: true, message: 'Module and associated templates deleted successfully.' });

  } catch (err) {
    console.error('❌ deleteModule exception:', err);
    return res.status(500).json({ error: 'Internal server error executing deletion.' });
  }
};

// ─── Global Keyword Rules Management ──────────────────────────────────────────

const getGlobalKeywordRules = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('global_keyword_rules')
      .select('*')
      .order('keyword', { ascending: true });

    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    console.error('❌ getGlobalKeywordRules error:', err);
    return res.status(500).json({ error: 'Failed to fetch global keyword rules' });
  }
};

const createKeywordRule = async (req, res) => {
  try {
    const { keyword, target_template_id, match_type, priority, is_active } = req.body;
    
    if (!keyword) return res.status(400).json({ error: 'Keyword is required' });

    const { data, error } = await supabase
      .from('global_keyword_rules')
      .insert([
        { 
          keyword: keyword.trim().toUpperCase(), 
          target_template_id, 
          match_type: match_type || 'CONTAINS', 
          priority: priority || 90, 
          is_active: is_active !== undefined ? is_active : true,
          hit_count: 0
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    console.error('❌ createKeywordRule error:', err);
    return res.status(500).json({ error: 'Failed to create keyword rule' });
  }
};

const deleteKeywordRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('global_keyword_rules')
      .delete()
      .eq('keyword_id', id);

    if (error) throw error;
    return res.status(200).json({ success: true, message: 'Keyword rule deleted' });
  } catch (err) {
    console.error('❌ deleteKeywordRule error:', err);
    return res.status(500).json({ error: 'Failed to delete keyword rule' });
  }
};

// ─── Global Vector Cache Management ───────────────────────────────────────────

const getGlobalVectorCache = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('global_vector_cache')
      .select('cache_id, clean_name, target_template_id, approval_count, is_verified, created_at, updated_at')
      .order('cache_id', { ascending: true });

    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    console.error('❌ getGlobalVectorCache error:', err);
    return res.status(500).json({ error: 'Failed to fetch global vector cache' });
  }
};

const createVectorCacheEntry = async (req, res) => {
  try {
    const { clean_name, target_template_id } = req.body;
    if (!clean_name) return res.status(400).json({ error: 'clean_name is required.' });

    const uppercaseName = clean_name.trim().toUpperCase();

    // 1. Check for duplicates
    const { data: existing } = await supabase
      .from('global_vector_cache')
      .select('cache_id')
      .eq('clean_name', uppercaseName)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: `"${uppercaseName}" already exists in the vector cache.` });
    }

    // 2. Generate embedding via ML service
    const embedResponse = await fetch(`${ML_SERVICE_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: uppercaseName })
    });

    if (!embedResponse.ok) {
      throw new Error(`Embedding service failed with status: ${embedResponse.status}`);
    }

    const { embedding } = await embedResponse.json();
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Failed to retrieve 384-dimensional array embedding');
    }

    // 3. Insert into DB
    const { data, error } = await supabase
      .from('global_vector_cache')
      .insert([
        {
          clean_name: uppercaseName,
          target_template_id,
          embedding: embedding, // Supabase can handle array to vector conversion if configured correctly or if using RPC/direct insert
          approval_count: 1,
          is_verified: false
        }
      ])
      .select('cache_id, clean_name, target_template_id, approval_count, is_verified, created_at, updated_at')
      .single();

    if (error) throw error;
    return res.status(201).json(data);

  } catch (err) {
    console.error('❌ createVectorCacheEntry error:', err);
    return res.status(500).json({ error: 'Failed to create vector cache entry: ' + err.message });
  }
};

const deleteVectorCacheEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('global_vector_cache')
      .delete()
      .eq('cache_id', id);

    if (error) throw error;
    return res.status(200).json({ success: true, message: 'Vector cache entry deleted' });
  } catch (err) {
    console.error('❌ deleteVectorCacheEntry error:', err);
    return res.status(500).json({ error: 'Failed to delete vector cache entry' });
  }
};

module.exports = { 
  deleteModule,
  getGlobalKeywordRules,
  createKeywordRule,
  deleteKeywordRule,
  getGlobalVectorCache,
  createVectorCacheEntry,
  deleteVectorCacheEntry
};

