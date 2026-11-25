
import { createClient } from "@supabase/supabase-js";

// URLに ?test=1 が付いているか確認
export const isTestMode =
  new URLSearchParams(window.location.search).get("test") === "1";

// モードに応じて接続先を切り替える
const supabaseUrl = isTestMode
  ? import.meta.env.VITE_SUPABASE_TEST_URL
  : import.meta.env.VITE_SUPABASE_URL;

const supabaseKey = isTestMode
  ? import.meta.env.VITE_SUPABASE_TEST_PUBLISHABLE_KEY
  : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
