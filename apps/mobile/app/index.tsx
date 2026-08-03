import { Redirect } from "expo-router"
import { ActivityIndicator, View } from "react-native"
import { useSession } from "../src/lib/auth-client"
import { useTheme } from "../src/theme/useTheme"

export default function Index() {
  const theme = useTheme()
  const { data, isPending } = useSession()

  if (isPending) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.green} />
      </View>
    )
  }

  return <Redirect href={data?.session ? "/pos" : "/login"} />
}
