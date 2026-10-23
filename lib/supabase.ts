import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => Platform.OS === "web" ? Promise.resolve(typeof localStorage === "undefined" ? null : localStorage.getItem(key)) : SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => Platform.OS === "web" ? Promise.resolve(typeof localStorage === "undefined" ? undefined : localStorage.setItem(key, value)) : SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => Platform.OS === "web" ? Promise.resolve(typeof localStorage === "undefined" ? undefined : localStorage.removeItem(key)) : SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// アプリが前に出ているあいだだけログインを自動更新する（Supabase の React Native の手順どおり）。
// これがないと、裏に回していた間に期限が切れたまま問い合わせ、資料などが0件に見える。
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
