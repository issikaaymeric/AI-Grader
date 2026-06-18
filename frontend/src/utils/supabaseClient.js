import { createClient } from '@supabase/supabase-js';

// Retrieve these from your environment variables
// Ensure these are set in your .env file as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

// Export as a named export
export const supabase = createClient(supabaseUrl, supabaseAnonKey);