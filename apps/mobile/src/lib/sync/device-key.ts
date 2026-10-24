import * as SecureStore from "expo-secure-store"

// Where this phone's device key lives (SecureStore). Its own tiny module so
// the auth client can send the key at sign-in (ADR-018) without importing the
// sync layer — device.ts → api-fetch → auth-client would otherwise loop.
export const DEVICE_TOKEN_KEY = "pharmatrack_device_token"

export async function readDeviceToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(DEVICE_TOKEN_KEY)
  } catch {
    return null
  }
}
