// src/services/supabase.js
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://gmwqcbqrhxnulrppngdf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdtd3FjYnFyaHhudWxycHBuZ2RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NTgzMjMsImV4cCI6MjA4MzEzNDMyM30.2kX8oxzPPsSilNrQ4TyhE2WiZ3fBZrB8lqVUoyuB0dA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export default supabase;